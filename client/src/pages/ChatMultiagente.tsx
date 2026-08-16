import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Streamdown } from "streamdown";
import { Bot, Send, Brain, Zap, Wifi, WifiOff } from "lucide-react";
import { COOKIE_NAME } from "@/const";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentName?: string;
  timestamp: Date;
  isTyping?: boolean;
  ragNotes?: number;
  isStreaming?: boolean;
  // Fase 20 — mensagem de orientação sobre cota exaurida do LLM (412)
  isQuotaError?: boolean;
}

/** Retorna o token da sessão quando o cookie não está disponível (ex.: iframe preview). */
function getSessionToken(): string | null {
  try {
    const raw = sessionStorage.getItem("manus-cookie");
    if (raw) {
      const prefix = `${COOKIE_NAME}=`;
      const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
      const token = pair?.trim().slice(prefix.length);
      if (token) return token;
    }
  } catch {
    /* sessionStorage indisponível */
  }
  return null;
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
  const abortRef = useRef<AbortController | null>(null);

  const { data: agents } = trpc.chat.multiAgentAgents.useQuery();
  const chatMutation = trpc.chat.multiAgent.useMutation();
  const [streamMode, setStreamMode] = useState(true);
  const [isOnline, setIsOnline] = useState(true);

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
    try {
      if (streamMode) {
        const ok = await streamChat(pendingId, text, ragEnabled ? history : undefined);
        if (!ok) {
          // Falha no SSE: recai automaticamente para o tRPC (Fase 19)
          await tRpcFallback(pendingId, text, ragEnabled ? history : undefined);
        }
      } else {
        await tRpcFallback(pendingId, text, ragEnabled ? history : undefined);
      }
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
  };

  /** Fase 19 — streaming SSE com efeito de digitação; resolve `true` no sucesso. */
  const streamChat = useCallback(
    async (
      pendingId: string,
      text: string,
      history?: { role: "user" | "assistant"; content: string }[],
    ): Promise<boolean> => {
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      const params = new URLSearchParams({
        message: text,
        agent: selectedAgent === "NEXUS" ? "all" : selectedAgent,
      });
      if (history?.length) params.set("history", JSON.stringify(history));
      const headers: Record<string, string> = {};
      const token = getSessionToken();
      if (token) headers.Authorization = `Bearer ${token}`;
      try {
        const res = await fetch(`/api/chat/ask-stream?${params.toString()}`, {
          headers,
          credentials: "include",
          signal: abortRef.current.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        if (!res.body) throw new Error("Sem corpo de resposta");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let ragNotes: number | undefined;
        let started = false;
        let accumulated = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data:")) continue;
            let data: any;
            try {
              data = JSON.parse(line.slice(5));
            } catch {
              continue;
            }
            if (data.type === "context") {
              ragNotes = data.ragNotes;
              continue;
            }
            // Fase 20 — cota do LLM embutido exaurida (412): exibe orientação
            // de troca de provedor e encerra o stream sem fallback tRPC
            if (data.type === "quota") {
              setMessages(prev => {
                const rest = prev.filter(m => m.id !== pendingId);
                return [
                  ...rest,
                  {
                    id: `${Date.now()}-a`,
                    role: "assistant",
                    content: data.message ?? "Limite de uso do LLM embutido exaurido — configure um provedor próprio em Config (OpenAI, Anthropic, Groq, QwenCloud ou Ollama) para continuar.",
                    agentName: selectedAgent,
                    timestamp: new Date(),
                    isQuotaError: true,
                    ragNotes,
                  },
                ];
              });
              return true;
            }
            if (data.type === "chunk") {
              accumulated += data.text ?? "";
              if (!started) {
                started = true;
                // Sai do estado "pensando..." no primeiro chunk — a bolha
                // nunca mais fica travada no estado de thinking (Fase 19).
                setMessages(prev =>
                  prev.map(m => (m.id === pendingId ? { ...m, isTyping: false, isStreaming: true, content: accumulated } : m)),
                );
              } else {
                setMessages(prev =>
                  prev.map(m => (m.id === pendingId ? { ...m, content: accumulated } : m)),
                );
              }
              continue;
            }
            if (data.type === "error") {
              throw new Error(String(data.message ?? "Erro no stream"));
            }
            if (data.type === "done") {
              setMessages(prev => {
                const rest = prev.filter(m => m.id !== pendingId);
                return [
                  ...rest,
                  {
                    id: `${Date.now()}-a`,
                    role: "assistant",
                    content: data.response ?? accumulated,
                    agentName: data.agentName ?? selectedAgent,
                    timestamp: new Date(),
                    ragNotes,
                  },
                ];
              });
              return true;
            }
          }
        }
        // Stream fechou sem evento "done": finaliza com o acumulado
        setMessages(prev => {
          const rest = prev.filter(m => m.id !== pendingId);
          return [
            ...rest,
            {
              id: `${Date.now()}-a`,
              role: "assistant",
              content: accumulated,
              agentName: selectedAgent,
              timestamp: new Date(),
              ragNotes,
            },
          ];
        });
        return true;
      } catch (error) {
        if (abortRef.current?.signal.aborted) return false;
        console.warn("[Chat] SSE falhou, usando fallback tRPC:", error);
        // Remove a bolha pendente para o fallback recriar
        setMessages(prev => prev.filter(m => m.id !== pendingId));
        return false;
      }
    },
    [selectedAgent],
  );

  /** Fallback tRPC síncrono (Fase 19) quando o streaming não estiver disponível. */
  const tRpcFallback = useCallback(
    async (
      pendingId: string,
      text: string,
      history?: { role: "user" | "assistant"; content: string }[],
    ) => {
      const result = await chatMutation.mutateAsync({
        message: text,
        agent: selectedAgent === "NEXUS" ? "all" : selectedAgent,
        history,
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
    },
    [chatMutation, selectedAgent],
  );

  useEffect(() => () => abortRef.current?.abort(), []);

  useEffect(() => {
    const update = () => setIsOnline(navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

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
          <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer" title="Fase 19 — resposta ao vivo (streaming SSE)">
            <input
              type="checkbox"
              checked={streamMode}
              onChange={e => setStreamMode(e.target.checked)}
              className="accent-cyan-400"
            />
            Streaming
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
                  : msg.isQuotaError
                    ? "bg-amber-500/10 border-amber-500/40"
                    : `bg-gradient-to-br ${AGENT_COLORS[msg.agentName ?? "NEXUS"] ?? "from-cyan-500/20 to-cyan-600/5 border-cyan-400/40"}`
              }`}
            >
              {msg.role === "assistant" && msg.agentName && (
                <div className="flex items-center gap-1.5 mb-1.5 text-[10px] uppercase tracking-wider text-purple-300/80 font-semibold">
                  <Zap className="h-3 w-3" />
                  {msg.agentName}
                  {msg.isQuotaError && <span className="ml-1 text-amber-300 normal-case">⚠ limite do LLM exaurido</span>}
                  {msg.isTyping && <span className="ml-1 text-slate-400 normal-case">pensando...</span>}
                  {msg.isStreaming && <span className="ml-1 text-cyan-300/80 normal-case">digitando...</span>}
                  {!msg.isTyping && msg.ragNotes !== undefined && msg.ragNotes > 0 && (
                    <span className="ml-1 text-[10px] normal-case text-emerald-300/80">
                      ({msg.ragNotes} nota{msg.ragNotes > 1 ? "s" : ""} da Memória)
                    </span>
                  )}
                </div>
              )}
              {msg.isTyping ? (
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
            disabled={!input.trim() || chatMutation.isPending}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-r from-purple-500 to-cyan-500 text-black transition-transform duration-100 hover:scale-105 active:scale-95 disabled:opacity-40 disabled:hover:scale-100"
            aria-label="Enviar"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
          <span>
            As mensagens e respostas são registradas na Memória. Histórico da sessão (últimos 20 turnos) é enviado como contexto.
          </span>
          <span className="flex items-center gap-1.5">
            {isOnline ? <Wifi className="h-3 w-3 text-emerald-400/70" /> : <WifiOff className="h-3 w-3 text-red-400/70" />}
            {isOnline ? "online" : "offline — cache PWA ativo"}
          </span>
        </div>
      </div>
    </div>
  );
}
