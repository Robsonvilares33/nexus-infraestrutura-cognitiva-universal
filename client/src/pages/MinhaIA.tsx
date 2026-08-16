import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { Brain, Send, Zap, Bot, CheckCircle2, AlertTriangle, Clock, Calendar, Timer, Trash2, Webhook, Trash, Cpu, Terminal, Globe, QrCode, FileDown, FileUp } from "lucide-react";
import { io, Socket } from "socket.io-client";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const QUICK_PROVIDERS = [
  { value: "forge", label: "APIForge (padrão)" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "google", label: "Gemini" },
  { value: "groq", label: "Groq" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "ollama", label: "Ollama (local)" },
  { value: "qwen", label: "QwenCloud" },
  { value: "custom", label: "Custom" },
];

interface LiveEvent {
  eventType: string;
  message: string;
  confidence?: string | number;
  agentName?: string;
  createdAt?: Date;
  timestamp?: number;
}

/** Indicador das ferramentas de computador ativadas para o modo agente (Fase 14) */
function ToolsStatus() {
  const { data } = trpc.userLlm.get.useQuery(undefined, { staleTime: 30_000 });
  if (!data) return null;
  const parts: string[] = [];
  if (data.shellEnabled === true) parts.push("TERMINAL");
  if (data.webEnabled !== false) parts.push("WEB");
  return (
    <span className="text-[9px] font-mono text-[#ffd479] flex items-center gap-1">
      {data.shellEnabled === true && <Terminal className="h-3 w-3" />}
      {data.webEnabled !== false && !data.shellEnabled && <Globe className="h-3 w-3" />}
      FERRAMENTAS: {parts.join(" + ") || "MEMÓRIA"}
    </span>
  );
}

interface AgentStep {
  id: number;
  stepType: string;
  toolName: string | null;
  agentName: string | null;
  detail: string | null;
  createdAt: Date;
}

/** Hook do console do agente — SSE (/api/missions/stream/:id) com fallback de polling */
function useAgentStream(missionId: number | null, enabled: boolean) {
  const [steps, setSteps] = useState<AgentStep[]>([]);
  const [missionStatus, setMissionStatus] = useState<string | null>(null);
  const [missionConfidence, setMissionConfidence] = useState<number | null>(null);
  const [streamError, setStreamError] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const stepsRef = useRef<AgentStep[]>([]);
  const utils = trpc.useUtils();

  useEffect(() => {
    if (!enabled || missionId === null) { setSteps([]); setMissionStatus(null); setIsExecuting(false); return; }
    setIsExecuting(true);
    stepsRef.current = [];
    setSteps([]);
    setStreamError(false);
    let es: EventSource | null = null;
    let interval: ReturnType<typeof setInterval> | null = null;
    let closed = false;
    let fallbackActive = false;

    const applyStep = (s: AgentStep) => {
      if (s.id > (stepsRef.current[stepsRef.current.length - 1]?.id ?? 0)) {
        stepsRef.current.push(s);
        setSteps([...stepsRef.current]);
      }
    };

    const refresh = async () => {
      try {
        const rows = await utils.missions.getSteps.fetch({ missionId });
        rows.forEach(r => applyStep({ ...r, createdAt: new Date(r.createdAt as any) }));
        const mission = await utils.missions.get.fetch({ missionId });
        setMissionStatus(mission?.status ?? null);
        setMissionConfidence(mission?.confidence != null ? Number(mission.confidence) : null);
        if (mission?.status !== "executing") { setIsExecuting(false); cleanup(); }
      } catch { setStreamError(true); }
    };

    const cleanup = () => {
      closed = true;
      es?.close();
      if (interval) clearInterval(interval);
    };

    try {
      es = new EventSource(`${window.location.origin}/api/missions/stream/${missionId}`);
      es.onmessage = async () => { await refresh(); };
      es.onerror = () => {
        es?.close();
        fallbackActive = true;
      };
      // Polling de fallback: SSE falhou ou desligado no ambiente
      interval = setInterval(refresh, 2000);
      refresh();
    } catch {
      fallbackActive = true;
      interval = setInterval(refresh, 2000);
      refresh();
    }

    return cleanup;
  }, [missionId, enabled, utils]);

  return { steps, missionStatus, missionConfidence, streamError, isExecuting };
}

