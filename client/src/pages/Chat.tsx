import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { MessageCircle, Send, Bot, User, Zap, Brain } from "lucide-react";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  agentName?: string;
  timestamp: Date;
  isTyping?: boolean;
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [selectedAgent, setSelectedAgent] = useState<string>("all");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { data: user } = trpc.auth.me.useQuery();
  const { data: agents } = trpc.agents.list.useQuery();

  const chatMutation = trpc.chat.send.useMutation();

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsLoading(true);

    // Add typing indicator (single shared pending ID so removal is reliable)
    const pendingId = `pending-${userMsg.id}`;
    setMessages(prev => [...prev, {
      id: pendingId,
      role: "assistant",
      content: "",
      agentName: selectedAgent !== "all" ? selectedAgent : "NEXUS",
      timestamp: new Date(),
      isTyping: true,
    }]);

    try {
      const result = await chatMutation.mutateAsync({ message: input.trim(), agent: selectedAgent });
      setMessages(prev => {
        const updated = prev.filter(m => m.id !== pendingId);
        return [...updated, {
          id: `${Date.now()}-response`,
          role: "assistant",
          content: result.response,
          agentName: selectedAgent !== "all" ? selectedAgent : "NEXUS",
          timestamp: new Date(),
        }];
      });
    } catch (error) {
      setMessages(prev => {
        const updated = prev.filter(m => m.id !== pendingId);
        return [...updated, {
          id: `${Date.now()}-error`,
          role: "assistant",
          content: `Erro: ${String(error)}`,
          timestamp: new Date(),
        }];
      });
    }
    setIsLoading(false);
  };

  return (
    <div className="flex flex-col h-[calc(100vh-120px)] animate-fade-in">
      {/* Header */}
      <div className="space-y-1 mb-4">
        <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
          <MessageCircle className="h-5 w-5 text-[#7cf3ff]" />
          Chat com Agentes
        </h2>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">
          Conversa interativa com o ecossistema cognitivo
        </p>
      </div>

      {/* Agent Selector */}
      <div className="nexus-card p-3 mb-4 flex items-center gap-3 flex-wrap">
        <Brain className="h-4 w-4 text-[#c9b8ff]" />
        <span className="text-[9px] font-mono text-[#7684a0] tracking-wider">AGENTE:</span>
        <select
          value={selectedAgent}
          onChange={e => setSelectedAgent(e.target.value)}
          className="bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-[10px] font-mono rounded px-2 py-1.5 focus:outline-none focus:border-[#7cf3ff]/30"
        >
          <option value="all">Todos os Agentes (NEXUS)</option>
          {agents?.map(a => (
            <option key={a.id} value={a.name}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 mb-4 p-1">
        {messages.length === 0 && (
          <div className="h-full flex items-center justify-center">
            <div className="text-center space-y-3">
              <Bot className="h-10 w-10 text-[#7cf3ff]/30 mx-auto" />
              <p className="text-[11px] font-mono text-[#7684a0]">
                Inicie uma conversa com o NEXUS
              </p>
              <p className="text-[9px] font-mono text-[#7684a0]/60">
                Pergunte sobre missões, agentes, memória ou qualquer assunto
              </p>
            </div>
          </div>
        )}
        {messages.map(msg => (
          <div key={msg.id} className={`flex gap-3 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
            {msg.role === "assistant" && (
              <div className="shrink-0 w-7 h-7 rounded-full bg-[#c9b8ff]/10 border border-[#c9b8ff]/20 flex items-center justify-center">
                <Bot className="h-3.5 w-3.5 text-[#c9b8ff]" />
              </div>
            )}
            <div className={`max-w-[70%] rounded-lg px-4 py-3 ${
              msg.role === "user"
                ? "bg-[#7cf3ff]/10 border border-[#7cf3ff]/20"
                : "bg-[rgba(3,5,14,0.6)] border border-[rgba(150,175,220,0.08)]"
            }`}>
              {msg.agentName && msg.role === "assistant" && (
                <p className="text-[8px] font-mono text-[#c9b8ff] mb-1">{msg.agentName}</p>
              )}
              <p className="text-xs font-mono text-[#e2e8f4] whitespace-pre-wrap">
                {msg.content || (msg.isTyping ? "Pensando..." : "")}
                {msg.isTyping && msg.content === "" && <span className="animate-pulse">▌</span>}
              </p>
              <p className="text-[7px] font-mono text-[#7684a0] mt-1">
                {msg.timestamp.toLocaleTimeString()}
              </p>
            </div>
            {msg.role === "user" && (
              <div className="shrink-0 w-7 h-7 rounded-full bg-[#7cf3ff]/10 border border-[#7cf3ff]/20 flex items-center justify-center">
                <User className="h-3.5 w-3.5 text-[#7cf3ff]" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="nexus-card p-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && !e.shiftKey && handleSend()}
            placeholder="Fale com o NEXUS..."
            className="flex-1 bg-transparent border border-[rgba(150,175,220,0.12)] rounded-lg px-4 py-3 text-sm text-[#e2e8f4] placeholder:text-[#7684a0]/50 focus:outline-none focus:border-[#7cf3ff]/30 font-mono"
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="nexus-card px-5 py-3 text-[#7cf3ff] hover:bg-[#7cf3ff]/10 disabled:opacity-30 font-mono text-xs flex items-center gap-2 transition-colors"
          >
            {isLoading ? <Zap className="h-4 w-4 animate-pulse" /> : <Send className="h-4 w-4" />}
            ENVIAR
          </button>
        </div>
      </div>
    </div>
  );
}
