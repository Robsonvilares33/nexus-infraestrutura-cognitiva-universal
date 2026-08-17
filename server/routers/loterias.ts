import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { addInAppNotification, countLotteryDraws, deleteLotteryAlert, getUserByOpenId, insertLotteryBet, insertLotteryDraw, listCheckedBetsWithDraws, listLotteryAlerts, listLotteryBets, listLotteryDraws, listLotteryModels, listLotteryWarmupEvents, createLotteryCollectJob, createLotteryModel, setLotteryCollectJobStatus, updateLotteryBet, upsertLotteryAlert, listLotteryCollectJobs } from "../db";
import { COLLECT_LIMITS, LOTTERY_LABELS, LOTTERY_TYPES, type LotteryType, backtestByMethod, backtestNumberRanking, blendWithStats, buildLstmDataset, checkBetHits, collectAndPersist, computeStats, drawsWithinDays, generateStatisticalBet, getCachedLstmWeights, lstmPredict, mulberry32ForStats, persistWarmupEvents, simulateBet, startLstmTraining, weeklyReportPayload, type LstmWeights, validateNumbers, warmupAlerts } from "../nexus-loterias";
import { storageGet, storagePut } from "../storage";

// Coleção em andamento (uma coleta por processo, simples)
let collecting: Promise<{ type: string; latest: number | null; collected: number; skipped: number; errors: number }> | null = null;

/**
 * Fase 26: coleta histórica automática. Se não houver nenhum job de coleta
 * histórica concluído para a(s) loteria(s) em questão, cria um job e o
 * executa em background (mesma rotina do collectHistory).
 */
async function ensureAutoHistoryCollection(types: LotteryType[]): Promise<{ type: string; latest: number | null; collected: number; skipped: number; errors: number }> {
  const noop = { type: "history", latest: null as number | null, collected: 0, skipped: 0, errors: 0 };
  if (collecting) return noop;
  const jobs = await listLotteryCollectJobs();
  const typesWithoutDone = types.filter((t) => !jobs.some((j) => j.lotteryType === t && (j.status === "done" || j.status === "running")));
  if (typesWithoutDone.length === 0) return noop;
  const jobIds: Record<string, number> = {};
  for (const t of typesWithoutDone) jobIds[t] = await createLotteryCollectJob(t, COLLECT_LIMITS[t]);
  collecting = (async () => {
    try {
      for (const t of typesWithoutDone) {
        const limit = COLLECT_LIMITS[t];
        await setLotteryCollectJobStatus(jobIds[t], { totalDraws: limit });
        await collectAndPersist(t, limit, async (draw) => {
          await insertLotteryDraw({
            lotteryType: t,
            drawNumber: draw.drawNumber,
            drawDate: draw.drawDate,
            numbers: draw.numbers,
            accumulatedPrize: draw.accumulatedPrize,
            estimatedNextPrize: draw.estimatedNextPrize,
            winners: draw.winners,
          }).catch(() => {});
          return 1;
        });
        await setLotteryCollectJobStatus(jobIds[t], { status: "done", collectedDraws: limit });
      }
    } catch (err) {
      for (const t of typesWithoutDone) await setLotteryCollectJobStatus(jobIds[t], { status: "failed", error: String(err) }).catch(() => {});
    } finally {
      collecting = null;
    }
  })().then(() => ({ type: "history", latest: null, collected: 0, skipped: 0, errors: 0 }));
  return collecting;
}

