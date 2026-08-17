import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { countLotteryDraws, insertLotteryDraw, listLotteryDraws } from "../db";
import {
  COLLECT_LIMITS,
  LOTTERY_LABELS,
  LOTTERY_TYPES,
  type LotteryType,
  collectAndPersist,
  computeStats,
  generateStatisticalBet,
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
});

export type LoteriasRouter = typeof loteriasRouter;
