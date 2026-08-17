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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { AlertCircle, Bell, Check, Flame, Loader2, RefreshCw, Snowflake, Timer, TrendingUp, Trash2, Wallet, Target, Zap, Layers, History } from "lucide-react";

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


const LOTTERY_SIZES: Record<LotteryType, number> = {
  megasena: 6,
  quina: 5,
  lotofacil: 15,
  lotomania: 50,
  timemania: 7,
};

const LOTTERY_MAX: Record<LotteryType, number> = {
  megasena: 60,
  quina: 80,
  lotofacil: 25,
  lotomania: 100,
  timemania: 80,
};

export default function Loterias() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const [lottery, setLottery] = useState<LotteryType>("megasena");
  const [betCount, setBetCount] = useState<string>("1");
  const [period, setPeriod] = useState<"30" | "60" | "90" | "all">("all");
  // Fase 23: estados de apostas salvas e alertas de acumulado
  const [betDialogOpen, setBetDialogOpen] = useState(false);
  const [generatedBets, setGeneratedBets] = useState<number[][]>([]);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);
  const [alertValue, setAlertValue] = useState("");

  const { data: lotteries } = trpc.loterias.list.useQuery();
  const { data: counts, isLoading: countsLoading } = trpc.loterias.counts.useQuery();
  const { data: collectStatus } = trpc.loterias.collectStatus.useQuery(undefined, { refetchInterval: 3000 });
  const { data: stats, isLoading: statsLoading, error: statsError } = trpc.loterias.stats.useQuery({ type: lottery, period });
  const { data: draws } = trpc.loterias.draws.useQuery({ type: lottery, limit: 30 });

  // ---------- Fase 25: coleta histórica completa + modelo LSTM ----------
  const { data: collectJobs } = trpc.loterias.listCollectJobs.useQuery(undefined, { refetchInterval: 5000 });
  const { data: lstmModels } = trpc.loterias.listModels.useQuery(undefined, { refetchInterval: 10000 });
  const { data: lstmPreds } = trpc.loterias.lstmBet.useQuery({ type: lottery, count: 1 }, { enabled: !!stats });

  // ---------- Fase 26: backtest por método ----------
  const { data: backtest, isLoading: backtestLoading } = trpc.loterias.backtest.useQuery(
    { type: lottery },
    { enabled: !!stats },
  );

  // ---------- Fase 28: histórico de aquecimentos, simulador e relatório ----------
  const warmupHistoryMutation = trpc.loterias.warmupHistory.useMutation();
  const { data: allWarmupHistory, refetch: refetchWarmupHistory } = trpc.loterias.warmupEvents.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const isNewWarmup = (e: { detectedAt: string | Date | null; lotteryType: string; number: number }): boolean => {
    if (!e.detectedAt) return false;
    const d = new Date(e.detectedAt);
    return Date.now() - d.getTime() < 7 * 24 * 60 * 60 * 1000;
  };
  const [reportDialogOpen, setReportDialogOpen] = useState(false);
  const { data: weeklyReport } = trpc.loterias.weeklyReport.useQuery({}, { enabled: !!stats });
  const [simNumbers, setSimNumbers] = useState<number[]>([]);
  const { data: simResult, refetch: refetchSim } = trpc.loterias.simulateBet.useQuery(
    { type: lottery, numbers: simNumbers },
    { enabled: simNumbers.length === LOTTERY_SIZES[lottery] && simNumbers.every((n) => n >= 1 && n <= LOTTERY_MAX[lottery]) },
  );

  // ---------- Fase 29: portfólio evolutivo de 33 jogos ----------
  const [portfolioTargets, setPortfolioTargets] = useState<number[]>([]);
  const generatePortfolioMutation = trpc.loterias.generatePortfolio.useMutation();
  const checkPortfolioMutation = trpc.loterias.checkPortfolio.useMutation();
  const { data: portfolios } = trpc.loterias.listPortfolios.useQuery(undefined, { enabled: !!user, refetchInterval: 10000 });
  const currentPortfolio = portfolios?.find((p) => p.lotteryType === lottery) ?? null;
  const { data: portfolioEvolution } = trpc.loterias.portfolioEvolution.useQuery(
    { portfolioId: currentPortfolio?.id ?? 0 },
    { enabled: !!currentPortfolio?.id },
  );
  const [checkResult, setCheckResult] = useState<{
    drawNumber: number;
    drawDate: string | null;
    drawn: number[];
    check: { hitsPerGame: number[]; bestHits: number; hits13Plus: number; hits14: number; hits15: number; avgHits: number };
    message: string;
  } | null>(null);

  const handleTogglePortfolioNumber = (n: number) => {
    const size = LOTTERY_SIZES[lottery];
    setPortfolioTargets((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= size) {
        toast.info(`Selecione no máximo ${size} dezenas-alvo para a ${LOTTERY_LABELS[lottery]}`);
        return prev;
      }
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const handleGeneratePortfolio = async () => {
    if (!user) {
      toast.error("Faça login para gerar o portfólio");
      return;
    }
    const size = LOTTERY_SIZES[lottery];
    const targets = portfolioTargets.length >= size ? portfolioTargets.slice(0, size) : [];
    try {
      await generatePortfolioMutation.mutateAsync({
        lotteryType: lottery,
        targetNumbers: targets,
        count: 33,
      });
      toast.success(`Portfólio de 33 jogos da ${LOTTERY_LABELS[lottery]} gerado pelo motor cognitivo — clique em "Conferir último sorteio" para evoluí-lo.`);
      await utils.loterias.listPortfolios.invalidate();
      await utils.loterias.portfolioEvolution.invalidate({ portfolioId: currentPortfolio?.id ?? 0 });
      setCheckResult(null);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao gerar o portfólio");
    }
  };

  const handleCheckPortfolio = async () => {
    if (!user || !currentPortfolio) {
      toast.error("Gere o portfólio primeiro");
      return;
    }
    try {
      const res = await checkPortfolioMutation.mutateAsync({ lotteryType: lottery });
      setCheckResult({ drawNumber: res.drawNumber, drawDate: res.drawDate, drawn: res.drawn, check: res.check, message: res.evolutionMessage });
      if (res.check.hits15 > 0) toast.success(`🏆 ${res.check.hits15} jogo(s) com 15 acertos no concurso #${res.drawNumber}!`);
      else if (res.check.hits14 > 0) toast.success(`${res.check.hits14} jogo(s) com 14 acertos no concurso #${res.drawNumber}!`);
      else if (res.check.hits13Plus > 0) toast.success(`${res.check.hits13Plus} jogo(s) com 13+ acertos no concurso #${res.drawNumber}!`);
      else toast.info(`Melhor resultado no concurso #${res.drawNumber}: ${res.check.bestHits} acertos. ${res.evolutionMessage}`);
      if (res.disclaimer) toast.info(res.disclaimer);
      await utils.loterias.listPortfolios.invalidate();
      await utils.loterias.portfolioEvolution.invalidate({ portfolioId: res.portfolioId });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao conferir o portfólio");
    }
  };

  const portfolioHitsDist = useMemo(() => {
    if (!portfolioEvolution || portfolioEvolution.length === 0) return [];
    return [...portfolioEvolution]
      .sort((a, b) => a.drawNumber - b.drawNumber)
      .map((e) => ({ concurso: `#${e.drawNumber}`, "15 pts": e.hits15, "14 pts": e.hits14, "13 pts": e.hits13Plus - e.hits14, "12 pts": (e.hitsDist as Record<string, number>)?.hits12 ?? 0, "11 pts": (e.hitsDist as Record<string, number>)?.hits11 ?? 0 }));
  }, [portfolioEvolution]);

  const evolutionLine = useMemo(() => {
    if (!portfolioEvolution || portfolioEvolution.length === 0) return [];
    return [...portfolioEvolution]
      .sort((a, b) => a.drawNumber - b.drawNumber)
      .map((e) => ({ concurso: `#${e.drawNumber}`, bestHits: e.bestHits }));
  }, [portfolioEvolution]);

  // ---------- Fase 27: ranking de dezenas do backtest + alerta de aquecimento ----------
  const { data: numberRanking, isLoading: rankingLoading } = trpc.loterias.numberRanking.useQuery(
    { type: lottery },
    { enabled: !!stats },
  );
  const { data: warmup } = trpc.loterias.warmupAlerts.useQuery({ type: lottery }, { enabled: !!stats });

  // Fase 26: comparação de períodos lado a lado (30 vs 90 dias)
  const { data: stats30 } = trpc.loterias.stats.useQuery({ type: lottery, period: "30" }, { enabled: !!stats });
  const { data: stats90 } = trpc.loterias.stats.useQuery({ type: lottery, period: "90" }, { enabled: !!stats });
  const warmedNumbers = useMemo(() => new Set(warmup?.numbers.map((w) => w.number) ?? []), [warmup]);

  const comparisonData = useMemo(() => {
    const f30 = stats30?.frequency ?? [];
    const f90 = stats90?.frequency ?? [];
    if (f30.length === 0 || f90.length === 0) return [];
    const by90 = new Map(f90.map((f) => [f.number, f.frequency]));
    return [...f30]
      .sort((a, b) => a.number - b.number)
      .map((f) => ({ name: String(f.number), "30d": f.frequency, "90d": by90.get(f.number) ?? 0 }));
  }, [stats30, stats90]);


  const handleToggleSimNumber = (n: number) => {
    setSimNumbers((prev) => {
      if (prev.includes(n)) return prev.filter((x) => x !== n);
      if (prev.length >= LOTTERY_SIZES[lottery]) {
        toast.info(`A ${LOTTERY_LABELS[lottery]} usa exatamente ${LOTTERY_SIZES[lottery]} dezenas`);
        return prev;
      }
      return [...prev, n].sort((a, b) => a - b);
    });
  };

  const handlePersistWarmup = async (type: LotteryType) => {
    if (!user) {
      toast.error("Faça login para registrar alertas de aquecimento");
      return;
    }
    try {
      const res = await warmupHistoryMutation.mutateAsync({ type, persist: true });
      if (res.newEvents.length > 0) {
        toast.success(`🔥 ${res.newEvents.length} dezena(s) nova(s) em aquecimento na ${LOTTERY_LABELS[type]} — notificação enviada.`);
      } else {
        toast.info(`Nenhuma dezena nova em aquecimento na ${LOTTERY_LABELS[type]} no momento.`);
      }
      await utils.loterias.warmupEvents.invalidate();
      await utils.loterias.warmupAlerts.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao registrar os aquecimentos");
    }
  };

  const collectHistoryMutation = trpc.loterias.collectHistory.useMutation();
  const trainModelMutation = trpc.loterias.trainModel.useMutation();

  const currentModel = lstmModels?.find((m) => m.lotteryType === lottery) ?? null;

  const handleCollectHistory = async () => {
    if (!user) {
      toast.error("Faça login para iniciar a coleta histórica completa");
      return;
    }
    try {
      await collectHistoryMutation.mutateAsync({ type: lottery });
      toast.success("Coleta histórica iniciada em segundo plano — milhares de concursos serão buscados na Caixa. Acompanhe no painel de coleções.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar a coleta histórica");
    }
  };

  const handleTrainLstm = async () => {
    if (!user) {
      toast.error("Faça login para treinar o modelo");
      return;
    }
    try {
      const res = await trainModelMutation.mutateAsync({ type: lottery });
      toast.success(`Treinamento LSTM da ${LOTTERY_LABELS[lottery]} iniciado em segundo plano (modelo #${res.modelId}).`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao iniciar o treinamento");
    }
  };
  const collectMutation = trpc.loterias.collect.useMutation();

  // ---------- Fase 23: apostas salvas + alertas ----------

  const { data: bets, isLoading: betsLoading, refetch: refetchBets } = trpc.loterias.listBets.useQuery(
    { type: lottery },
    { enabled: !!user, refetchInterval: 60000 },
  );
  const { data: alerts } = trpc.loterias.getAlerts.useQuery(undefined, { enabled: !!user });
  const { data: latestDraw } = trpc.loterias.latestDraw.useQuery({ type: lottery });

  const saveBetMutation = trpc.loterias.saveBet.useMutation();
  const setAlertMutation = trpc.loterias.setAlert.useMutation();
  const removeAlertMutation = trpc.loterias.removeAlert.useMutation();

  // ---------- Fase 24: estatísticas pessoais + exportação ----------
  const { data: myStats } = trpc.loterias.betStats.useQuery(undefined, { enabled: !!user });
  const exportBetMutation = trpc.loterias.exportBet.useMutation();

  // Fase 24: importação de aposta compartilhada
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [importCode, setImportCode] = useState("");
  const importBetMutation = trpc.loterias.importBet.useMutation();

  const handleImportBet = async () => {
    const code = importCode.trim();
    if (!code) {
      toast.error("Cole o código de compartilhamento da aposta");
      return;
    }
    try {
      const res = await importBetMutation.mutateAsync({ code });
      toast.success(`Aposta importada para ${LOTTERY_LABELS[res.type as LotteryType]}! Ela será conferida automaticamente.`);
      setImportCode("");
      setImportDialogOpen(false);
      await utils.loterias.listBets.invalidate();
      await utils.loterias.betStats.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao importar a aposta");
    }
  };

  const handleCopyNumbers = async (numbers: number[]) => {
    const text = `Loteria: ${LOTTERY_LABELS[lottery]}\nDezenas: ${numbers.slice().sort((a, b) => a - b).join(" - ")}`;
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Dezenas copiadas em formato de lotérica!");
    } catch {
      toast.error("Não foi possível copiar — seu navegador bloqueou o acesso à área de transferência.");
    }
  };

  const handleShareBet = async (numbers: number[]) => {
    try {
      const res = await exportBetMutation.mutateAsync({ type: lottery, drawNumber: 0, numbers });
      await navigator.clipboard.writeText(res.code);
      toast.success("Código de compartilhamento copiado! Envie ao amigo que poderá importar em /loterias.");
    } catch {
      toast.error("Falha ao gerar o código de compartilhamento");
    }
  };

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

  const handleSaveBet = async (numbers: number[]) => {
    try {
      await saveBetMutation.mutateAsync({ type: lottery, drawNumber: 0, numbers });
      toast.success("Aposta salva! Ela será conferida automaticamente quando o concurso sair.");
      await refetchBets();
      await utils.loterias.listBets.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar a aposta");
    }
  };

  const handleSetAlert = async () => {
    if (!alertValue.trim()) {
      toast.error("Informe o valor do limiar em reais (ex.: 10000000)");
      return;
    }
    try {
      await setAlertMutation.mutateAsync({ type: lottery, thresholdBRL: alertValue.trim() });
      toast.success(`Alerta de acumulado salvo — você será notificado quando o prêmio ultrapassar R$ ${alertValue.trim()}.`);
      setAlertValue("");
      setAlertDialogOpen(false);
      await utils.loterias.getAlerts.invalidate();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao salvar o alerta");
    }
  };

  const handleRemoveAlert = async (type: string) => {
    try {
      await removeAlertMutation.mutateAsync({ type: type as LotteryType });
      toast.info("Alerta removido");
      await utils.loterias.getAlerts.invalidate();
    } catch {
      toast.error("Falha ao remover o alerta");
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

  // Fase 24: série temporal de acertos pessoais (gráfica de evolução por loteria)
  const myStatsSeries = useMemo(() => {
    if (!myStats || myStats.series.length === 0) return [];
    return myStats.series.map((s) => ({
      data: s.drawDate ? new Date(s.drawDate).toLocaleDateString("pt-BR") : `Conc. ${s.drawNumber}`,
      hits: s.hits,
      loteria: LOTTERY_LABELS[s.lotteryType as LotteryType] ?? s.lotteryType,
      concurso: s.drawNumber,
    }));
  }, [myStats]);

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
          {/* Filtro de período — Fase 25 */}
          <div className="hidden sm:flex items-center rounded-lg border border-white/10 bg-white/5 p-0.5">
            {([
              { v: "30" as const, label: "30 dias" },
              { v: "60" as const, label: "60 dias" },
              { v: "90" as const, label: "90 dias" },
              { v: "all" as const, label: "Todo" },
            ]).map(({ v, label }) => (
              <button
                key={v}
                onClick={() => setPeriod(v)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  period === v ? "bg-[#7cf3ff]/20 text-[#7cf3ff]" : "text-white/50 hover:text-white"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
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
          {/* Fase 29: portfólio evolutivo de 33 jogos */}
          {lottery === "lotofacil" && (
            <Card className="bg-[#0a0d1a] border-[#a6162e]/40">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Layers className="w-4 h-4 text-[#a6162e]" style={{ color: NEXUS_PURPLE }} /> Portfólio de 33 jogos — {LOTTERY_LABELS.lotofacil}
                </CardTitle>
                <CardDescription className="text-white/50">
                  O motor cognitivo (LSTM + estatística + aquecimento + anomalias + exploração) monta 33 jogos que “cercam” as dezenas-alvo selecionadas, e evolui os pesos a cada concurso: reforça o que acertou 13/14/15 e muda de estratégia quando erra.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-white/70">Selecione as {LOTTERY_SIZES.lotofacil} dezenas-alvo ({portfolioTargets.length}/15)</Label>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {Array.from({ length: LOTTERY_MAX.lotofacil }, (_, i) => i + 1).map((n) => (
                      <button
                        key={n}
                        onClick={() => handleTogglePortfolioNumber(n)}
                        className={`w-8 h-8 rounded-full text-xs font-bold border transition-transform active:scale-95 ${
                          portfolioTargets.includes(n)
                            ? "text-black border-transparent"
                            : "bg-white/5 border-white/15 text-white/70 hover:border-[#c9b8ff]/50"
                        }`}
                        style={portfolioTargets.includes(n) ? { background: LOTTERY_COLORS.lotofacil } : undefined}
                      >
                        {String(n).padStart(2, "0")}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    className="bg-[#a6162e] hover:bg-[#c01a36] text-white"
                    onClick={handleGeneratePortfolio}
                    disabled={generatePortfolioMutation.isPending || !hasData}
                  >
                    {generatePortfolioMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
                    Gerar / Atualizar 33 jogos
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#7cf3ff]/40 text-[#7cf3ff] hover:bg-[#7cf3ff]/10"
                    onClick={handleCheckPortfolio}
                    disabled={checkPortfolioMutation.isPending || !currentPortfolio}
                  >
                    {checkPortfolioMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
                    Conferir último sorteio
                  </Button>
                </div>
                {checkResult && (
                  <div className="rounded-lg border border-[#c9b8ff]/30 bg-[#c9b8ff]/5 p-3 text-sm space-y-1">
                    <p className="text-white/80">
                      <strong>Concurso #{checkResult.drawNumber}</strong>{checkResult.drawDate ? ` · ${checkResult.drawDate}` : ""} — melhor jogo: <span className="font-bold text-[#7cff9f]">{checkResult.check.bestHits} acertos</span>
                    </p>
                    <p className="text-white/60 text-xs">
                      Jogos com 13+: {checkResult.check.hits13Plus} · 14 acertos: {checkResult.check.hits14} · 15 acertos: {checkResult.check.hits15} · média: {checkResult.check.avgHits.toFixed(1)}
                    </p>
                    <p className="text-[#c9b8ff] text-xs italic">{checkResult.message}</p>
                  </div>
                )}
                {currentPortfolio && (
                  <div className="space-y-3">
                    <div className="max-h-56 overflow-y-auto rounded-lg border border-white/10 p-3 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 xl:grid-cols-6 gap-1.5">
                      {currentPortfolio.games.map((g: { numbers: number[] }, i: number) => (
                        <div key={i} className="flex flex-wrap gap-0.5 rounded-md bg-white/5 px-1.5 py-1">
                          {(g.numbers as number[]).map((n: number) => (
                            <span key={n} className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold text-black" style={{ background: LOTTERY_COLORS.lotofacil }}>
                              {n}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                    {portfolioHitsDist.length > 0 && (
                      <div className="grid md:grid-cols-2 gap-4">
                        <div>
                          <p className="text-xs text-white/50 mb-1 flex items-center gap-1"><History className="w-3 h-3" /> Distribuição de acertos por concurso</p>
                          <ResponsiveContainer width="100%" height={180}>
                            <BarChart data={portfolioHitsDist}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                              <XAxis dataKey="concurso" tick={{ fontSize: 10, fill: "#ffffff80" }} />
                              <YAxis tick={{ fontSize: 10, fill: "#ffffff80" }} />
                              <Tooltip contentStyle={{ background: "#0a0d1a", border: "1px solid #7cf3ff40", borderRadius: 8 }} />
                              <Legend wrapperStyle={{ fontSize: 11 }} />
                              <Bar dataKey="15 pts" stackId="a" fill="#7cff9f" />
                              <Bar dataKey="14 pts" stackId="a" fill={NEXUS_GOLD} />
                              <Bar dataKey="13 pts" stackId="a" fill={NEXUS_PURPLE} />
                              <Bar dataKey="12 pts" stackId="b" fill="#5ba4ff" />
                              <Bar dataKey="11 pts" stackId="b" fill="#ffffff30" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div>
                          <p className="text-xs text-white/50 mb-1 flex items-center gap-1"><TrendingUp className="w-3 h-3" /> Evolução do melhor resultado (metas 13 / 14 / 15)</p>
                          <ResponsiveContainer width="100%" height={180}>
                            <LineChart data={evolutionLine}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#ffffff15" />
                              <XAxis dataKey="concurso" tick={{ fontSize: 10, fill: "#ffffff80" }} />
                              <YAxis domain={[0, 15]} ticks={[0, 10, 11, 12, 13, 14, 15]} tick={{ fontSize: 10, fill: "#ffffff80" }} />
                              <Tooltip contentStyle={{ background: "#0a0d1a", border: "1px solid #7cf3ff40", borderRadius: 8 }} />
                              <Line type="monotone" dataKey="bestHits" stroke={NEXUS_CYAN} strokeWidth={2} dot={{ r: 2 }} />
                            </LineChart>
                          </ResponsiveContainer>
                          <div className="flex gap-2 text-[10px] text-white/40 mt-1">
                            <span>linha 13: <span className="text-[#7cff9f]">●</span></span>
                            <span>linha 14: <span className="text-[#ffd479]">●</span></span>
                            <span>linha 15: <span className="text-[#c9b8ff]">●</span></span>
                          </div>
                        </div>
                      </div>
                    )}
                    {currentPortfolio.cognitiveWeights && (
                      <p className="text-[11px] text-white/40">
                        Pesos atuais do motor: LSTM {(currentPortfolio.cognitiveWeights.lstm * 100).toFixed(0)}% · estatístico {(currentPortfolio.cognitiveWeights.statistical * 100).toFixed(0)}% · aquecimento {(currentPortfolio.cognitiveWeights.warmup * 100).toFixed(0)}% · anomalia {(currentPortfolio.cognitiveWeights.anomaly * 100).toFixed(0)}% · exploração {(currentPortfolio.cognitiveWeights.exploration * 100).toFixed(0)}%
                      </p>
                    )}
                  </div>
                )}
                <p className="text-[11px] text-white/35">Cada loteiro custa R$ 3,00 (33 jogos = R$ 99,00). O portfólio cobre as dezenas-alvo de forma balanceada — quanto melhor a escolha dos 15 alvos, maior a probabilidade de atingir 13/14/15. Resultados não garantem prêmio.</p>
              </CardContent>
            </Card>
          )}
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

          {/* Fase 25: coletas históricas em andamento */}
          {collectJobs && collectJobs.some((j) => j.status === "running") && (
            <Card className="bg-[#0a0d1a] border-[#7cf3ff]/30">
              <CardHeader>
                <CardTitle className="text-white text-base flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-[#7cf3ff]" /> Coleção histórica em andamento
                </CardTitle>
                <CardDescription className="text-white/50">Concursos sendo buscados diretamente na Caixa (atualização a cada 5s).</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                {collectJobs.filter((j) => j.status === "running").map((j) => (
                  <div key={j.id} className="flex items-center justify-between rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm">
                    <span className="text-white/80 font-mono">{LOTTERY_LABELS[j.lotteryType as LotteryType]}</span>
                    <span className="text-white/50 text-xs">
                      {j.collectedDraws}/{j.totalDraws} concursos
                    </span>
                    <Badge variant="outline" className="border-[#7cf3ff]/40 text-[#7cf3ff] text-xs">coletando</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Fase 26: painel de backtest por método */}
          <Card className="bg-[#0a0d1a] border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-[#7cff9f]" /> Backtest histórico — {LOTTERY_LABELS[lottery]}
              </CardTitle>
              <CardDescription className="text-white/50">
                {backtest
                  ? `Simulação sobre ${backtest.contests} concursos reais: para cada sorteio, cada método gerou uma aposta usando apenas o histórico anterior e foi comparado ao resultado oficial da Caixa.`
                  : "A taxa de acerto passada é avaliada contra os concursos reais coletados. Requer histórico suficiente (mín. 12 concursos)."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {backtestLoading || !backtest ? (
                <Skeleton className="h-24 bg-white/5" />
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {([
                      { key: "lstm", label: "LSTM", accent: NEXUS_PURPLE },
                      { key: "blend", label: "LSTM + estatístico", accent: NEXUS_CYAN },
                      { key: "estatistico", label: "Estatístico", accent: NEXUS_GOLD },
                      { key: "aleatorio", label: "Aleatório (baseline)", accent: "#ff6b6b" },
                    ] as const).map(({ key, label, accent }) => {
                      const m = backtest.methods[key];
                      return (
                        <div key={key} className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-white/50">{label}</span>
                            {key === "lstm" && !backtest.methods.lstm.contests && (
                              <Badge variant="outline" className="border-[#ffd479]/40 text-[#ffd479] text-[10px]">sem modelo</Badge>
                            )}
                          </div>
                          <div className="mt-1 font-mono text-lg font-bold" style={{ color: accent }}>
                            {m.contests > 0 ? m.avgHits.toFixed(2) : "—"}
                          </div>
                          <div className="text-[10px] text-white/40">
                            {m.contests > 0 ? `${m.totalHits} acertos em ${m.contests} concursos · média/concurso` : "não avaliado"}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-[11px] text-[#ffd479]/80">{backtest.disclaimer}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fase 27: Top dezenas do backtest — taxa de acerto condicional por método + lista combinada */}
          <Card className="bg-[#0a0d1a] border-[#7cff9f]/20">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Check className="w-4 h-4 text-[#7cff9f]" /> Top dezenas do backtest — {LOTTERY_LABELS[lottery]}
              </CardTitle>
              <CardDescription className="text-white/50">
                Dezenas que mais apareceram nos resultados reais quando foram geradas por cada método (taxa de acerto condicional).
                A lista combinada une os métodos com peso (LSTM/blend = 1, estatístico = 0,5, aleatório = 0,2).
              </CardDescription>
            </CardHeader>
            <CardContent>
              {rankingLoading || !numberRanking ? (
                <Skeleton className="h-24 bg-white/5" />
              ) : numberRanking.combined.length === 0 ? (
                <p className="text-sm text-white/50">Requer histórico suficiente (mín. 12 concursos) para calcular o ranking de dezenas.</p>
              ) : (
                <div className="space-y-4">
                  {/* Lista de confiança combinada */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-semibold text-[#7cff9f] uppercase tracking-wide">Lista de confiança combinada</span>
                      <span className="text-[10px] text-white/40">ordenada pela taxa de acerto condicional</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {numberRanking.combined.map((c, i) => (
                        <span
                          key={c.number}
                          className={`relative inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${
                            warmedNumbers.has(c.number) ? "border-[#ffd479]/60 bg-[#ffd479]/15 text-[#ffd479]" : "border-[#7cff9f]/40 bg-[#7cff9f]/10 text-[#7cff9f]"
                          }`}
                        >
                          {String(c.number).padStart(2, "0")}
                          <span className="text-[9px] font-mono opacity-70">{(c.hitRate * 100).toFixed(0)}%</span>
                          {i < 6 && <Flame className="w-3 h-3 opacity-60" />}
                        </span>
                      ))}
                    </div>
                  </div>
                  {/* Tabs por método */}
                  <Tabs defaultValue="combinada">
                    <TabsList className="bg-white/5">
                      {([
                        { v: "combinada", label: "Combinada" },
                        { v: "lstm", label: "LSTM" },
                        { v: "blend", label: "LSTM + estatístico" },
                        { v: "estatistico", label: "Estatístico" },
                      ] as const).map(({ v, label }) => (
                        <TabsTrigger key={v} value={v} className="data-[state=active]:bg-[#7cf3ff]/20">
                          {label}
                        </TabsTrigger>
                      ))}
                    </TabsList>
                    <TabsContent value="combinada" className="mt-3">
                      <RankingTable rows={numberRanking.combined.map((c) => ({ number: c.number, hitRate: c.hitRate, score: c.score, generated: c.score }))} />
                    </TabsContent>
                    <TabsContent value="lstm" className="mt-3">
                      {numberRanking.perMethod.lstm?.length ? (
                        <RankingTable rows={numberRanking.perMethod.lstm} />
                      ) : (
                        <p className="text-xs text-white/50">Sem modelo LSTM treinado — treine o modelo para ver o ranking deste método.</p>
                      )}
                    </TabsContent>
                    <TabsContent value="blend" className="mt-3">
                      <RankingTable rows={numberRanking.perMethod.blend ?? []} />
                    </TabsContent>
                    <TabsContent value="estatistico" className="mt-3">
                      <RankingTable rows={numberRanking.perMethod.estatistico ?? []} />
                    </TabsContent>
                  </Tabs>
                  <p className="text-[11px] text-[#ffd479]/80">
                    Taxa condicional = acertos ÷ vezes que a dezena foi gerada no método. Análise histórica apenas — não prevê resultados futuros.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Fase 28: simulador de aposta manual contra o backtest */}
          <Card className="bg-[#0a0d1a] border-[#7cff9f]/20">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Wallet className="w-4 h-4 text-[#7cff9f]" /> Simulador de aposta — {LOTTERY_LABELS[lottery]}
              </CardTitle>
              <CardDescription className="text-white/50">
                Monte uma aposta manual (exatamente {LOTTERY_SIZES[lottery]} dezenas de 1 a {LOTTERY_MAX[lottery]}) e veja instantaneamente como ela teria performado contra cada concurso real do histórico — com a média do baseline aleatório para referência.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: LOTTERY_MAX[lottery] }, (_, i) => i + 1).map((n) => (
                    <button
                      key={n}
                      onClick={() => void handleToggleSimNumber(n)}
                      className={`inline-flex items-center justify-center w-9 h-9 rounded-full text-xs font-bold transition-all ${
                        simNumbers.includes(n)
                          ? "text-black shadow-[0_0_10px_rgba(124,243,255,0.4)]"
                          : "border border-white/15 bg-white/5 text-white/60 hover:border-[#7cf3ff]/40 hover:text-white"
                      }`}
                      style={simNumbers.includes(n) ? { background: LOTTERY_COLORS[lottery] || NEXUS_CYAN } : undefined}
                      title={String(n).padStart(2, "0")}
                    >
                      {String(n).padStart(2, "0")}
                    </button>
                  ))}
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-white/50">
                  <span>
                    Selecionadas: <strong className="text-white font-mono">{simNumbers.length}/{LOTTERY_SIZES[lottery]}</strong>
                  </span>
                  <span className="text-[10px] text-[#ffd479]/80">
                    {simNumbers.length !== LOTTERY_SIZES[lottery] ? `Faltam ${LOTTERY_SIZES[lottery] - simNumbers.length} dezenas para simular` : "Simulação automática contra os concursos reais"}
                  </span>
                </div>
              </div>
              {simNumbers.length === LOTTERY_SIZES[lottery] && (simResult ? (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-xs text-white/50">Média de acertos</div>
                      <div className="mt-1 font-mono text-lg font-bold text-[#7cff9f]">{simResult.avgHits.toFixed(2)}</div>
                      <div className="text-[10px] text-white/40">em {simResult.contests} concursos avaliados</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-xs text-white/50">Melhor concurso</div>
                      <div className="mt-1 font-mono text-lg font-bold text-[#7cf3ff]">{simResult.maxHits} hits</div>
                      <div className="text-[10px] text-white/40">acertos máximos em um único sorteio</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-xs text-white/50">Média do baseline</div>
                      <div className="mt-1 font-mono text-lg font-bold text-[#ff6b6b]">{simResult.baselineAvgHits.toFixed(2)}</div>
                      <div className="text-[10px] text-white/40">média de 1.000 apostas aleatórias</div>
                    </div>
                    <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                      <div className="text-xs text-white/50">Acima do baseline</div>
                      <div className="mt-1 font-mono text-lg font-bold text-[#ffd479]">{((simResult.baselineAbove / Math.max(simResult.contests, 1)) * 100).toFixed(1)}%</div>
                      <div className="text-[10px] text-white/40">concorssos em que a aposta superou o aleatório</div>
                    </div>
                  </div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-3 py-3">
                    <div className="text-xs font-semibold text-[#c9b8ff] uppercase tracking-wide mb-2">Evolução de acertos (últimos 20 concursos)</div>
                    <ResponsiveContainer width="100%" height={150}>
                      <LineChart data={simResult.hitsHistory.slice(-20)}>
                        <CartesianGrid stroke="rgba(255,255,255,0.06)" strokeDasharray="3 3" />
                        <XAxis dataKey="drawNumber" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} />
                        <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} allowDecimals={false} />
                        <Tooltip contentStyle={{ background: "#0a0d1a", border: "1px solid rgba(255,255,255,0.1)", fontSize: 12 }} />
                        <Line type="monotone" dataKey="hits" stroke={NEXUS_CYAN} strokeWidth={2} dot={{ r: 2, fill: NEXUS_CYAN }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-[#ffd479]/80">{simResult.disclaimer}</p>
                </div>
              ) : (
                <Skeleton className="h-24 bg-white/5" />
              ))}
            </CardContent>
          </Card>

          {/* Fase 25: painel de previsões LSTM */}
          <Card className="bg-[#0a0d1a] border-[#c9b8ff]/30">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <span className="text-[#c9b8ff]">◈</span> Previsão LSTM — {LOTTERY_LABELS[lottery]}
              </CardTitle>
              <CardDescription className="text-white/50">
                {currentModel
                  ? `Modelo treinado: ${currentModel.epochs} épocas · loss ${currentModel.finalLoss ?? "—"}${currentModel.trainedAt ? ` · concluído em ${new Date(currentModel.trainedAt).toLocaleString("pt-BR")}` : ""}`
                  : "Nenhum modelo treinado para esta loteria ainda. Colete a coleção histórica completa e treine o modelo abaixo."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {lstmPreds && lstmPreds.bets.length > 0 ? (
                <div className="space-y-3">
                  {lstmPreds.bets.map((b, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                      <Badge variant="outline" className="border-[#c9b8ff]/40 text-[#c9b8ff] text-xs">{b.method}</Badge>
                      <div className="flex flex-wrap gap-1.5">
                        {b.numbers.map((n) => (
                          <span
                            key={n}
                            className="inline-flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold text-black"
                            style={{ background: LOTTERY_COLORS[lottery] || NEXUS_CYAN }}
                          >
                            {String(n).padStart(2, "0")}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-white/40 ml-auto">confiança {(b.confidence * 100).toFixed(1)}%</span>
                      <button
                        onClick={() => void handleSaveBet(b.numbers)}
                        className="inline-flex items-center gap-1 rounded-md border border-[#7cff9f]/40 bg-white/5 px-2 py-1 text-[10px] font-mono text-[#7cff9f] hover:bg-[#7cff9f]/10 transition-colors"
                        title="Salvar e conferir automaticamente"
                      >
                        Salvar aposta
                      </button>
                    </div>
                  ))}
                  {!lstmPreds.hasModel && (
                    <p className="text-xs text-[#ffd479]/80">
                      {lstmPreds.modelStatus === "training" ? "Modelo ainda em treinamento — apostas geradas pelo método estatístico." : "Sem modelo pronto — apostas geradas pelo método estatístico de frequência/atraso."}
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-sm text-white/50">Nenhum dado suficiente para gerar a previsão.</p>
              )}
              <div className="flex flex-wrap gap-2 mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#c9b8ff]/40 text-[#c9b8ff] hover:bg-[#c9b8ff]/10"
                  onClick={handleTrainLstm}
                  disabled={trainModelMutation.isPending}
                >
                  {trainModelMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Treinando...
                    </>
                  ) : currentModel?.status === "training" ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Em treinamento
                    </>
                  ) : (
                    "Treinar modelo LSTM"
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="border-[#ffd479]/40 text-[#ffd479] hover:bg-[#ffd479]/10"
                  onClick={handleCollectHistory}
                  disabled={collectHistoryMutation.isPending}
                >
                  {collectHistoryMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" /> Iniciando...
                    </>
                  ) : (
                    "Coletar histórico completo"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Fase 28: linha do tempo de alertas de aquecimento */}
          <Card className="bg-[#0a0d1a] border-[#ffd479]/20">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Flame className="w-4 h-4 text-[#ffd479]" /> Linha do tempo de aquecimentos
              </CardTitle>
              <CardDescription className="text-white/50">
                Dezenas frias nos 90 dias que "acenderam" (viraram quentes nos 30 dias) — registradas a cada coleta. Selecione a loteria e clique em Registrar para verificar e disparar a notificação in-app quando houver novidade.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                {(Object.keys(LOTTERY_LABELS) as LotteryType[]).map((t) => (
                  <Button
                    key={t}
                    variant="outline"
                    size="sm"
                    className="border-[#ffd479]/40 text-[#ffd479] hover:bg-[#ffd479]/10"
                    onClick={() => void handlePersistWarmup(t)}
                    disabled={warmupHistoryMutation.isPending}
                  >
                    {warmupHistoryMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Bell className="w-3 h-3" />}
                    Registrar {LOTTERY_LABELS[t]}
                  </Button>
                ))}
              </div>
              {(() => {
                return (
                  <div className="max-h-64 overflow-y-auto space-y-1.5">
                    {(allWarmupHistory?.events ?? []).length === 0 ? (
                      <p className="text-sm text-white/50">Nenhum aquecimento registrado ainda — os eventos surgem quando a coleta diária ou o botão "Registrar" detecta dezenas frias que viraram quentes.</p>
                    ) : (
                      (allWarmupHistory?.events ?? []).map((e: { id: number; lotteryType: string; number: number; detectedAt: string | Date | null; freq90: number; freq30: number; deltaFactor: string }, i: number) => (
                        <div
                          key={e.id}
                          className={`flex flex-wrap items-center gap-2 rounded-lg border px-3 py-1.5 text-xs ${
                            isNewWarmup(e)
                              ? "border-[#ffd479]/60 bg-[#ffd479]/10"
                              : "border-white/10 bg-white/5"
                          }`}
                        >
                          <span className="font-mono text-white/60">#{String(i + 1).padStart(2, "0")}</span>
                          <Badge
                            variant="outline"
                            className={`border-white/20 text-[10px] ${isNewWarmup(e) ? "border-[#ffd479]/60 text-[#ffd479]" : "border-white/20 text-white/60"}`}
                          >
                            {LOTTERY_LABELS[e.lotteryType as LotteryType] ?? e.lotteryType}
                          </Badge>
                          <span
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-[11px] font-bold text-black"
                            style={{ background: LOTTERY_COLORS[e.lotteryType as LotteryType] || NEXUS_CYAN }}
                          >
                            {String(e.number).padStart(2, "0")}
                          </span>
                          <span className="text-white/40">
                            {e.detectedAt ? new Date(e.detectedAt).toLocaleString("pt-BR") : "—"}
                          </span>
                          <span className="text-[10px] text-white/40 ml-auto">
                            freq 90d: {e.freq90} → 30d: {e.freq30} · Δ {parseFloat(e.deltaFactor || "0").toFixed(2)}x
                          </span>
                          {isNewWarmup(e) && <Flame className="w-3 h-3 text-[#ffd479]" />}
                        </div>
                      ))
                    )}
                  </div>
                );
              })()}
              <p className="text-[11px] text-[#ffd479]/80">Persistência na base {allWarmupHistory?.events.length ?? 0} eventos (últimos 60) — a missão diária e o botão Registrar disparam a notificação in-app quando uma dezena nova acende.</p>
            </CardContent>
          </Card>

          {/* Fase 28: relatório da semana */}
          <Card className="bg-[#0a0d1a] border-[#7cf3ff]/20">
            <CardHeader>
              <CardTitle className="text-white text-base flex items-center gap-2">
                <Timer className="w-4 h-4 text-[#7cf3ff]" /> Relatório da semana — todas as loterias
              </CardTitle>
              <CardDescription className="text-white/50">
                Consolidação automática (domingo ~06h10 BRT via missão agendada): dezenas em aquecimento, lista de confiança por método e taxa média de acerto de cada método por loteria.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                variant="outline"
                size="sm"
                className="border-[#7cf3ff]/40 text-[#7cf3ff] hover:bg-[#7cf3ff]/10"
                onClick={() => setReportDialogOpen(true)}
                disabled={!weeklyReport}
              >
                Abrir relatório da semana
              </Button>
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
                      Quantas vezes cada dezena apareceu nos {stats?.totalDraws} sorteios
                      {period !== "all" ? ` dos últimos ${period} dias` : " coletados"}
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

                {/* Fase 26: comparação de períodos lado a lado */}
                <Card className="bg-[#0a0d1a] border-white/10">
                  <CardHeader>
                  <CardTitle className="text-white text-base">
                    Comparação de períodos
                    {warmup?.numbers.length ? (
                      <Badge variant="outline" className="ml-2 border-[#ffd479]/60 text-[#ffd479] text-[10px]">
                        <Flame className="w-3 h-3 mr-1" />
                        {warmup.numbers.length} aquecendo
                      </Badge>
                    ) : null}
                  </CardTitle>
                  <CardDescription className="text-white/50">
                    Frequência por dezena nos últimos 30 vs 90 dias — tendências de aquecimento e resfriamento
                    {warmup?.numbers.length ? ` · ${warmup.numbers.length} dezena${warmup.numbers.length === 1 ? "" : "s"} fria${warmup.numbers.length === 1 ? "" : "s"} nos 90d viraram quente${warmup.numbers.length === 1 ? "" : "s"} nos 30d` : ""}
                  </CardDescription>
                  </CardHeader>
                  <CardContent>
                    {comparisonData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={280}>
                        <BarChart data={comparisonData} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                          <XAxis dataKey="name" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} interval={2} />
                          <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} width={30} />
                          <Tooltip
                            contentStyle={{ background: "#0a0d1a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#fff" }}
                          />
                          <Legend />
                          <Bar dataKey="30d" fill={NEXUS_PURPLE} name="30 dias" radius={[2, 2, 0, 0]} />
                          <Bar dataKey="90d" fill={NEXUS_CYAN} name="90 dias" radius={[2, 2, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-sm text-white/50">Só aparecerá quando houver sorteios suficientes nos últimos 90 dias.</p>
                    )}
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

          {/* Fase 28: Dialog do relatório da semana */}
          <Dialog open={reportDialogOpen} onOpenChange={setReportDialogOpen}>
            <DialogContent className="max-w-3xl bg-[#0a0d1a] border-white/10 max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="text-white flex items-center gap-2">
                  <Timer className="w-5 h-5 text-[#7cf3ff]" /> Relatório da semana — Loterias NEXUS
                </DialogTitle>
                <DialogDescription className="text-white/50">
                  Resumo semanal consolidado: dezenas em aquecimento (30d quente / 90d fria), lista de confiança combinada e taxa média de acerto de cada método no backtest real.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                {Object.entries(weeklyReport?.sections ?? {}).map(([label, section]) => (
                  <Card key={label} className="bg-white/5 border-white/10">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-white text-sm">{label}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 pt-0">
                      <div>
                        <span className="text-xs font-semibold text-[#ffd479] uppercase tracking-wide">🔥 Em aquecimento</span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {section.warmups.length === 0 ? (
                            <span className="text-xs text-white/50">nenhuma dezena em aquecimento nesta loteria</span>
                          ) : (
                            section.warmups.map((w) => (
                              <span key={w.number} className="inline-flex items-center gap-1 rounded-full border border-[#ffd479]/60 bg-[#ffd479]/15 px-2.5 py-1 text-xs font-bold text-[#ffd479]">
                                {String(w.number).padStart(2, "0")}
                                <span className="text-[9px] font-mono opacity-70">Δ{parseFloat(String(w.deltaFactor)).toFixed(2)}x</span>
                              </span>
                            ))
                          )}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-[#7cff9f] uppercase tracking-wide">Lista de confiança</span>
                        <div className="mt-1.5 flex flex-wrap gap-1.5">
                          {section.confidenceList.slice(0, 15).map((c) => (
                            <span key={c.number} className="inline-flex items-center gap-1 rounded-full border border-[#7cff9f]/40 bg-[#7cff9f]/10 px-2.5 py-1 text-xs font-bold text-[#7cff9f]">
                              {String(c.number).padStart(2, "0")}
                              <span className="text-[9px] font-mono opacity-70">{(c.hitRate * 100).toFixed(0)}%</span>
                            </span>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs font-semibold text-[#7cf3ff] uppercase tracking-wide">Métodos (média de acertos no backtest)</span>
                        <div className="mt-1.5 grid grid-cols-2 lg:grid-cols-4 gap-2">
                          {Object.entries(section.methodRates).map(([k, v]) => (
                            <div key={k} className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
                              <div className="text-[10px] text-white/50">{k === "lstm" ? "LSTM" : k === "blend" ? "LSTM + estatístico" : k === "estatistico" ? "Estatístico" : "Aleatório"}</div>
                              <div className="mt-0.5 font-mono text-sm font-bold text-[#7cf3ff]">{v.avgHits.toFixed(2)}</div>
                              <div className="text-[9px] text-white/40">{v.contests} concursos</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                <p className="text-[11px] text-[#ffd479]/80">{weeklyReport?.disclaimer ?? "Análise estatística do histórico real da Caixa — nenhum método altera a probabilidade matemática de acerto."}</p>
              </div>
            </DialogContent>
          </Dialog>

          {/* Painel de alertas de acumulado (Fase 23) */}
          <Card className="bg-[#0a0d1a] border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Bell className="w-5 h-5 text-[#ffd479]" /> Alertas de acumulado
              </CardTitle>
              <CardDescription className="text-white/50">
                Você recebe uma notificação quando o acumulado da loteria ultrapassar o valor configurado (verificado a cada atualização diária dos dados).
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              {alerts ? (
                <>
                  {alerts.filter((a) => a.lotteryType === lottery).length === 0 && (
                    <span className="text-sm text-white/50">Nenhum alerta ativo para {LOTTERY_LABELS[lottery]}.</span>
                  )}
                  {alerts
                    .filter((a) => a.lotteryType === lottery)
                    .map((a) => (
                      <Badge key={a.id} variant="outline" className="border-[#ffd479]/40 text-[#ffd479] gap-2">
                        R$ {formatBRL(a.thresholdBRL)}
                        <button onClick={() => handleRemoveAlert(a.lotteryType)} className="hover:text-white transition-colors" title="Remover">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </Badge>
                    ))}
                </>
              ) : (
                <Skeleton className="h-6 w-32 bg-white/10" />
              )}
              <Button
                variant="outline"
                size="sm"
                className="border-[#ffd479]/40 text-[#ffd479] hover:bg-[#ffd479]/10"
                onClick={() => setAlertDialogOpen(true)}
              >
                Configurar alerta
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="border-[#c9b8ff]/40 text-[#c9b8ff] hover:bg-[#c9b8ff]/10"
                onClick={() => setImportDialogOpen(true)}
              >
                Importar aposta
              </Button>
            </CardContent>
          </Card>

          {/* Minhas apostas — conferência automática (Fase 23) */}
          <Card className="bg-[#0a0d1a] border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <Wallet className="w-5 h-5 text-[#7cff9f]" /> Minhas apostas
              </CardTitle>
              <CardDescription className="text-white/50">
                Apostas salvas são conferidas automaticamente quando o concurso correspondente é coletado (job diário) ou ao abrir esta página.
                {latestDraw ? ` Último concurso de ${LOTTERY_LABELS[lottery]}: #${latestDraw.drawNumber}.` : ""}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {betsLoading ? (
                <Skeleton className="h-16 bg-white/5" />
              ) : !bets || bets.length === 0 ? (
                <p className="text-sm text-white/50">Nenhuma aposta salva. Gere uma aposta estatística e clique em “Salvar aposta”.</p>
              ) : (
                <div className="space-y-2">
                  {bets.map((b) => (
                    <div key={b.id} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
                      <span className="text-xs text-white/40">Concurso {b.drawNumber === 0 ? "mais recente" : `#${b.drawNumber}`}</span>
                      <div className="flex flex-wrap gap-1.5">
                        {(b.numbers as number[]).map((n) => (
                          <span
                            key={n}
                            className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-black"
                            style={{ background: LOTTERY_COLORS[lottery] || NEXUS_CYAN }}
                          >
                            {String(n).padStart(2, "0")}
                          </span>
                        ))}
                      </div>
                      {b.checked === 1 ? (
                        <Badge variant="outline" className="border-[#7cff9f]/40 text-[#7cff9f]">
                          <Check className="w-3 h-3 mr-1" /> {b.hits} acerto{Number(b.hits) === 1 ? "" : "s"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-white/20 text-white/50">Aguardando conferência</Badge>
                      )}
                      <div className="flex gap-1.5 ml-auto">
                        <button
                          onClick={() => void handleCopyNumbers(b.numbers as number[])}
                          className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-mono text-white/60 hover:text-[#7cf3ff] hover:border-[#7cf3ff]/40 transition-colors"
                          title="Copiar dezenas em formato de lotérica"
                        >
                          Copiar dezenas
                        </button>
                        <button
                          onClick={() => void handleShareBet(b.numbers as number[])}
                          className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-mono text-white/60 hover:text-[#7cf3ff] hover:border-[#7cf3ff]/40 transition-colors"
                          title="Gerar código base64 para compartilhar"
                        >
                          Compartilhar
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Meus acertos — evolução pessoal (Fase 24) */}
          <Card className="bg-[#0a0d1a] border-white/10">
            <CardHeader>
              <CardTitle className="text-white text-lg flex items-center gap-2">
                <TrendingUp className="w-5 h-5 text-[#c9b8ff]" /> Meus acertos
              </CardTitle>
              <CardDescription className="text-white/50">
                Evolução dos acertos nas apostas salvas, conferidas contra os resultados oficiais da Caixa.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {myStats?.series.length ? (
                <div className="grid lg:grid-cols-4 gap-4">
                  <ResponsiveContainer width="100%" height={260} className="lg:col-span-3">
                    <LineChart data={myStatsSeries} margin={{ top: 5, right: 15, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" />
                      <XAxis dataKey="data" stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                      <YAxis stroke="rgba(255,255,255,0.4)" tick={{ fontSize: 10 }} width={26} allowDecimals={false} />
                      <Tooltip
                        contentStyle={{ background: "#0a0d1a", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, color: "#fff" }}
                        labelFormatter={(_l, payload) => (payload?.[0] ? `${payload[0].payload.loteria} — concurso ${payload[0].payload.concurso}` : String(_l))}
                      />
                      <Legend />
                      <Line type="monotone" dataKey="hits" stroke={NEXUS_PURPLE} strokeWidth={2} dot={{ r: 3 }} name="Acertos" />
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="space-y-2">
                    {myStats.summary &&
                      Object.entries(myStats.summary).map(([type, s]) => (
                        <div key={type} className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs">
                          <div className="font-mono text-white/80">{LOTTERY_LABELS[type as LotteryType] ?? type}</div>
                          <div className="text-white/50">
                            {s.bets} apostas · {s.totalHits} acertos · máx. {s.maxHits}
                          </div>
                        </div>
                      ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-white/50">
                  Ainda não há apostas conferidas. Salve apostas nesta página e acompanhe sua evolução aqui após cada conferência.
                </p>
              )}
            </CardContent>
          </Card>

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
              <div key={i} className="flex flex-wrap items-center gap-3 rounded-lg border border-white/10 bg-white/5 px-3 py-2">
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
                <div className="flex gap-1.5 ml-auto">
                  <button
                    onClick={() => void handleCopyNumbers(bet)}
                    className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-mono text-white/60 hover:text-[#7cf3ff] hover:border-[#7cf3ff]/40 transition-colors"
                    title="Copiar dezenas em formato de lotérica"
                  >
                    Copiar dezenas
                  </button>
                  <button
                    onClick={() => void handleShareBet(bet)}
                    className="inline-flex items-center gap-1 rounded-md border border-white/15 bg-white/5 px-2 py-1 text-[10px] font-mono text-white/60 hover:text-[#7cf3ff] hover:border-[#7cf3ff]/40 transition-colors"
                    title="Gerar código base64 para compartilhar"
                  >
                    Compartilhar
                  </button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-[#7cff9f]/40 text-[#7cff9f] hover:bg-[#7cff9f]/10"
                    onClick={() => void handleSaveBet(bet)}
                  >
                    Salvar aposta
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de importação de aposta compartilhada (Fase 24) */}
      <Dialog open={importDialogOpen} onOpenChange={setImportDialogOpen}>
        <DialogContent className="bg-[#0a0d1a] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Importar aposta compartilhada</DialogTitle>
            <DialogDescription className="text-white/50">
              Cole o código gerado por outro usuário do NEXUS. A aposta será salva e conferida automaticamente quando o concurso sair.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="import-code" className="text-white/70">
                Código de compartilhamento (base64)
              </Label>
              <Input
                id="import-code"
                className="bg-white/5 border-white/15 text-white font-mono"
                placeholder="NxUe..."
                value={importCode}
                onChange={(e) => setImportCode(e.target.value)}
              />
            </div>
            <Button
              className="bg-[#c9b8ff]/15 text-[#c9b8ff] border border-[#c9b8ff]/40 hover:bg-[#c9b8ff]/25 w-full"
              onClick={handleImportBet}
            >
              Importar aposta
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Dialog de alerta de acumulado (Fase 23) */}
      <Dialog open={alertDialogOpen} onOpenChange={setAlertDialogOpen}>
        <DialogContent className="bg-[#0a0d1a] border-white/10 text-white max-w-md">
          <DialogHeader>
            <DialogTitle className="text-white">Alerta de acumulado — {LOTTERY_LABELS[lottery]}</DialogTitle>
            <DialogDescription className="text-white/50">
              Você será notificado quando o acumulado ultrapassar o valor definido (conferido a cada coleta diária).
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="alert-threshold" className="text-white/70">
                Limiar em reais (número puro ou formato brasileiro)
              </Label>
              <Input
                id="alert-threshold"
                className="bg-white/5 border-white/15 text-white"
                placeholder="Ex.: 10.000.000"
                value={alertValue}
                onChange={(e) => setAlertValue(e.target.value)}
              />
            </div>
            <Button
              className="bg-[#ffd479]/15 text-[#ffd479] border border-[#ffd479]/40 hover:bg-[#ffd479]/25 w-full"
              onClick={handleSetAlert}
            >
              Salvar alerta
            </Button>
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

// Fase 27: mini-tabela do ranking de dezenas do backtest
function RankingTable({
  rows,
}: {
  rows: { number: number; hitRate: number; generated: number; hits?: number; score?: number }[];
}) {
  if (rows.length === 0) return <p className="text-xs text-white/50">Sem dados de ranking para este método.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-white/40">
            <th className="py-1.5 pr-2 font-medium">Dezena</th>
            <th className="py-1.5 pr-2 font-medium">Acertos</th>
            <th className="py-1.5 pr-2 font-medium">Geradas</th>
            <th className="py-1.5 pr-2 font-medium">Taxa</th>
            <th className="py-1.5 font-medium">Score</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.number} className="border-t border-white/5">
              <td className="py-1.5 pr-2">
                <span className="inline-flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold text-black" style={{ background: NEXUS_CYAN }}>
                  {String(r.number).padStart(2, "0")}
                </span>
              </td>
              <td className="py-1.5 pr-2 font-mono text-white/80">{r.hits ?? Math.round(r.hitRate * r.generated) ?? "—"}</td>
              <td className="py-1.5 pr-2 font-mono text-white/50">{r.generated ?? "—"}</td>
              <td className="py-1.5 pr-2 font-mono font-bold text-[#7cff9f]">{(r.hitRate * 100).toFixed(1)}%</td>
              <td className="py-1.5 font-mono text-white/50">{typeof r.score === "number" ? r.score.toFixed(1) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
