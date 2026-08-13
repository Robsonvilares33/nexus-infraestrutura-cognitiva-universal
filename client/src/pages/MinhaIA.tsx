import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { Brain, Send, Zap, Bot, CheckCircle2, AlertTriangle, Clock } from "lucide-react";
import { io, Socket } from "socket.io-client";

interface LiveEvent {
  eventType: string;
  message: string;
  confidence?: string | number;
  agentName?: string;
  createdAt?: Date;
  timestamp?: number;
}

export default function MinhaIA() {
  const { data: missions, refetch: refetchMissions } = trpc.missions.list.useQuery();
  const { data: feed } = trpc.feed.list.useQuery({ limit: 50 });
  const createMutation = trpc.missions.create.useMutation();
  const executeMutation = trpc.missions.execute.useMutation();
  const [input, setInput] = useState("");
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const feedRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const { data: user } = trpc.auth.me.useQuery();

  // Connect WebSocket for real-time updates
  useEffect(() => {
    if (!user?.id) return;
    const socket = io(window.location.origin, {
      path: "/socket.io/",
      query: { userId: String(user.id) },
      transports: ["websocket", "polling"],
    });
    socketRef.current = socket;

    socket.on("cognitive:feed", (data: LiveEvent) => {
      setLiveEvents(prev => [...prev, { ...data, createdAt: new Date(data.timestamp || Date.now()) }]);
    });

    socket.on("mission:update", () => {
      refetchMissions();
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [user?.id]);

  useEffect(() => {
    if (feedRef.current) feedRef.current.scrollTop = feedRef.current.scrollHeight;
  }, [feed, liveEvents]);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLiveEvents([]);
    const result = await createMutation.mutateAsync({ input: input.trim() });
    const mid = (result as any)?.insertId;
    // Add initial event immediately
    setLiveEvents(prev => [...prev, {
      eventType: "mission",
      message: `Missão recebida: ${input.trim()}`,
      createdAt: new Date(),
    }]);
    await executeMutation.mutateAsync({ missionId: mid, input: input.trim() });
    setInput("");
    refetchMissions();
  };

  // Merge live events with DB feed (dedupe by message)
  const liveMessages = new Set(liveEvents.map(e => e.message));
  const dbEvents = feed?.filter(f => !liveMessages.has(f.message)) || [];
  const allEvents = [...liveEvents, ...dbEvents.map(f => ({
    eventType: f.eventType,
    message: f.message,
    confidence: f.confidence,
    agentName: f.agentName,
    createdAt: new Date(f.createdAt),
  }))];

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
          <Brain className="h-5 w-5 text-[#c9b8ff]" />
          Minha IA
        </h2>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">
          Monitor cognitivo — processo de raciocínio em tempo real
        </p>
      </div>

      {/* Mission Input */}
      <div className="nexus-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap className="h-4 w-4 text-[#7cf3ff]" />
          <span className="text-xs font-mono text-[#7684a0] tracking-wider">ENTREGAR MISSÃO</span>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && handleSubmit()}
            placeholder="Descreva sua missão em linguagem natural..."
            className="flex-1 nexus-card px-4 py-3 text-sm text-[#e2e8f4] placeholder:text-[#7684a0]/50 focus:outline-none focus:border-[#7cf3ff]/30 font-mono bg-transparent"
          />
          <button
            onClick={handleSubmit}
            disabled={!input.trim() || createMutation.isPending || executeMutation.isPending}
            className="nexus-card px-6 py-3 text-[#7cf3ff] hover:bg-[#7cf3ff]/10 disabled:opacity-30 font-mono text-xs flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            EXECUTAR
          </button>
        </div>
      </div>

      {/* Cognitive Feed */}
      <div className="nexus-card p-4">
        <div className="flex items-center gap-2 mb-3">
          <Bot className="h-4 w-4 text-[#c9b8ff]" />
          <span className="text-xs font-mono text-[#7684a0] tracking-wider">FEED COGNITIVO</span>
          {(createMutation.isPending || executeMutation.isPending) && (
            <span className="nexus-chip nexus-chip-pending animate-pulse">● AO VIVO</span>
          )}
          {liveEvents.length > 0 && (
            <span className="nexus-chip nexus-chip-online">{liveEvents.length} eventos</span>
          )}
        </div>
        <div ref={feedRef} className="h-64 overflow-y-auto space-y-2 pr-2 scroll-smooth">
          {allEvents.length > 0 ? allEvents.map((event, i) => (
            <div
              key={`${event.message}-${i}`}
              className={`flex items-start gap-2 px-3 py-2 rounded border transition-all duration-300 ${
                liveMessages.has(event.message)
                  ? "border-[#7cf3ff]/30 bg-[#7cf3ff]/5 animate-pulse"
                  : "border-[rgba(150,175,220,0.04)] bg-[rgba(3,5,14,0.4)]"
              }`}
            >
              {event.eventType === 'mission' && <Zap className="h-3 w-3 text-[#7cf3ff] mt-0.5 shrink-0" />}
              {event.eventType === 'agent' && <Bot className="h-3 w-3 text-[#c9b8ff] mt-0.5 shrink-0" />}
              {event.eventType === 'result' && <CheckCircle2 className="h-3 w-3 text-[#3fe7b0] mt-0.5 shrink-0" />}
              {event.eventType === 'plan' && <Clock className="h-3 w-3 text-[#ffd479] mt-0.5 shrink-0" />}
              {event.eventType === 'complete' && <CheckCircle2 className="h-3 w-3 text-[#3fe7b0] mt-0.5 shrink-0" />}
              <div className="flex-1">
                <p className="text-[10px] font-mono text-[#aab4d6]">{event.message}</p>
                {event.agentName && <span className="text-[8px] font-mono text-[#7684a0]">[{event.agentName}]</span>}
                {event.confidence && (
                  <span className="text-[8px] font-mono text-[#3fe7b0] ml-2">
                    {Math.round(parseFloat(String(event.confidence)) * 100)}%
                  </span>
                )}
              </div>
              {event.createdAt && (
                <span className="text-[8px] font-mono text-[#7684a0]">
                  {new Date(event.createdAt).toLocaleTimeString()}
                </span>
              )}
            </div>
          )) : (
            <p className="text-[10px] font-mono text-[#7684a0] text-center py-8">
              Nenhuma atividade registrada. Entregue uma missão para iniciar.
            </p>
          )}
        </div>
      </div>

      {/* Recent Missions */}
      <div>
        <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3">MISSÕES RECENTES</p>
        <div className="space-y-2">
          {missions && missions.length > 0 ? missions.slice(0, 10).map(m => (
            <div key={m.id} className="nexus-card p-3 flex items-center gap-3">
              <span className={`nexus-chip shrink-0 ${
                m.status === 'completed' ? 'nexus-chip-online' :
                m.status === 'executing' ? 'nexus-chip-pending' :
                m.status === 'failed' ? 'nexus-chip-offline' : 'nexus-chip-offline'
              }`}>{m.status.toUpperCase()}</span>
              <p className="text-xs font-mono text-[#aab4d6] flex-1 truncate">{m.input}</p>
              <span className="text-[8px] font-mono text-[#7684a0]">{new Date(m.createdAt).toLocaleDateString()}</span>
            </div>
          )) : (
            <p className="text-[10px] font-mono text-[#7684a0] text-center py-4 nexus-card">Nenhuma missão executada.</p>
          )}
        </div>
      </div>
    </div>
  );
}
