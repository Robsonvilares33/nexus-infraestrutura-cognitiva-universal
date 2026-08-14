import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { Brain, Send, Zap, Bot, CheckCircle2, AlertTriangle, Clock, Calendar, Timer, Trash2, Webhook, Trash } from "lucide-react";
import { io, Socket } from "socket.io-client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

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
  const scheduleMutation = trpc.missions.schedule.useMutation();
  const unscheduleMutation = trpc.missions.unschedule.useMutation();
  const { data: scheduledMissions, refetch: refetchScheduled } = trpc.missions.listScheduled.useQuery();
  const [input, setInput] = useState("");
  const [hookMissionId, setHookMissionId] = useState<number | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const { data: webhooks, refetch: refetchWebhooks } = trpc.webhooks.list.useQuery(
    { missionId: hookMissionId ?? 0 },
    { enabled: hookMissionId !== null },
  );
  const addWebhookMutation = trpc.webhooks.add.useMutation({
    onSuccess: () => {
      toast.success("Webhook registrado! Será acionado quando a missão for executada.");
      setHookUrl("");
      refetchWebhooks();
    },
    onError: e => toast.error(e.message || "Erro ao registrar webhook"),
  });
  const removeWebhookMutation = trpc.webhooks.remove.useMutation({
    onSuccess: () => refetchWebhooks(),
    onError: e => toast.error(e.message || "Erro ao remover webhook"),
  });

  const handleAddWebhook = () => {
    if (!hookMissionId || !hookUrl.trim()) {
      toast.error("Informe a URL do webhook.");
      return;
    }
    addWebhookMutation.mutate({ missionId: hookMissionId, url: hookUrl.trim() });
  };
  const [liveEvents, setLiveEvents] = useState<LiveEvent[]>([]);
  const [scheduleDialogOpen, setScheduleDialogOpen] = useState(false);

  const [scheduleMissionId, setScheduleMissionId] = useState<number | null>(null);
  const [cronExpression, setCronExpression] = useState("0 0 9 * * *");
  const [cronPreset, setCronPreset] = useState("daily_9am");
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

  const handleSchedule = async () => {
    if (!scheduleMissionId) return;
    try {
      await scheduleMutation.mutateAsync({ missionId: scheduleMissionId, cron: cronExpression });
      toast.success("Missão agendada com sucesso!");
      setScheduleDialogOpen(false);
      refetchMissions();
      refetchScheduled();
    } catch (error) {
      toast.error("Erro ao agendar missão: " + String(error));
    }
  };

  const handleUnschedule = async (missionId: number) => {
    try {
      await unscheduleMutation.mutateAsync({ missionId });
      toast.success("Agendamento cancelado.");
      refetchMissions();
      refetchScheduled();
    } catch (error) {
      toast.error("Erro ao cancelar agendamento: " + String(error));
    }
  };

  const handlePresetChange = (preset: string) => {
    setCronPreset(preset);
    switch (preset) {
      case "daily_9am": setCronExpression("0 0 9 * * *"); break;
      case "daily_6pm": setCronExpression("0 0 18 * * *"); break;
      case "weekly_mon": setCronExpression("0 0 9 * * 1"); break;
      case "hourly": setCronExpression("0 0 * * * *"); break;
      default: setCronExpression("0 0 9 * * *");
    }
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

      {/* Scheduled Missions */}
      {scheduledMissions && scheduledMissions.length > 0 && (
        <div>
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase mb-3 flex items-center gap-2">
            <Timer className="h-3 w-3 text-[#ffd479]" /> MISSÕES AGENDADAS ({scheduledMissions.length})
          </p>
          <div className="space-y-2">
            {scheduledMissions.map(m => (
              <div key={m.id} className="nexus-card p-3 flex items-center gap-3">
                <span className="nexus-chip nexus-chip-pending shrink-0">AGENDADA</span>
                <p className="text-xs font-mono text-[#aab4d6] flex-1 truncate">{m.input}</p>
                <span className="text-[8px] font-mono text-[#ffd479]">{cronPreset}</span>
                <button
                  onClick={() => handleUnschedule(m.id)}
                  className="text-[#ff6b6b] hover:text-[#ff6b6b]/80 transition-colors"
                  title="Cancelar agendamento"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

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
              {/* Schedule button for completed missions */}
              {m.status === 'completed' && !m.isScheduled && (
                <Dialog open={scheduleDialogOpen && scheduleMissionId === m.id} onOpenChange={open => {
                  setScheduleDialogOpen(open);
                  if (open) setScheduleMissionId(m.id);
                }}>
                  <DialogTrigger asChild>
                    <button className="text-[#ffd479] hover:text-[#ffd479]/80 transition-colors" title="Agendar">
                      <Calendar className="h-3.5 w-3.5" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-[#0a0f1a] border-[rgba(150,175,220,0.12)] text-[#e2e8f4]">
                    <DialogHeader>
                      <DialogTitle className="text-sm font-mono text-[#e2e8f4]">Agendar Missão</DialogTitle>
                      <DialogDescription className="text-[10px] font-mono text-[#7684a0]">
                        Configure a frequência de execução automática desta missão.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <label className="text-[10px] font-mono text-[#7684a0] block mb-2">Frequência:</label>
                        <div className="grid grid-cols-2 gap-2">
                          {[
                            { value: "daily_9am", label: "Diário 09:00" },
                            { value: "daily_6pm", label: "Diário 18:00" },
                            { value: "weekly_mon", label: "Semanal (Seg)" },
                            { value: "hourly", label: "A cada hora" },
                          ].map(preset => (
                            <button
                              key={preset.value}
                              onClick={() => handlePresetChange(preset.value)}
                              className={`px-3 py-2 text-[10px] font-mono rounded border transition-colors ${
                                cronPreset === preset.value
                                  ? "border-[#7cf3ff]/50 bg-[#7cf3ff]/10 text-[#7cf3ff]"
                                  : "border-[rgba(150,175,220,0.1)] text-[#7684a0] hover:border-[rgba(150,175,220,0.2)]"
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <label className="text-[10px] font-mono text-[#7684a0] block mb-2">Expressão Cron (UTC):</label>
                        <Input
                          value={cronExpression}
                          onChange={e => setCronExpression(e.target.value)}
                          className="nexus-card bg-transparent text-[#e2e8f4] font-mono text-xs"
                          placeholder="0 0 9 * * *"
                        />
                      </div>
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setScheduleDialogOpen(false)} className="border-[rgba(150,175,220,0.15)] text-[#aab4d6]">
                        Cancelar
                      </Button>
                      <Button onClick={handleSchedule} disabled={scheduleMutation.isPending} className="bg-[#7cf3ff]/10 text-[#7cf3ff] border border-[#7cf3ff]/30 hover:bg-[#7cf3ff]/20">
                        <Timer className="h-4 w-4 mr-1" />
                        Agendar
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              )}
              {m.isScheduled && (
                <span className="text-[8px] font-mono text-[#ffd479]">⏰</span>
              )}
              {/* Webhook button for completed missions */}
              {m.status === 'completed' && (
                <Dialog open={hookMissionId === m.id} onOpenChange={open => {
                  setHookMissionId(open ? m.id : null);
                  if (!open) setHookUrl("");
                }}>
                  <DialogTrigger asChild>
                    <button className="text-[#3fe7b0] hover:text-[#3fe7b0]/80 transition-colors shrink-0" title="Webhooks">
                      <Webhook className="h-3.5 w-3.5" />
                    </button>
                  </DialogTrigger>
                  <DialogContent className="bg-[#0a0f1a] border-[rgba(150,175,220,0.12)] text-[#e2e8f4]">
                    <DialogHeader>
                      <DialogTitle className="text-sm font-mono text-[#e2e8f4] flex items-center gap-2">
                        <Webhook className="h-4 w-4 text-[#3fe7b0]" /> Webhooks da Missão
                      </DialogTitle>
                      <DialogDescription className="text-[10px] font-mono text-[#7684a0]">
                        URLs externas acionadas automaticamente quando esta missão é executada.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="flex gap-2">
                        <Input
                          value={hookUrl}
                          onChange={e => setHookUrl(e.target.value)}
                          placeholder="https://seu-servico.com/webhook"
                          className="bg-[rgba(3,5,14,0.8)] border-[rgba(150,175,220,0.12)] text-[#e2e8f4] text-xs font-mono flex-1"
                        />
                        <Button
                          size="sm"
                          onClick={handleAddWebhook}
                          disabled={addWebhookMutation.isPending}
                          className="bg-[#3fe7b0]/10 text-[#3fe7b0] border border-[#3fe7b0]/30 hover:bg-[#3fe7b0]/20 text-[10px] font-mono shrink-0"
                        >
                          ADICIONAR
                        </Button>
                      </div>
                      {!webhooks?.length ? (
                        <p className="text-[10px] font-mono text-[#7684a0]">Nenhum webhook cadastrado.</p>
                      ) : (
                        <div className="space-y-1.5 max-h-40 overflow-auto">
                          {webhooks.map(h => (
                            <div key={h.id} className="flex items-center gap-2 bg-[rgba(3,5,14,0.8)] border border-[rgba(150,175,220,0.08)] p-2">
                              <Webhook className="h-3 w-3 text-[#3fe7b0] shrink-0" />
                              <p className="text-[9px] font-mono text-[#aab4d6] truncate flex-1" title={h.url}>{h.url}</p>
                              {h.lastStatus !== null && h.lastStatus !== undefined && (
                                <span className={`text-[8px] font-mono px-1.5 py-0.5 border shrink-0 ${h.lastStatus >= 200 && h.lastStatus < 300 ? "text-[#3fe7b0] border-[rgba(63,231,176,0.25)]" : "text-[#ff7a8c] border-[rgba(255,122,140,0.25)]"}`}>
                                  HTTP {h.lastStatus}
                                </span>
                              )}
                              <button
                                onClick={() => removeWebhookMutation.mutate({ webhookId: h.id })}
                                className="text-[#ff7a8c] hover:text-[#ff7a8c]/80 transition-colors shrink-0"
                                aria-label="Remover webhook"
                              >
                                <Trash className="h-3 w-3" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              )}
            </div>
          )) : (
            <p className="text-[10px] font-mono text-[#7684a0] text-center py-4 nexus-card">Nenhuma missão executada.</p>
          )}
        </div>
      </div>
    </div>
  );
}
