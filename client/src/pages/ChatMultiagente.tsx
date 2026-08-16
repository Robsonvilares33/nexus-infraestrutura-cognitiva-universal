import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { toast } from "sonner";

// Fase 19 — streaming SSE das respostas do chat multiagente com fallback síncrono.
interface StreamCallbacks {
  onChunk: (text: string) => void;
  onDone: (meta: { agentName: string; ragNotes: number }) => void;
  onError: (err: string) => void;
}

function streamChat(
  signal: AbortSignal,
  message: string,
  agent: string,
  history: { role: "user" | "assistant"; content: string }[],
  cb: StreamCallbacks,
): void {
  const params = new URLSearchParams({
    message,
    agent,
    history: history.length > 0 ? JSON.stringify(history) : "",
  });
  const evt = new EventSource(`/api/chat/ask-stream?${params.toString()}`, { withCredentials: true });
  let closed = false;
  signal.addEventListener("abort", () => { if (!closed) { closed = true; evt.close(); } });
  evt.onmessage = e => {
    const data = e.data;
    try {
      const json = JSON.parse(data);
      if (typeof json.text === "string") cb.onChunk(json.text);
      else if (json.done || json.agentName !== undefined) cb.onDone({ agentName: json.agentName ?? "NEXUS", ragNotes: json.ragNotes ?? 0 });
      else if (json.error) { closed = true; evt.close(); cb.onError(String(json.error.message ?? json.error)); }
    } catch { /* malformed chunk — ignore */ }
  };
  evt.addEventListener("chunk", e => {
    try {
      const json = JSON.parse(e.data);
      if (typeof json.text === "string") cb.onChunk(json.text);
    } catch { /* ignore */ }
  });
  evt.addEventListener("done", e => {
    closed = true;
    evt.close();
    try {
      const json = JSON.parse(e.data);
      cb.onDone({ agentName: json.agentName ?? "NEXUS", ragNotes: json.ragNotes ?? 0 });
    } catch { cb.onDone({ agentName: "NEXUS", ragNotes: 0 }); }
  });
  evt.addEventListener("error", () => {
    if (!closed) {
      closed = true;
      evt.close();
      cb.onError("STREAM_UNAVAILABLE");
    }
  });
  // Segurança: fecha após 2 minutos mesmo sem evento done
  setTimeout(() => { if (!closed) { closed = true; evt.close(); cb.onError("STREAM_TIMEOUT"); } }, 2 * 60 * 1000);
}
import { Streamdown } from "streamdown";
import { Bot, Send, Brain, Zap } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentName?: string;
  timestamp: Date;
  isTyping?: boolean;
  ragNotes?: number;
}

const AGENT_COLORS: Record<string, string> = {
  "Sincronia": "from-cyan-500/20 to-cyan-600/5 border-cyan-400/40",
  "Pesquisa": "from-blue-500/20 to-blue-600/5 border-blue-400/40",
  "Memória": "from-purple-500/20 to-purple-600/5 border-purple-400/40",
  "Código": "from-emerald-500/20 to-emerald-600/5 border-emerald-400/40",
  "Planejamento": "from-amber-500/20 to-amber-600/5 border-amber-400/40",
  "Crítica": "from-red-500/20 to-red-600/5 border-red-400/40",
  "Síntese": "from-teal-500/20 to-teal-600/5 border-teal-400/40",
  "Execução": "from-orange-500/20 to-orange-600/5 border-orange-400/40",
  "Comunicação": "from-pink-500/20 to-pink-600/5 border-pink-400/40",
};