export const loteriasRouter = router({
  // Lista de loterias suportadas
  list: publicProcedure.query(() =>
    LOTTERY_TYPES.map((t) => ({ type: t, label: LOTTERY_LABELS[t], limit: COLLECT_LIMITS[t] })),
  ),

  // Quantidade de sorteios coletados por loteria
  counts: publicProcedure.query(async () => {
    const counts: Record<string, number> = {};
    for (const t of LOTTERY_TYPES) {
      counts[t] = await countLotteryDraws(t);
    }
    return counts;
  }),

  // Status da coleta em andamento
  collectStatus: publicProcedure.query(() => (collecting ? "running" : "idle")),

  // Coleta resultados da Caixa (backfill). Fire-and-forget; status via collectStatus.
  collect: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES).optional(), limit: z.number().int().min(1).max(1000).optional() }))
    .mutation(async ({ input }) => {
      if (collecting) {
        throw new TRPCError({ code: "CONFLICT", message: "Já existe uma coleta em andamento" });
      }
      const types: LotteryType[] = input.type ? [input.type] : LOTTERY_TYPES;
      let total = { collected: 0, skipped: 0, errors: 0, latest: null as number | null };
      collecting = (async () => {
        try {
          for (const t of types) {
            const limit = input.limit ?? COLLECT_LIMITS[t];
            const res = await collectAndPersist(
              t,
              limit,
              async (draw) =>
                insertLotteryDraw({
                  lotteryType: t,
                  drawNumber: draw.drawNumber,
                  drawDate: draw.drawDate,
                  numbers: draw.numbers,
                  accumulatedPrize: draw.accumulatedPrize,
                  estimatedNextPrize: draw.estimatedNextPrize,
                  winners: draw.winners,
                }),
            );
            total.collected += res.collected;
            total.skipped += res.skipped;
            total.errors += res.errors;
            total.latest = res.latest;
          }
          // Fase 26: inicia a coleta histórica completa automaticamente se ainda não houver job completo
          void ensureAutoHistoryCollection(types).catch(() => {});
        } finally {
          collecting = null;
        }
        return { type: "all", ...total };
      })().then((r) => r);
      // inicia sem aguardar a conclusão
      void collecting;
      return { started: true, types, limit: input.limit };
    }),

  // Últimos N sorteios de uma loteria (para stats)
  draws: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES), limit: z.number().int().min(1).max(2000).default(1000) }))
    .query(async ({ input }) => listLotteryDraws(input.type, input.limit)),

  // Estatísticas completas (frequência, atraso, quentes/frias, pares, acumulados)
  stats: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES), period: z.union([z.literal("30"), z.literal("60"), z.literal("90"), z.literal("all")]).default("all") }))
    .query(async ({ input }) => {
      const rows = await listLotteryDraws(input.type, 2000);
      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Nenhum sorteio de ${LOTTERY_LABELS[input.type]} coletado ainda. Use loterias.collect para buscar os dados oficiais da Caixa.`,
        });
      }
      const filtered = input.period !== "all" ? drawsWithinDays(rows, parseInt(input.period, 10)) : rows;
      if (filtered.length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Nenhum sorteio de ${LOTTERY_LABELS[input.type]} nos últimos ${input.period} dias.` });
      }
      // converter rows do drizzle para o tipo LotteryDraw esperado por computeStats
      return computeStats(input.type, filtered as any);
    }),

  // Geração de apostas estatísticas (simulação; sorteios são aleatórios)
  generateBets: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES), count: z.number().int().min(1).max(10).default(1) }))
    .query(async ({ input }) => {
      const rows = await listLotteryDraws(input.type, 2000);
      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Nenhum sorteio coletado ainda. Colete os dados com loterias.collect antes de gerar apostas.`,
        });
      }
      const stats = computeStats(input.type, rows as any);
      const seed = Date.now();
      const bets = Array.from({ length: input.count }, (_, i) =>
        generateStatisticalBet(input.type, stats, seed + i),
      );
      return { bets, disclaimer: "Análise estatística apenas — sorteios são aleatórios e não há garantia de acerto." };
    }),

  // ---------- Fase 23: apostas salvas + conferência + alertas ----------

  // Info do concurso mais recente por loteria (para conferência de apostas)
  latestDraw: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES) }))
    .query(async ({ input }) => {
      const rows = await listLotteryDraws(input.type, 1);
      return rows.length > 0 ? rows[rows.length - 1] : null;
    }),

  // Salvar aposta do usuário (drawNumber 0 = conferir contra o concurso mais recente quando sair)
  saveBet: protectedProcedure
    .input(
      z.object({
        type: z.enum(LOTTERY_TYPES),
        drawNumber: z.number().int().min(0),
        numbers: z.array(z.number().int().min(1).max(100)),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      if (!validateNumbers(input.type as LotteryType, input.numbers)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dezenas inválidas para esta loteria (range ou quantidade)." });
      }
      await insertLotteryBet({
        userId: ctx.user.id,
        lotteryType: input.type as LotteryType,
        drawNumber: input.drawNumber,
        numbers: input.numbers,
        hits: null,
        checked: 0,
      });
      return { saved: true };
    }),

  // Listar apostas do usuário em uma loteria (confere automaticamente as pendentes)
  listBets: protectedProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES) }))
    .query(async ({ input, ctx }) => {
      const pending = await listLotteryBets(ctx.user.id, input.type);
      const unchecked = pending.filter((b) => b.checked === 0);
      // desenhar os concursos conhecidos para conferência em lote
      const drawRows = await listLotteryDraws(input.type, 2000);
      const byDraw = new Map<number, (typeof drawRows)[number]>();
      for (const d of drawRows) byDraw.set(d.drawNumber, d);
      for (const b of unchecked) {
        const target = b.drawNumber === 0 ? drawRows[drawRows.length - 1]?.drawNumber ?? 0 : b.drawNumber;
        const draw = target > 0 ? byDraw.get(target) : null;
        if (!draw) continue;
        const hits = checkBetHits(b.numbers as number[], draw.numbers as number[]);
        if (hits !== null) {
          await updateLotteryBet(b.id, { hits, checked: 1 });
        }
      }
      return listLotteryBets(ctx.user.id, input.type);
    }),

  // Alertas de acumulado do usuário
  getAlerts: protectedProcedure.query(async ({ ctx }) => listLotteryAlerts(ctx.user.id)),

  // Salvar/atualizar alerta de acumulado
  setAlert: protectedProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES), thresholdBRL: z.string().min(1).max(20) }))
    .mutation(async ({ input, ctx }) => {
      const value = parseAlertThreshold(input.thresholdBRL);
      if (value === null) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Limiar inválido — use número em reais, ex.: 10000000 ou 10.000.000." });
      }
      await upsertLotteryAlert(ctx.user.id, input.type, String(value), 1);
      return { saved: true, threshold: String(value) };
    }),

  // Remover alerta de acumulado
  removeAlert: protectedProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES) }))
    .mutation(async ({ input, ctx }) => {
      await deleteLotteryAlert(ctx.user.id, input.type);
      return { removed: true };
    }),

  // ---------- Fase 25: coleta histórica completa + modelo LSTM ----------

  // Jobs de coleta histórica (status + progresso)
  listCollectJobs: publicProcedure.query(() => listLotteryCollectJobs()),

  // Dispara a coleta histórica completa (500/300 concursos por loteria)
  collectHistory: protectedProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES).optional() }))
    .mutation(async ({ input }) => {
      if (collecting) throw new TRPCError({ code: "CONFLICT", message: "Já existe uma coleta em andamento" });
      const types: LotteryType[] = input.type ? [input.type] : LOTTERY_TYPES;
      const jobIds: Record<string, number> = {};
      for (const t of types) {
        jobIds[t] = await createLotteryCollectJob(t, COLLECT_LIMITS[t]);
      }
      collecting = (async () => {
        try {
          for (const t of types) {
            const limit = COLLECT_LIMITS[t];
            await setLotteryCollectJobStatus(jobIds[t], { totalDraws: limit });
            await collectAndPersist(t, limit, async (draw) => {
              const n = await insertLotteryDraw({
                lotteryType: t,
                drawNumber: draw.drawNumber,
                drawDate: draw.drawDate,
                numbers: draw.numbers,
                accumulatedPrize: draw.accumulatedPrize,
                estimatedNextPrize: draw.estimatedNextPrize,
                winners: draw.winners,
              });
              void n;
              return 1;
            });
            await setLotteryCollectJobStatus(jobIds[t], { status: "done", collectedDraws: limit });
          }
        } catch (err) {
          for (const t of types) {
            await setLotteryCollectJobStatus(jobIds[t], { status: "failed", error: String(err) });
          }
        } finally {
          collecting = null;
        }
        return { type: "all", collected: 0, skipped: 0, errors: 0, latest: null };
      })().then((r) => r);
      void collecting;
      return { started: true, types, limit: undefined as number | undefined };
    }),

  // Treinar modelo LSTM para uma loteria (background, fire-and-forget)
  trainModel: protectedProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES) }))
    .mutation(async ({ input }) => {
      const rows = await listLotteryDraws(input.type, 2000);
      if (rows.length < 60) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: `Histórico insuficiente para treinar ${LOTTERY_LABELS[input.type]}: preciso de pelo menos 60 sorteios (tenho ${rows.length}). Colete a coleção histórica primeiro.` });
      }
      const modelId = await createLotteryModel(input.type);
      startLstmTraining(input.type, rows, modelId);
      return { started: true, modelId };
    }),

  // Modelos treinados por loteria
  listModels: publicProcedure.query(() => listLotteryModels()),

  // ---------- Fase 26: backtest por método ----------

  // Backtest: taxa de acerto por método comparada ao histórico real coletado
  backtest: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES), limit: z.number().int().min(12).max(2000).optional() }))
    .query(async ({ input }) => {
      const rows = await listLotteryDraws(input.type, 2000);
      if (rows.length < 12) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Histórico insuficiente para o backtest de ${LOTTERY_LABELS[input.type]} (${rows.length} concursos; preciso de pelo menos 12).`,
        });
      }
      let weights: LstmWeights | null = null;
      const cached = getCachedLstmWeights(input.type);
      if (cached) {
        weights = cached;
      } else {
        const models = (await listLotteryModels(input.type)).filter((m) => m.status === "ready" && m.weightsKey);
        if (models[0]) {
          try {
            const url = await storageGet(models[0].weightsKey as string);
            const res = await fetch(url.url);
            weights = ((await res.json()) as LstmWeights) ?? null;
          } catch {
            weights = null;
          }
        }
      }
      return backtestByMethod(input.type, rows, weights, { limit: input.limit });
    }),

  // Fase 27: ranking de dezenas do backtest (taxa de acerto condicional por método + lista combinada)
  numberRanking: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES), limit: z.number().int().min(12).max(2000).optional() }))
    .query(async ({ input }) => {
      const rows = await listLotteryDraws(input.type, 2000);
      if (rows.length < 12) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Histórico insuficiente para o ranking de dezenas de ${LOTTERY_LABELS[input.type]} (${rows.length} concursos; preciso de pelo menos 12).`,
        });
      }
      const weights = getCachedLstmWeights(input.type);
      return backtestNumberRanking(input.type, rows, weights, { limit: input.limit });
    }),

  // Fase 27: alerta de aquecimento — dezenas frias nos 90 dias que viraram quentes nos 30 dias
  warmupAlerts: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES) }))
    .query(async ({ input }) => {
      const rows = await listLotteryDraws(input.type, 2000);
      return warmupAlerts(input.type, rows);
    }),

  // Fase 28: histórico persistido de eventos de aquecimento (com registro de novidades)
  // Fase 28: leitura dos aquecimentos registrados (linha do tempo)
  warmupEvents: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES).optional() }).optional())
    .query(async ({ input }) => {
      const events = await listLotteryWarmupEvents(input?.type, 60);
      return { events };
    }),
  warmupHistory: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES).optional(), persist: z.boolean().default(false) }))
    .mutation(async ({ input }) => {
      let newEvents: Array<{ lotteryType: string; number: number; freq30: number; freq90: number; deltaFactor: string }> = [];
      if (input.persist && input.type) {
        const rows = await listLotteryDraws(input.type, 2000);
        if (rows.length > 0) {
          newEvents = await persistWarmupEvents(input.type, rows);
          if (newEvents.length > 0) {
            try {
              const owner = await getUserByOpenId(process.env.OWNER_OPEN_ID ?? "");
              if (owner?.id) {
                const nums = newEvents.map((e) => e.number).join(", ");
                await addInAppNotification(
                  owner.id,
                  "loterias_warmup",
                  `🔥 Loterias NEXUS: dezenas em aquecimento na ${LOTTERY_LABELS[input.type]}`,
                  `Dezenas frias que esquentaram nos últimos 30 dias: [${nums}] (fator delta ${newEvents.map((e) => e.deltaFactor).join("/\n").slice(0, 40)}).`,
                );
              }
            } catch { /* notificação não crítica */ }
          }
        }
      }
      const rows = await listLotteryWarmupEvents(input.type, 60);
      return { events: rows, newEvents };
    }),

  // Fase 28: simulador de aposta manual contra o histórico real
  simulateBet: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES), numbers: z.array(z.number().int().min(1).max(100)), limit: z.number().int().min(12).max(2000).optional() }))
    .query(async ({ input }) => {
      const rows = await listLotteryDraws(input.type, 2000);
      if (rows.length < 12) {
        throw new TRPCError(
          { code: "NOT_FOUND", message: `Histórico insuficiente para simular a aposta na ${LOTTERY_LABELS[input.type]} (${rows.length} concursos; preciso de pelo menos 12).` },
        );
      }
      if (!validateNumbers(input.type as LotteryType, input.numbers)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dezenas inválidas para esta loteria (range ou quantidade)." });
      }
      return simulateBet(input.type, rows, input.numbers, { limit: input.limit });
    }),

  // Fase 28: relatório semanal consolidado (aquecimentos + confiança + métodos)
  weeklyReport: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES).optional() }))
    .query(async ({ input }) => {
      const types = input.type ? [input.type] : LOTTERY_TYPES;
      const drawsByType: Partial<Record<LotteryType, NonNullable<Awaited<ReturnType<typeof listLotteryDraws>>>>> = {};
      for (const t of types) {
        const rows = await listLotteryDraws(t, 2000);
        if (rows.length >= 12) drawsByType[t] = rows;
      }
      if (Object.keys(drawsByType).length === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Nenhuma loteria com histórico suficiente para o relatório (mínimo 12 concursos)." });
      }
      const weightsByType: Partial<Record<string, LstmWeights>> = {};
      const models = await listLotteryModels();
      const readyByType: Record<string, { weightsKey: string | null }> = {};
      for (const m of models) {
        if (m.status === "ready" && m.weightsKey && !readyByType[m.lotteryType]) readyByType[m.lotteryType] = { weightsKey: m.weightsKey };
      }
      for (const t of Object.keys(drawsByType)) {
        const cached = getCachedLstmWeights(t as LotteryType);
        if (cached) {
          weightsByType[t] = cached;
        } else if (readyByType[t]?.weightsKey) {
          try {
            const url = await storageGet(readyByType[t].weightsKey);
            const res = await fetch(url.url);
            weightsByType[t] = ((await res.json()) as LstmWeights) ?? null;
          } catch { /* sem pesos */ }
        }
      }
      return weeklyReportPayload(drawsByType as Record<LotteryType, NonNullable<typeof drawsByType["megasena"]>>, weightsByType);
    }),

  // Previsão LSTM: combina o modelo treinado com o histórico real
  lstmBet: publicProcedure
    .input(z.object({ type: z.enum(LOTTERY_TYPES), count: z.number().int().min(1).max(5).default(1) }))
    .query(async ({ input }) => {
      const models = (await listLotteryModels(input.type)).filter((m) => m.status === "ready");
      const best = models[0];
      let weights: LstmWeights | null = null;
      if (best?.weightsKey) {
        try {
          const url = await storageGet(best.weightsKey);
          const res = await fetch(url.url);
          weights = ((await res.json()) as LstmWeights) ?? null;
        } catch {
          weights = null;
        }
      }
      const rows = await listLotteryDraws(input.type, 2000);
      const history = rows.map((d) => d.numbers as number[]);
      const out: { numbers: number[]; confidence: number; method: string }[] = [];
      const stats = rows.length > 0 ? computeStats(input.type, rows as any) : null;
      for (let i = 0; i < input.count; i++) {
        if (weights && history.length > 0) {
          const pred = lstmPredict(weights, history);
          const statBet = stats ? generateStatisticalBet(input.type, stats, Date.now() + i) : [];
          const blended = blendWithStats(pred.numbers, statBet);
          out.push({ numbers: blended, confidence: pred.confidence, method: "LSTM" });
        } else if (stats) {
          out.push({ numbers: generateStatisticalBet(input.type, stats, Date.now() + i), confidence: 0, method: "estatístico" });
        }
      }
      return {
        bets: out,
        hasModel: !!weights,
        modelStatus: best?.status ?? "none",
        disclaimer: "Previsão LSTM é exercício estatístico — sorteios são aleatórios e não há garantia de acerto.",
      };
    }),

  // ---------- Fase 24: estatísticas pessoais, exportação e compartilhamento ----------

  // Série temporal de acertos (para gráfico de evolução pessoal)
  betStats: protectedProcedure.query(async ({ ctx }) => {
    const rows = await listCheckedBetsWithDraws(ctx.user.id);
    const series = rows.map((r) => ({
      lotteryType: r.lotteryType,
      drawNumber: r.drawNumber,
      drawDate: r.drawDate ? new Date(r.drawDate).toISOString() : null,
      hits: r.hits ?? 0,
      numbers: r.numbers as number[],
      checkedAt: r.createdAt?.toISOString() ?? null,
    }));
    // resumo por loteria
    const summary: Record<string, { bets: number; totalHits: number; maxHits: number }> = {};
    for (const s of series) {
      const acc = (summary[s.lotteryType] ??= { bets: 0, totalHits: 0, maxHits: 0 });
      acc.bets += 1;
      acc.totalHits += s.hits;
      acc.maxHits = Math.max(acc.maxHits, s.hits);
    }
    return { series, summary };
  }),

  // Exportar aposta em código base64url versionado (compartilhamento)
  exportBet: protectedProcedure
    .input(z.object({
      type: z.enum(LOTTERY_TYPES),
      drawNumber: z.number().int().min(0),
      numbers: z.array(z.number().int().min(1).max(100)),
    }))
    .mutation(async ({ input }) => {
      if (!validateNumbers(input.type as LotteryType, input.numbers)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dezenas inválidas para esta loteria." });
      }
      const code = Buffer.from(
        JSON.stringify({ app: "nexus", v: 1, kind: "lottery-bet", lotteryType: input.type, drawNumber: input.drawNumber, numbers: input.numbers }),
        "utf-8",
      ).toString("base64url");
      return { code, disclaimer: "Código estatístico apenas — sorteios são aleatórios e não há garantia de acerto." };
    }),

  // Importar aposta compartilhada
  importBet: protectedProcedure
    .input(z.object({ code: z.string().min(1).max(1000) }))
    .mutation(async ({ input, ctx }) => {
      let parsed: { app?: string; v?: number; kind?: string; lotteryType?: string; drawNumber?: number; numbers?: unknown };
      try {
        parsed = JSON.parse(Buffer.from(input.code, "base64url").toString("utf-8"));
      } catch {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código de aposta inválido." });
      }
      if (parsed.app !== "nexus" || parsed.kind !== "lottery-bet" || !parsed.lotteryType || !Array.isArray(parsed.numbers)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Código não é uma aposta válida do NEXUS." });
      }
      const type = LOTTERY_TYPES.find((t) => t === parsed.lotteryType);
      if (!type) throw new TRPCError({ code: "BAD_REQUEST", message: "Loteria não suportada no código." });
      if (!validateNumbers(type, parsed.numbers)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Dezenas inválidas para a loteria do código." });
      }
      const drawNumber = Number(parsed.drawNumber) >= 0 ? Number(parsed.drawNumber) : 0;
      await insertLotteryBet({
        userId: ctx.user.id,
        lotteryType: type,
        drawNumber,
        numbers: parsed.numbers as number[],
        hits: null,
        checked: 0,
      });
      return { saved: true, type, drawNumber };
    }),
});

function parseAlertThreshold(v: string): number | null {
  const cleaned = v.replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
    return n;
}

export type LoteriasRouter = typeof loteriasRouter;