const STEP_LABEL: Record<string, { icon: string; label: string; color: string }> = {
  plan: { icon: "◆", label: "PLANO", color: "#ffd479" },
  thought: { icon: "💭", label: "PENSAMENTO", color: "#aab4d6" },
  tool_call: { icon: "⚙", label: "FERRAMENTA", color: "#7cf3ff" },
  tool_result: { icon: "✓", label: "RESULTADO", color: "#3fe7b0" },
  agent_result: { icon: "🤖", label: "AGENTE", color: "#c9b8ff" },
  tool_error: { icon: "⚠", label: "ERRO", color: "#ff6b6b" },
  complete: { icon: "🏁", label: "CONCLUSÃO", color: "#3fe7b0" },
  error: { icon: "✕", label: "FALHA", color: "#ff6b6b" },
};

export default function MinhaIA() {
  const { data: missions, refetch: refetchMissions } = trpc.missions.list.useQuery();
  const { data: feed } = trpc.feed.list.useQuery({ limit: 50 });
  const createMutation = trpc.missions.create.useMutation();
  const executeMutation = trpc.missions.execute.useMutation({
    onMutate: () => {
      // Fase 13 — Modo Agente: abre o console SOMENTE depois que o request
      // foi enfileirado pelo cliente tRPC — evita que o EventSource/polling
      // abra antes do POST e interrompa o envio do batch.
      setAgentMissionId(agentExecuteMissionIdRef.current);
    },
    onError: e => {
      const msg = e?.message || String(e);
      if (/aborted|abort/i.test(msg)) {
        toast.warning("A conexão com o servidor foi interrompida — a missão pode continuar em segundo plano. Acompanhe no feed.");
      } else {
        toast.error(`Falha na execução da missão: ${msg}`);
      }
      setAgentMissionId(null);
    },
    onSettled: () => refetchMissions(),
  });
  const scheduleMutation = trpc.missions.schedule.useMutation();
  const unscheduleMutation = trpc.missions.unschedule.useMutation();
  const { data: scheduledMissions, refetch: refetchScheduled } = trpc.missions.listScheduled.useQuery();
  const [input, setInput] = useState("");
  const llmConfig = trpc.userLlm.get.useQuery();
  const [agentMode, setAgentMode] = useState(false);
  const quickSetMutation = trpc.userLlm.update.useMutation({
    onSuccess: () => { toast.success("Motor de IA atualizado — chave e endpoint em Config → Motor de IA."); llmConfig.refetch(); },
    onError: (e: { message?: string } | Error | undefined) => toast.error(e instanceof Error ? e.message : "Falha ao atualizar"),
  });
  const [agentMissionId, setAgentMissionId] = useState<number | null>(null);
  // Ref para transportar o missionId do modo agente até o onMutate do
  // executeMutation (criado no escopo do componente, antes de handleSubmit).
  const agentExecuteMissionIdRef = useRef<number | null>(null);
  const agentStream = useAgentStream(agentMissionId, agentMode);
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

  // Phase 11: consume prefilled template input from Marketplace "Usar template"
  useEffect(() => {
    try {
      const templateInput = localStorage.getItem("nexus-template-input");
      if (templateInput) {
        localStorage.removeItem("nexus-template-input");
        setInput(templateInput);
        toast.info("Template preenchido — ajuste o texto e envie a missão.");
      }
    } catch {
      /* storage unavailable */
    }
  }, []);

  const handleSubmit = async () => {
    if (!input.trim()) return;
    setLiveEvents([]);
    const result = (await createMutation.mutateAsync({ input: input.trim() })) as any;
    const mid = result?.insertId ?? result?.[0]?.insertId;
    if (!mid) throw new Error("Falha ao criar a missão: id não retornado.");
    // Add initial event immediately
    setLiveEvents(prev => [...prev, {
      eventType: "mission",
      message: `Missão recebida: ${input.trim()}`,
      createdAt: new Date(),
    }]);
    if (agentMode) {
      // Fase 13 — Modo Agente: loop autônomo com console ao vivo.
      // O request de execução roda em background; o console abre em seguida
      // e acompanha os passos via SSE/polling. Um abort aqui é tratado como
      // falha visível em vez de silencioso.
      agentExecuteMissionIdRef.current = mid;
      executeMutation.mutate({ missionId: mid, input: input.trim(), mode: "agent" });
    } else {
      await executeMutation.mutateAsync({ missionId: mid, input: input.trim() });
    }
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

  // Compartilhamento de missões (exportar/importar)
  const handleExport = async (missionId: number) => {
    try {
      const { code, title } = await trpc.missions.exportMission.useQuery({ missionId }, { enabled: false }).refetch().then(r => r.data as { code: string; title: string });
      try { await navigator.clipboard.writeText(code); toast.success(`Missão "${title}" copiada — compartilhe o código com outro usuário.`); } catch { toast.success("Código da missão gerado (copie abaixo):"); }
    } catch (error) {
      toast.error("Erro ao exportar missão: " + String(error));
    }
  };

  const [importCode, setImportCode] = useState("");
  const [importDialogOpen, setImportDialogOpen] = useState(false);

  const importMutation = trpc.missions.importMission.useMutation({
    onSuccess: (r) => { toast.success(`Missão "${r.title}" importada! Está na sua lista — execute-a quando quiser.`); refetchMissions(); },
    onError: (e) => toast.error("Erro ao importar: " + String(e.message)),
  });

  const handleImport = async () => {
    const code = importCode.trim();
    if (!code) { toast.error("Cole o código da missão primeiro."); return; }
    try {
      await importMutation.mutateAsync({ code });
      setImportCode("");
      setImportDialogOpen(false);
    } catch { /* handled by onError */ }
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
          <button
            onClick={() => setImportDialogOpen(true)}
            className="ml-auto flex items-center gap-1 text-[9px] font-mono tracking-wider text-[#3fe7b0] border border-[#3fe7b0]/30 rounded px-2 py-0.5 hover:bg-[#3fe7b0]/10 transition-colors"
            title="Importar missão compartilhada por outro usuário"
          >
            <FileUp className="h-3 w-3" /> IMPORTAR
          </button>
        </div>
        <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
          <DialogContent className="bg-[#0a0f1a] border-[rgba(150,175,220,0.12)] text-[#e2e8f4]">
            <DialogHeader>
              <DialogTitle className="text-sm font-mono text-[#e2e8f4] flex items-center gap-2"><FileUp className="h-4 w-4 text-[#3fe7b0]" /> Importar Missão</DialogTitle>
              <DialogDescription className="text-[10px] font-mono text-[#7684a0]">
                Cole o código de missão compartilhado por outro usuário do NEXUS.
              </DialogDescription>
            </DialogHeader>
            <textarea
              value={importCode}
              onChange={e => setImportCode(e.target.value)}
              className="w-full h-24 rounded border border-[rgba(150,175,220,0.15)] bg-[rgba(3,5,14,0.6)] text-[10px] font-mono text-[#e2e8f4] p-2 focus:outline-none focus:border-[#3fe7b0]/50 resize-none"
              placeholder="Cole aqui o código da missão…"
            />
            <DialogFooter>
              <Button variant="outline" onClick={() => setImportDialogOpen(false)} className="border-[rgba(150,175,220,0.15)] text-[#aab4d6]">Cancelar</Button>
              <Button onClick={handleImport} disabled={importMutation.isPending} className="bg-[#3fe7b0]/10 text-[#3fe7b0] border border-[#3fe7b0]/30 hover:bg-[#3fe7b0]/20">
                <FileUp className="h-4 w-4 mr-1" />
                {importMutation.isPending ? "Importando…" : "Importar"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <div className="flex items-center gap-2 mb-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={agentMode}
              onChange={e => setAgentMode(e.target.checked)}
              className="accent-[#c9b8ff] h-3 w-3"
            />
            <span className="text-[10px] font-mono tracking-wider text-[#c9b8ff] flex items-center gap-1">
              <Cpu className="h-3 w-3" /> MODO AGENTE
            </span>
            <span className="text-[9px] font-mono text-[#7684a0]">(loop autônomo NEXUS × Manus — console ao vivo)</span>
          </label>
          <ToolsStatus />
          <Select
            value={quickSetMutation.variables?.provider ?? (llmConfig.data?.provider ?? "forge")}
            onValueChange={(v) => quickSetMutation.mutate({ provider: v as "forge" | "openai" | "anthropic" | "google" | "groq" | "openrouter" | "ollama" | "qwen" | "custom" })}
          >
            <SelectTrigger className="h-6 w-44 text-[10px] font-mono border-[#7684a0]/30">
              <Cpu className="h-3 w-3 mr-1 text-[#c9b8ff]" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="max-h-72">
              {QUICK_PROVIDERS.map((p) => (
                <SelectItem key={p.value} value={p.value} className="text-xs font-mono">{p.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <form
          className="flex gap-3"
          onSubmit={e => {
            e.preventDefault();
            handleSubmit();
          }}
        >
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="Descreva sua missão em linguagem natural..."
            className="flex-1 nexus-card px-4 py-3 text-sm text-[#e2e8f4] placeholder:text-[#7684a0]/50 focus:outline-none focus:border-[#7cf3ff]/30 font-mono bg-transparent"
          />
          <button
            type="submit"
            disabled={!input.trim() || createMutation.isPending || executeMutation.isPending}
            className="nexus-card px-6 py-3 text-[#7cf3ff] hover:bg-[#7cf3ff]/10 disabled:opacity-30 font-mono text-xs flex items-center gap-2"
          >
            <Send className="h-4 w-4" />
            EXECUTAR
          </button>
        </form>
      </div>

      {/* Fase 13 — Console do Agente (streaming SSE + fallback polling) */}
      {agentMissionId !== null && (
        <div className="nexus-card p-4 border-[#c9b8ff]/30">
          <div className="flex items-center gap-2 mb-3">
            <Cpu className="h-4 w-4 text-[#c9b8ff]" />
            <span className="text-xs font-mono text-[#7684a0] tracking-wider">CONSOLE DO AGENTE</span>
            {agentStream.isExecuting && <span className="nexus-chip nexus-chip-pending animate-pulse">● LOOP ATIVO</span>}
            {agentStream.missionStatus && agentStream.missionStatus !== "executing" && (
              <span className={`nexus-chip ${agentStream.missionStatus === "completed" ? "nexus-chip-online" : "nexus-chip-offline"}`}>
                {agentStream.missionStatus.toUpperCase()}
              </span>
            )}
            {agentStream.missionConfidence !== null && (
              <span className="text-[8px] font-mono text-[#3fe7b0] ml-auto">
                CONFIANÇA {Math.round(agentStream.missionConfidence * 100)}%
              </span>
            )}
            {agentStream.steps.length > 0 && (
              <span className="nexus-chip nexus-chip-online">{agentStream.steps.length} passos</span>
            )}
          </div>
          <div className="h-56 overflow-y-auto space-y-1 pr-2 scroll-smooth font-mono">
            {agentStream.steps.length > 0 ? agentStream.steps.map(s => {
              const meta = STEP_LABEL[s.stepType] ?? { icon: "•", label: s.stepType.toUpperCase(), color: "#7684a0" };
              return (
                <div key={s.id} className="flex items-start gap-2 px-2 py-1 rounded border border-[rgba(150,175,220,0.06)] bg-[rgba(3,5,14,0.5)]">
                  <span className="text-[9px] shrink-0 w-5 text-center" style={{ color: meta.color }}>{meta.icon}</span>
                  <span className="text-[8px] font-mono uppercase tracking-wider w-24 shrink-0 pt-0.5" style={{ color: meta.color }}>{meta.label}{s.toolName ? `:${s.toolName}` : ""}{s.agentName ? `·${s.agentName}` : ""}</span>
                  <span className="flex-1 text-[10px] text-[#aab4d6] break-words whitespace-pre-wrap">{s.detail}</span>
                  <span className="text-[8px] text-[#7684a0] shrink-0">{new Date(s.createdAt).toLocaleTimeString()}</span>
                </div>
              );
            }) : (
              <p className="text-[10px] font-mono text-[#7684a0] text-center py-8">
                Iniciando o loop autônomo… os passos do agente aparecerão aqui em tempo real.
              </p>
            )}
          </div>
        </div>
      )}

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
              {/* Export button: compartilha a missão com outro usuário */}
              <button className="text-[#c9b8ff] hover:text-[#c9b8ff]/80 transition-colors shrink-0" title="Exportar (compartilhar)" onClick={() => handleExport(m.id)}>
                <FileDown className="h-3.5 w-3.5" />
              </button>
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
