import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, publicProcedure, router } from "../_core/trpc";
import { countLotteryDraws, deleteLotteryAlert, insertLotteryBet, insertLotteryDraw, listLotteryAlerts, listLotteryBets, listLotteryDraws, updateLotteryBet, upsertLotteryAlert } from "../db";
import {
  COLLECT_LIMITS,
  LOTTERY_LABELS,
  LOTTERY_TYPES,
  type LotteryType,
  checkBetHits,
  collectAndPersist,
  computeStats,
  generateStatisticalBet,
  validateNumbers,
} from "../nexus-loterias";

// Coleção em andamento (uma coleta por processo, simples)
let collecting: Promise<{ type: string; latest: number | null; collected: number; skipped: number; errors: number }> | null = null;

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
    .input(z.object({ type: z.enum(LOTTERY_TYPES) }))
    .query(async ({ input }) => {
      const rows = await listLotteryDraws(input.type, 2000);
      if (rows.length === 0) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `Nenhum sorteio de ${LOTTERY_LABELS[input.type]} coletado ainda. Use loterias.collect para buscar os dados oficiais da Caixa.`,
        });
      }
      // converter rows do drizzle para o tipo LotteryDraw esperado por computeStats
      return computeStats(input.type, rows as any);
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
});

function parseAlertThreshold(v: string): number | null {
  const cleaned = v.replace(/[^0-9.,]/g, "").replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export type LoteriasRouter = typeof loteriasRouter;
