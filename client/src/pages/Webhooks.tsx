import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Radio, CheckCircle2, XCircle, AlertTriangle, Timer, BarChart3, RotateCcw, Filter } from "lucide-react";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

function fmtMs(ms: number | null): string {
  if (ms == null) return "—";
  return `${Math.round(ms)}ms`;
}

function ResultChip({ result, attempts }: { result: string | null; attempts: number | null }) {
  const failed = result !== "sucesso";
  const retried = (attempts ?? 1) > 1;
  if (failed) {
    return (
      <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border border-[#ff6b6b]/30 bg-[#ff6b6b]/10 text-[#ff6b6b]">
        <XCircle className="h-3 w-3" />
        {(result ?? "desconhecido").toUpperCase()}
        {retried && <RotateCcw className="h-3 w-3 text-[#ffd479]" />}
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded border border-[#3fe7b0]/30 bg-[#3fe7b0]/10 text-[#3fe7b0]">
      <CheckCircle2 className="h-3 w-3" />
      SUCESSO
      {retried && <RotateCcw className="h-3 w-3 text-[#ffd479]" />}
    </span>
  );
}

export default function Webhooks() {
  const [missionFilter, setMissionFilter] = useState<string>("all");
  const [days, setDays] = useState<string>("30");

  const { data: missions } = trpc.missions.list.useQuery();
  const metricsQuery = trpc.webhooks.metrics.useQuery(
    { missionId: missionFilter === "all" ? undefined : Number(missionFilter), days: Number(days) },
    { refetchInterval: 30000 },
  );
  const m = metricsQuery.data;

  const byDay = useMemo(() => m?.byDay ?? [], [m]);
  const maxDayTotal = useMemo(() => Math.max(1, ...byDay.map((d: { total: number }) => d.total)), [byDay]);

  return (
    <div className="space-y-5 animate-fade-in">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold text-[#e2e8f4] flex items-center gap-2">
          <Radio className="h-5 w-5 text-[#7cf3ff]" />Webhooks — Métricas de Disparos
        </h2>
        <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase">
          Monitoramento de integrações de missão (Fase 21: retransmissão automática com backoff)
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`nexus-chip ${metricsQuery.isSuccess ? "nexus-chip-online" : "nexus-chip-pending"}`}>
            {metricsQuery.isFetching ? "ATUALIZANDO..." : m ? `${m.total} DISPAROS REGISTRADOS` : "SEM DADOS"}
          </span>
          <div className="flex items-center gap-1.5">
            <Filter className="h-3 w-3 text-[#7684a0]" />
            <Select value={missionFilter} onValueChange={setMissionFilter}>
              <SelectTrigger className="h-6 w-44 text-[10px] font-mono bg-[#020308] border-[rgba(150,175,220,0.12)] text-[#aab4d6]">
                <SelectValue placeholder="Todas as missões" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas as missões</SelectItem>
                {(missions ?? []).map(miss => (
                  <SelectItem key={miss.id} value={String(miss.id)}>{miss.input.slice(0, 40)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-1.5">
            <BarChart3 className="h-3 w-3 text-[#7684a0]" />
            <Select value={days} onValueChange={setDays}>
              <SelectTrigger className="h-6 w-24 text-[10px] font-mono bg-[#020308] border-[rgba(150,175,220,0.12)] text-[#aab4d6]">
                <SelectValue placeholder="30 dias" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 dias</SelectItem>
                <SelectItem value="30">30 dias</SelectItem>
                <SelectItem value="90">90 dias</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="nexus-card p-4">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase">TAXA DE SUCESSO</p>
          <p className="text-2xl font-bold mt-1" style={{ color: m && m.successRate >= 0.8 ? "#3fe7b0" : "#ffd479" }}>
            {m ? `${(m.successRate * 100).toFixed(1)}%` : "—"}
          </p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase">TEMPO MÉDIO</p>
          <p className="text-2xl font-bold text-[#7cf3ff] mt-1">{fmtMs(m?.avgElapsedMs ?? null)}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase">SUCESSOS</p>
          <p className="text-2xl font-bold text-[#3fe7b0] mt-1">        {m?.countsByResult?.sucesso ?? 0}</p>
        </div>
        <div className="nexus-card p-4">
          <p className="text-[9px] font-mono text-[#7684a0] tracking-wider uppercase">FALHAS</p>
          <p className="text-2xl font-bold text-[#ff6b6b] mt-1">{(m?.total ?? 0) - (m?.countsByResult?.sucesso ?? 0)}</p>
        </div>
      </div>

      {/* By-day mini chart */}
      {byDay.length > 0 && (
        <div className="nexus-card p-4">
          <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase mb-3">DISPAROS POR DIA ({days} dias)</p>
          <div className="flex items-end gap-1 h-24">
            {byDay.map((d: { day: string; total: number; success: number }) => {
              const h = Math.max(2, Math.round((d.total / maxDayTotal) * 100));
              const ok = d.total - d.success === 0;
              return (
                <div key={d.day} className="flex-1 flex flex-col items-center gap-1 group relative">
                  <div
                    className={`w-full rounded-t ${ok ? "bg-[#3fe7b0]/60" : "bg-[#ff6b6b]/60"}`}
                    style={{ height: `${h}%` }}
                    title={`${d.day}: ${d.success} ok / ${d.total - d.success} falha`}
                  />
                  <span className="text-[7px] font-mono text-[#7684a0]">{d.day.slice(8)}</span>
                </div>
              );
            })}
          </div>
          <div className="flex items-center gap-4 mt-2 text-[9px] font-mono text-[#7684a0]">
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-[#3fe7b0]/60" /> só sucessos</span>
            <span className="flex items-center gap-1"><span className="h-2 w-2 rounded bg-[#ff6b6b]/60" /> com falhas</span>
          </div>
        </div>
      )}

      {/* Recent failures */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="nexus-card p-4 lg:col-span-1">
          <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase mb-3 flex items-center gap-1.5">
            <AlertTriangle className="h-3 w-3 text-[#ffd479]" /> FALHAS RECENTES
          </p>
          {m?.recentFailures?.length ? (
            <ul className="space-y-2">
              {m.recentFailures.map((f: { id: number; result: string | null; httpStatus: number | null; webhookId: number; errorMessage: string | null; triggeredAt?: Date; createdAt?: Date }) => (
                <li key={f.id} className="text-[10px] font-mono leading-relaxed border-l-2 border-[#ff6b6b]/50 pl-2">
                  <p className="text-[#ff6b6b]">{f.result?.toUpperCase()} {f.httpStatus ? `HTTP ${f.httpStatus}` : ""}</p>
                  <p className="text-[#aab4d6]">Webhook #{f.webhookId}</p>
                  <p className="text-[#7684a0]">{(f.errorMessage ?? "").slice(0, 80)}</p>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[10px] font-mono text-[#3fe7b0]">✓ Nenhuma falha recente — tudo está sendo retransmitido com sucesso.</p>
          )}
        </div>

        {/* Event log */}
        <div className="nexus-card p-4 lg:col-span-2">
          <p className="text-[10px] font-mono text-[#7684a0] tracking-wider uppercase mb-3 flex items-center gap-1.5">
            <Timer className="h-3 w-3 text-[#7cf3ff]" /> ÚLTIMOS DISPAROS
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-[10px] font-mono">
              <thead>
                <tr className="text-[#7684a0] border-b border-[rgba(150,175,220,0.08)]">
                  <th className="text-left py-1.5 pr-2 font-normal">HORÁRIO</th>
                  <th className="text-left py-1.5 pr-2 font-normal">RESULTADO</th>
                  <th className="text-left py-1.5 pr-2 font-normal">HTTP</th>
                  <th className="text-left py-1.5 pr-2 font-normal">TEMPO</th>
                  <th className="text-left py-1.5 pr-2 font-normal">TENTATIVAS</th>
                  <th className="text-left py-1.5 font-normal">MENSAGEM</th>
                </tr>
              </thead>
              <tbody>
                {(m?.recentFailures ?? []).map((e: any) => (
                  <tr key={e.id} className="border-b border-[rgba(150,175,220,0.04)] text-[#aab4d6]">
                    <td className="py-1.5 pr-2 text-[#7684a0] whitespace-nowrap">{new Date(e.createdAt).toLocaleString()}</td>
                    <td className="py-1.5 pr-2"><ResultChip result={e.result} attempts={e.attempts} /></td>
                    <td className="py-1.5 pr-2">{e.httpStatus ?? "—"}</td>
                    <td className="py-1.5 pr-2">{fmtMs(e.elapsedMs)}</td>
                    <td className="py-1.5 pr-2 text-[#c9b8ff]">{e.attempts ?? 1}</td>
                    <td className="py-1.5 max-w-48 truncate" title={e.errorMessage ?? undefined}>{e.errorMessage ?? "—"}</td>
                  </tr>
                ))}
                {(m?.recentFailures ?? []).length === 0 && (
                  <tr><td colSpan={6} className="py-4 text-center text-[#7684a0]">Nenhum disparo registrado ainda.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <p className="text-[9px] font-mono text-[#7684a0]">
        Fase 21 — disparos falhos (5xx, timeout, rede) são retransmitidos automaticamente até 3× com backoff exponencial (1s → 2s); erros 4xx são definitivos e não retentam.
      </p>
    </div>
  );
}
