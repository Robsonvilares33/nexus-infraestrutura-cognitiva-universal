import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Flame, Loader2, RefreshCw, Snowflake, Timer, TrendingUp } from "lucide-react";

const NEXUS_CYAN = "#7cf3ff";
const NEXUS_PURPLE = "#c9b8ff";
const NEXUS_GOLD = "#ffd479";
const HOT_COLOR = "#ff6b6b";
const COLD_COLOR = "#5ba4ff";
const DELAY_COLOR = "#ffd479";

type LotteryType = "megasena" | "quina" | "lotofacil" | "lotomania" | "timemania";

const LOTTERY_LABELS: Record<LotteryType, string> = {
  megasena: "Mega-Sena",
  quina: "Quina",
  lotofacil: "Lotofácil",
  lotomania: "Lotomania",
  timemania: "Timemania",
};

const LOTTERY_COLORS: Record<LotteryType, string> = {
  megasena: "#209869",
  quina: "#7b2fa0",
  lotofacil: "#a6162e",
  lotomania: "#f26522",
  timemania: "#000000",
};

export default function Loterias() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [lottery, setLottery] = useState<LotteryType>("megasena");
  const [betCount, setBetCount] = useState<string>("1");
  const [betDialogOpen, setBetDialogOpen] = useState(false);
  const [generatedBets, setGeneratedBets] = useState<number[][]>([]);

  const { data: lotteries } = trpc.loterias.list.useQuery();
  const { data: counts, isLoading: countsLoading } = trpc.loterias.counts.useQuery();
  const { data: collectStatus } = trpc.loterias.collectStatus.useQuery(undefined, { refetchInterval: 3000 });
  const { data: stats, isLoading: statsLoading, error: statsError } = trpc.loterias.stats.useQuery({ type: lottery });
  const { data: draws } = trpc.loterias.draws.useQuery({ type: lottery, limit: 30 });
  const collectMutation = trpc.loterias.collect.useMutation();

  const isCollecting = collectStatus === "running";
  const hasData = !!stats && stats.totalDraws > 0;

  const handleCollect = async () => {
    if (!user) {
      toast.error("Faça login para iniciar a coleta de dados");
      return;
    }
    if (isCollecting) {
      toast.info("Já existe uma coleta em andamento");
      return;
    }
    try {
      await collectMutation.mutateAsync({ type: lottery });
      toast.success(`Coleta da ${LOTTERY_LABELS[lottery]} iniciada em segundo plano. Acompanhe o progresso nesta página.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar a coleta");
    }
  };

  const utils = trpc.useUtils();
  const handleGenerateBets = async () => {
    try {
      const res = await utils.loterias.generateBets.fetch({ type: lottery, count: Number(betCount) });
      setGeneratedBets(res.bets);
      setBetDialogOpen(true);
      toast.info(res.disclaimer);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar apostas");
    }
  };

  const frequencyData = useMemo(
    () =>
      stats?.frequency
        ? [...stats.frequency].sort((a, b) => a.number - b.number).map((s) => ({ name: String(s.number), freq: s.frequency }))
        : [],
    [stats],
  );

  const delayData = useMemo(
    () =>
      stats?.frequency
        ? [...stats.frequency]
            .sort((a, b) => b.delay - a.delay)
            .slice(0, 20)
            .map((s) => ({ name: String(s.number), atraso: s.delay }))
        : [],
    [stats],
  );

  const lastDrawsData = useMemo(
    () =>
      stats?.lastDraws
        ? [...stats.lastDraws].map((d) => ({
            concurso: d.drawNumber,
            dezenas: d.numbers.length,
          }))
        : [],
    [stats],
  );

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <AlertCircle className="w-10 h-10 text-[#7cf3ff]" />
        <h2 className="text-xl font-semibold text-white">Acesse o módulo Loterias</h2>
        <p className="text-sm text-white/60 max-w-md text-center">
          Faça login para explorar estatísticas oficiais da Caixa Loterias e gerar análises estatísticas.
        </p>
        <Button variant="outline" className="border-[#7cf3ff]/40 text-[#7cf3ff] hover:bg-[#7cf3ff]/10" onClick={() => navigate("/")}>
          Ir para o início
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-[#7cf3ff]" />
            Loterias NEXUS
          </h1>
          <p className="text-sm text-white/60 mt-1">
            Análise estatística com resultados oficiais da Caixa Loterias — frequência, atrasos e simulações
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={lottery} onValueChange={(v) => setLottery(v as LotteryType)}>
            <SelectTrigger className="w-44 bg-[#0a0d1a] border-white/10 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {lotteries?.map((l) => (
                <SelectItem key={l.type} value={l.type}>
                  {l.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            className="border-[#7cf3ff]/40 text-[#7cf3ff] hover:bg-[#7cf3ff]/10"
            onClick={handleCollect}
            disabled={isCollecting}
          >
            {isCollecting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" /> Coletando...
              </>
            ) : (
              <>
                <RefreshCw className="w-4 h-4" /> Coletar dados
              </>
            )}
          </Button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Sorteios coletados"
          value={statsLoading ? undefined : String(stats?.totalDraws ?? 0)}
          accent={NEXUS_CYAN}
        />
        <KpiCard
          title="Último concurso"
          value={statsLoading ? undefined : String(stats?.latestDraw ?? "—")}
          accent={NEXUS_PURPLE}
        />
        <KpiCard
          title="Próximo prêmio estimado"
          value={statsLoading ? undefined : (stats?.estimatedNext === "0" ? "—" : formatBRL(stats?.estimatedNext ?? "0"))}
          accent={NEXUS_GOLD}
        />
        <KpiCard
          title="Acumulados no período"
          value={statsLoading ? undefined : String(stats?.totalAccumulatedCount ?? 0)}
          accent="#7cff9f"
        />
      </div>

      {statsLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-64 bg-white/5" />
          <Skeleton className="h-64 bg-white/5" />
        </div>
      ) : !hasData ? (
        <Card className="bg-[#0a0d1a] border-white/10">
          <CardContent className="flex flex-col items-center gap-3 py-12">
            <AlertCircle className="w-10 h-10 text-white/40" />
            <p className="text-white/70 text-center max-w-md">
              {statsError?.message ?? `Nenhum dado de ${LOTTERY_LABELS[lottery]} coletado ainda.`} Clique em{" "}
              <strong>Coletar dados</strong> para buscar os resultados oficiais da Caixa.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Últimos sorteios */}
          <Card className="bg-[#0a0d1a] border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg">Últimos sorteios</CardTitle>
              <CardDescription className="text-white/50">
                {stats?.dateRange.first && stats?.dateRange.last
                  ? `Período: ${stats.dateRange.first} — ${stats.dateRange.last}`
                  : undefined}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 overflow-x-auto">
                {draws?.map((d) => (
                  <div key={d.drawNumber} className="flex items-center gap-3 text-sm">
                    <span className="text-white/40 w-16 shrink-0">#{d.drawNumber}</span>
                    <span className="text-white/60 w-24 shrink-0">{d.drawDate ?? "—"}</span>
                    <div className="flex flex-wrap gap-1.5">
                      {(d.numbers as number[]).map((n) => (
                        <span
                          key={n}
                          className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-black"
                          style={{ background: LOTTERY_COLORS[lottery] || NEXUS_CYAN }}
                        >
                          {String(n).padStart(2, "0")}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Tabs defaultValue="frequencia">
            <TabsList className="bg-white/5">
              <TabsTrigger value="frequencia" className="data-[state=active]:bg-[#7cf3ff]/20">Frequência</TabsTrigger>
              <TabsTrigger value="atraso" className="data-[state=active]:bg-[#7cf3ff]/20">Atraso</TabsTrigger>
              <TabsTrigger value="pares" className="data-[state=active]:bg-[#7cf3ff]/20">Pares comuns</TabsTrigger>
            </TabsList>

            <TabsContent value="frequencia" className="mt-4">
              <div className="grid lg:grid-cols-3 gap-4">
                <Card className="lg:col-span-2 bg-[#0a0d1a] border-white/10">
                  <CardHeader>
                    <CardTitle className="text-white text-base">Frequência por dezena</CardTitle>
                    <CardDescription className="text-white/50">
                      Quantas vezes cada dezena apareceu nos {stats?.totalDraws} sorteios coletados
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={280}>
                      <BarChart data={frequencyData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                        <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} interval={2} />
                        <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} width={30} />
                        <Tooltip
                          contentStyle={{ background: "#0a0d1a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#fff" }}
                        />
                        <Bar dataKey="freq" fill={NEXUS_CYAN} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <MiniListCard
                    icon={<Flame className="w-4 h-4" />}
                    iconColor={HOT_COLOR}
                    title="Quentes (top 10)"
                    items={stats?.hot ?? []}
                    color={HOT_COLOR}
                  />
                  <MiniListCard
                    icon={<Snowflake className="w-4 h-4" />}
                    iconColor={COLD_COLOR}
                    title="Frias (menos saídas)"
                    items={stats?.cold ?? []}
                    color={COLD_COLOR}
                  />
                  <MiniListCard
                    icon={<Timer className="w-4 h-4" />}
                    iconColor={DELAY_COLOR}
                    title="Em atraso (top 10)"
                    items={stats?.delayed ?? []}
                    color={DELAY_COLOR}
                  />
                </div>
              </div>
            </TabsContent>

            <TabsContent value="atraso" className="mt-4">
              <Card className="bg-[#0a0d1a] border-white/10">
                <CardHeader>
                  <CardTitle className="text-white text-base">Atraso por dezena</CardTitle>
                  <CardDescription className="text-white/50">
                    Quantos sorteios se passaram desde a última aparição de cada dezena (top 20 mais atrasadas)
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={delayData} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                      <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} width={30} />
                      <Tooltip
                        contentStyle={{ background: "#0a0d1a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#fff" }}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="atraso" stroke={DELAY_COLOR} strokeWidth={2} dot={{ r: 3 }} name="Atraso" />
                    </LineChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="pares" className="mt-4">
              <Card className="bg-[#0a0d1a] border-white/10">
                <CardHeader>
                  <CardTitle className="text-white text-base">Pares que mais saíram juntos</CardTitle>
                  <CardDescription className="text-white/50">
                    Combinações de duas dezenas que apareceram no mesmo sorteio com mais frequência
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {(stats?.commonPairs ?? []).map((p) => (
                      <div
                        key={p.pair.join("-")}
                        className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2"
                      >
                        <div className="flex gap-1.5">
                          {p.pair.map((n) => (
                            <span
                              key={n}
                              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-black"
                              style={{ background: LOTTERY_COLORS[lottery] || NEXUS_CYAN }}
                            >
                              {String(n).padStart(2, "0")}
                            </span>
                          ))}
                        </div>
                        <Badge variant="outline" className="border-[#7cf3ff]/40 text-[#7cf3ff]">
                          {p.count}x
                        </Badge>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Gerador de apostas */}
          <Card className="bg-[#0a0d1a] border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg">Gerador estatístico de apostas</CardTitle>
              <CardDescription className="text-white/50">
                Combina dezenas quentes (40%), em atraso (30%) e aleatórias (30%) com base nos dados coletados.{" "}
                <strong className="text-[#ffd479]">
                  Análise puramente estatística — sorteios são aleatórios e não há garantia de acerto.
                </strong>
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Select value={betCount} onValueChange={setBetCount}>
                <SelectTrigger className="w-28 bg-[#0a0d1a] border-white/10 text-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["1", "2", "3", "5", "10"].map((n) => (
                    <SelectItem key={n} value={n}>
                      {n} {Number(n) === 1 ? "aposta" : "apostas"}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                className="bg-[#7cf3ff]/15 text-[#7cf3ff] border border-[#7cf3ff]/40 hover:bg-[#7cf3ff]/25"
                onClick={handleGenerateBets}
              >
                Gerar apostas
              </Button>
            </CardContent>
          </Card>
        </>
      )}

      {/* Disclaimer global */}
      <p className="text-xs text-white/40 text-center pb-6">
        Este módulo usa apenas estatísticas descritivas sobre resultados públicos da Caixa Loterias. Jogos de loteria são
        aleatórios — nenhuma análise aumenta a probabilidade matemática de acerto. Jogue com responsabilidade.
      </p>

      {/* Diálogo de apostas geradas */}
      <Dialog open={betDialogOpen} onOpenChange={setBetDialogOpen}>
        <DialogContent className="bg-[#0a0d1a] border-white/10 text-white max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-white">Apostas geradas — {LOTTERY_LABELS[lottery]}</DialogTitle>
            <DialogDescription className="text-white/50">
              Análise estatística apenas — sorteios são aleatórios e não há garantia de acerto.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            {generatedBets.map((bet, i) => (
              <div key={i} className="flex items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                <span className="text-xs text-white/40 w-8">#{i + 1}</span>
                <div className="flex flex-wrap gap-1.5">
                  {bet.map((n) => (
                    <span
                      key={n}
                      className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-black"
                      style={{ background: LOTTERY_COLORS[lottery] || NEXUS_CYAN }}
                    >
                      {String(n).padStart(2, "0")}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ---------- Subcomponentes ---------- */

function KpiCard({ title, value, accent }: { title: string; value?: string; accent: string }) {
  return (
    <Card className="bg-[#0a0d1a] border-white/10">
      <CardContent className="py-4">
        <p className="text-xs text-white/50">{title}</p>
        {value === undefined ? (
          <Skeleton className="h-7 w-20 mt-1 bg-white/10" />
        ) : (
          <p className="text-xl font-bold mt-1" style={{ color: accent }}>
            {value}
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function MiniListCard({
  icon,
  iconColor,
  title,
  items,
  color,
}: {
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  items: number[];
  color: string;
}) {
  return (
    <Card className="bg-[#0a0d1a] border-white/10">
      <CardContent className="py-3">
        <div className="flex items-center gap-2 mb-2">
          <span style={{ color: iconColor }}>{icon}</span>
          <span className="text-sm font-medium text-white">{title}</span>
        </div>
        <div className="flex flex-wrap gap-1">
          {items.map((n) => (
            <span
              key={n}
              className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-black"
              style={{ background: color }}
            >
              {String(n).padStart(2, "0")}
            </span>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function formatBRL(v: string): string {
  const n = parseFloat(v);
  if (!Number.isFinite(n)) return v;
  return n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}