export default function ChatMultiagente() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [selectedAgent, setSelectedAgent] = useState<string>("NEXUS");
  const [ragEnabled, setRagEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: agents } = trpc.chat.multiAgentAgents.useQuery();
  const chatMutation = trpc.chat.multiAgent.useMutation();
  const abortRef = useRef<AbortController | null>(null);
  const streamingRef = useRef(false);

  // Fase 19 — envio com streaming SSE; cai para a mutation síncrona se o
  // stream falhar (offline, proxy ou erro de rede).
  const sendWithStreaming = (
    text: string,
    agentArg: string,
    history: { role: "user" | "assistant"; content: string }[],
    pendingId: string,
  ): void => {
    streamingRef.current = true;
    abortRef.current = new AbortController();
    let responseText = "";
    let meta = { agentName: "NEXUS", ragNotes: 0 };
    streamChat(
      abortRef.current.signal,
      text,
      agentArg,
      history,
      {
        onChunk: text => {
          responseText += text;
          setMessages(prev =>
            prev.map(m => (m.id === pendingId ? { ...m, content: responseText } : m))
          );
        },
        onDone: m => {
          streamingRef.current = false;
          meta = m;
          setMessages(prev =>
            prev.map(m => (m.id === pendingId ? { ...m, ragNotes: m.ragNotes ?? m.ragNotes, done: true } : m))
          );
        },
        onError: err => {
          streamingRef.current = false;
          if (err === "STREAM_UNAVAILABLE" || err === "STREAM_TIMEOUT") {
            // Fallback síncrono: mutation tRPC
            chatMutation
              .mutateAsync({ message: text, agent: agentArg, history })
              .then(result => {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === pendingId
                      ? { ...m, content: result.response, agentName: result.agentName, ragNotes: result.ragNotes }
                      : m
                  )
                );
              })
              .catch(() => {
                setMessages(prev =>
                  prev.map(m =>
                    m.id === pendingId
                      ? { ...m, content: responseText || `Erro ao consultar o agente: ${err}` }
                      : m
                  )
                );
              });
          } else {
            setMessages(prev =>
              prev.map(m => (m.id === pendingId ? { ...m, content: responseText || `Erro ao consultar o agente: ${err}` } : m))
            );
          }
        },
      }
    );
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    const text = input.trim();
    if (!text || chatMutation.isPending) return;
    const userMsg: ChatMessage = {
      id: `${Date.now()}-u`,
      role: "user",
      content: text,
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    const history = messages
      .filter(m => !m.isTyping)
      .slice(-20)
      .map(m => ({ role: m.role, content: m.content }));
    const pendingId = `pending-${userMsg.id}`;
    setMessages(prev => [
      ...prev,
      {
        id: pendingId,
        role: "assistant",
        content: "",
        agentName: selectedAgent,
        timestamp: new Date(),
        isTyping: true,
      },
    ]);
    if (!window.EventSource) {
      // Navegador sem SSE: mutation síncrona tradicional
      try {
        const result = await chatMutation.mutateAsync({
          message: text,
          agent: selectedAgent === "NEXUS" ? "all" : selectedAgent,
          history: ragEnabled ? history : undefined,
        });
        setMessages(prev => {
          const updated = prev.filter(m => m.id !== pendingId);
          return [
            ...updated,
            {
              id: `${Date.now()}-a`,
              role: "assistant",
              content: result.response,
              agentName: result.agentName,
              timestamp: new Date(),
              ragNotes: result.ragNotes,
            },
          ];
        });
      } catch (error) {
        setMessages(prev => {
          const updated = prev.filter(m => m.id !== pendingId);
          return [
            ...updated,
            {
              id: `${Date.now()}-err`,
              role: "assistant",
              content: `Erro ao consultar o agente: ${String(error)}`,
              agentName: selectedAgent,
              timestamp: new Date(),
            },
          ];
        });
      }
      return;
    }
    // Fase 19: streaming SSE com chunks ao vivo
    sendWithStreaming(
      text,
      selectedAgent === "NEXUS" ? "all" : selectedAgent,
      ragEnabled ? history : [],
      pendingId,
    );
  };

  const handleKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)]">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-cyan-500/20 bg-black/40">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500/30 to-cyan-500/30 border border-purple-400/40">
            <Brain className="h-5 w-5 text-purple-300" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-cyan-100" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Chat Multiagente
            </h1>
            <p className="text-xs text-slate-400">
              Agentes especializados com acesso à Super Memória ({ragEnabled ? "RAG ativo" : "RAG desligado"})
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={ragEnabled}
              onChange={e => setRagEnabled(e.target.checked)}
              className="accent-cyan-400"
            />
            Super Memória
          </label>
        </div>
      </div>

      {/* Agent selector */}
      <div className="flex gap-2 overflow-x-auto px-5 py-3 border-b border-slate-700/50 bg-black/20 scrollbar-thin">
        {["NEXUS", ...(agents ?? []).map(a => a.name)].map(name => (
          <button
            key={name}
            onClick={() => setSelectedAgent(name)}
            className={`flex-shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all duration-150 ${
              selectedAgent === name
                ? `bg-gradient-to-r ${AGENT_COLORS[name] ?? "from-cyan-500/20 to-cyan-600/5 border-cyan-400/40"} text-cyan-100`
                : "border-slate-700/60 text-slate-400 hover:text-slate-200 hover:border-slate-600"
            }`}
          >
            {name}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center text-slate-400">
            <Bot className="h-12 w-12 mb-3 text-purple-400/60" />
            <p className="text-sm font-medium" style={{ fontFamily: "'Space Grotesk', sans-serif" }}>
              Converse com os agentes especializados do NEXUS
            </p>
            <p className="text-xs mt-1 max-w-md">
              Cada agente domina uma área. As respostas consultam automaticamente suas notas da Super Memória
              quando o RAG está ativo.
            </p>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            <div
              className={`max-w-[80%] rounded-xl border px-4 py-3 ${
                msg.role === "user"
                  ? "bg-cyan-500/10 border-cyan-500/30"
                  : `bg-gradient-to-br ${AGENT_COLORS[msg.agentName ?? "NEXUS"] ?? "from-cyan-500/20 to-cyan-600/5 border-cyan-400/40"}`
              }`}
            >
              {msg.role === "assistant" && msg.agentName && (
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-wider text-purple-300/80 font-semibold">
                  <Zap className="h-3 w-3" />
                  {msg.agentName}
                  {msg.isTyping && !msg.content && <span className="ml-1 text-slate-400 normal-case">pensando...</span>}
                  {msg.isTyping && msg.content && <span className="ml-1 text-emerald-300/80 normal-case animate-pulse">●</span>}
                  {!msg.isTyping && msg.ragNotes !== undefined && msg.ragNotes > 0 && (
                    <span className="ml-1 text-[10px] normal-case text-emerald-300/80">
                      ({msg.ragNotes} nota{msg.ragNotes > 1 ? "s" : ""} da Memória)
                    </span>
                  )}
                </div>
              )}
              {msg.isTyping && !msg.content ? (
                // Fase 19 — enquanto nenhum chunk chega, mostra "pensando";
                // assim que o primeiro chunk chega, o texto é renderizado ao vivo.
                <div className="flex gap-1 py-1">
                  <span className="h-2 w-2 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="h-2 w-2 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: "120ms" }} />
                  <span className="h-2 w-2 rounded-full bg-purple-400/60 animate-bounce" style={{ animationDelay: "240ms" }} />
                </div>
              ) : (
                <div className="text-sm text-slate-100 prose prose-invert prose-sm max-w-none">
                  <Streamdown>{msg.content}</Streamdown>
                </div>
              )}
              <div className="text-[10px] text-slate-500 mt-1.5">
                {msg.timestamp.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
              </div>
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="px-5 py-4 border-t border-slate-700/50 bg-black/40">
        <div className="flex items-end gap-3 rounded-xl border border-slate-700/60 bg-slate-900/60 px-4 py-2 focus-within:border-purple-400/60 transition-colors">
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder={`Pergunte algo ao ${selectedAgent}... (Enter para enviar, Shift+Enter para nova linha)`}
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm text-slate-100 placeholder:text-slate-500 outline-none max-h-32"
          />
          <button
            onClick={() => void handleSend()}
            disabled={!input.trim() || chatMutation.isPending || streamingRef.current}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-purple-500 to-cyan-500 text-black transition-transform duration-100 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <p className="mt-2 text-[10px] text-slate-500">
          As mensagens e respostas são registradas na Memória. Histórico da sessão (últimos 20 turnos) é enviado como contexto. A resposta chega ao vivo por streaming.
        </p>
      </div>
    </div>
  );
}
