/**
 * Fase 29 — testes do motor de portfólio evolutivo de jogos.
 * Testa a lógica pura (sem banco): cobertura de dezenas-alvo, normalização
 * de pesos, conferência contra sorteio e evolução de pesos por reforço.
 */
import { describe, expect, it } from "vitest";
import type { LotteryDraw } from "../drizzle/schema";
import {
  DEFAULT_PORTFOLIO_WEIGHTS,
  buildLotofacilPortfolio,
  checkPortfolioVsDraw,
  cognitiveNumberScores,
  evolvePortfolioWeights,
  normalizeWeights,
} from "./nexus-loterias";

/** Gera sorteios sintéticos determinísticos da Lotofácil (15 dezenas de 1-25). */
function syntheticDraw(drawNumber: number): LotteryDraw {
  const nums: number[] = [];
  let s = drawNumber * 2654435761;
  for (let i = 0; i < 15; i++) {
    s = (s * 1103515245 + 12345) >>> 0;
    let n = (s % 25) + 1;
    while (nums.includes(n)) {
      s = (s * 1103515245 + 12345) >>> 0;
      n = (s % 25) + 1;
    }
    nums.push(n);
  }
  return {
    id: drawNumber,
    lotteryType: "lotofacil",
    drawNumber,
    drawDate: "2026-08-01",
    numbers: nums.sort((a, b) => a - b),
    accumulatedPrize: "0",
    estimatedNextPrize: "0",
    winners: null,
  } as LotteryDraw;
}

const DRAW_COUNT = 60;
const DRAWS: LotteryDraw[] = Array.from({ length: DRAW_COUNT }, (_, i) => syntheticDraw(i + 100));

describe("Fase 29 — portfólio evolutivo Lotofácil", () => {
  it("normaliza pesos para somar 1", () => {
    const w = normalizeWeights({ lstm: 5, statistical: 5, warmup: 10 });
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("fallback para pesos padrão quando soma é zero", () => {
    const w = normalizeWeights({ lstm: 0, statistical: 0, warmup: 0, anomaly: 0, exploration: 0 });
    expect(Object.keys(w).length).toBe(5);
    expect(Object.values(w).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
  });

  it("gera exatamente 33 jogos com 15 dezenas válidas cada", () => {
    const result = buildLotofacilPortfolio("lotofacil", DRAWS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], { count: 33, seed: 42 });
    expect(result.games).toHaveLength(33);
    for (const g of result.games) {
      expect(g.numbers).toHaveLength(15);
      expect(g.numbers.every((n) => n >= 1 && n <= 25)).toBe(true);
      expect(new Set(g.numbers).size).toBe(15);
    }
  });

  it("cobre cada dezena-alvo em pelo menos minCover jogos", () => {
    const targets = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const result = buildLotofacilPortfolio("lotofacil", DRAWS, targets, { count: 33, seed: 7, minCover: 8 });
    const coverage = new Map<number, number>();
    for (const g of result.games) for (const n of g.numbers) coverage.set(n, (coverage.get(n) ?? 0) + 1);
    for (const t of targets) {
      expect(coverage.get(t) ?? 0).toBeGreaterThanOrEqual(8);
    }
  });

  it("scores cognitivos retornam todos os 25 números", () => {
    const scores = cognitiveNumberScores("lotofacil", DRAWS, DEFAULT_PORTFOLIO_WEIGHTS, [1, 2, 3], 1);
    expect(scores.size).toBe(25);
    // alvos têm score maior que a maioria dos não-alvos
    const targetAvg = [1, 2, 3].reduce((s, n) => s + (scores.get(n) ?? 0), 0) / 3;
    const others = [...scores.entries()].filter(([n]) => ![1, 2, 3].includes(n));
    const otherAvg = others.reduce((s, [, v]) => s + v, 0) / others.length;
    expect(targetAvg).toBeGreaterThan(otherAvg);
  });

  it("conferência: acertos corretos contra sorteio", () => {
    const drawn = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15];
    const games = [
      { numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 16] }, // 14 acertos
      { numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 17, 18] }, // 13 acertos
      { numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 19, 20, 21, 22, 23] }, // 10 acertos
    ];
    const res = checkPortfolioVsDraw(games, drawn);
    expect(res.hitsPerGame).toEqual([14, 13, 10]);
    expect(res.bestHits).toBe(14);
    expect(res.hits13Plus).toBe(2);
    expect(res.hits14).toBe(1);
    expect(res.hits15).toBe(0);
    expect(res.hitsDist.hits14).toBe(1);
    expect(res.hitsDist.hits13).toBe(1);
    expect(res.hitsDist.hits10).toBe(1);
    expect(res.avgHits).toBeCloseTo((14 + 13 + 10) / 3);
  });

  it("conferência com sorteio não coletado retorna zeros", () => {
    const res = checkPortfolioVsDraw([{ numbers: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] }], null);
    expect(res.hitsPerGame).toEqual([0]);
    expect(res.bestHits).toBe(0);
    expect(res.hits13Plus).toBe(0);
  });

  it("evolução reforça LSTM/estatística quando bestHits >= 13", () => {
    const next = evolvePortfolioWeights(null, { hitsPerGame: [], bestHits: 13, hitsDist: {}, hits13Plus: 1, hits14: 0, hits15: 0, avgHits: 12 });
    const base = DEFAULT_PORTFOLIO_WEIGHTS;
    expect(next.lstm).toBeGreaterThan(base.lstm);
    expect(next.statistical).toBeGreaterThan(base.statistical);
    expect(next.exploration).toBeLessThan(base.exploration);
  });

  it("evolução reforça exploration quando bestHits <= 10", () => {
    const next = evolvePortfolioWeights(null, { hitsPerGame: [], bestHits: 10, hitsDist: {}, hits13Plus: 0, hits14: 0, hits15: 0, avgHits: 9 });
    expect(next.exploration).toBeGreaterThan(DEFAULT_PORTFOLIO_WEIGHTS.exploration);
    expect(next.lstm).toBeLessThan(DEFAULT_PORTFOLIO_WEIGHTS.lstm);
  });

  it("evolução reforça warmup/anomaly quando 11 <= bestHits < 13", () => {
    const next = evolvePortfolioWeights(null, { hitsPerGame: [], bestHits: 12, hitsDist: {}, hits13Plus: 0, hits14: 0, hits15: 0, avgHits: 10 });
    expect(next.warmup).toBeGreaterThan(DEFAULT_PORTFOLIO_WEIGHTS.warmup);
    expect(next.anomaly).toBeGreaterThan(DEFAULT_PORTFOLIO_WEIGHTS.anomaly);
  });

  it("pesos evoluídos continuam somando 1 e dentro dos limites", () => {
    const cases = [9, 11, 14];
    for (const hits of cases) {
      const next = evolvePortfolioWeights({ lstm: 0.3, statistical: 0.3, warmup: 0.1, anomaly: 0.1, exploration: 0.2 }, { hitsPerGame: [], bestHits: hits, hitsDist: {}, hits13Plus: 0, hits14: 0, hits15: 0, avgHits: 0 });
      expect(Object.values(next).reduce((a, b) => a + b, 0)).toBeCloseTo(1);
      for (const v of Object.values(next)) expect(v).toBeGreaterThan(0);
    }
  });

  it("seeds diferentes geram portfólios diferentes (diversidade determinística)", () => {
    const a = buildLotofacilPortfolio("lotofacil", DRAWS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], { count: 5, seed: 1 });
    const b = buildLotofacilPortfolio("lotofacil", DRAWS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], { count: 5, seed: 2 });
    const diff = a.games.filter((g, i) => g.numbers.join(",") !== b.games[i].numbers.join(","));
    expect(diff.length).toBeGreaterThan(0);
  });

  it("mesmo seed gera portfólio idêntico (reprodutibilidade)", () => {
    const a = buildLotofacilPortfolio("lotofacil", DRAWS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], { count: 5, seed: 99 });
    const b = buildLotofacilPortfolio("lotofacil", DRAWS, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15], { count: 5, seed: 99 });
    expect(a.games.map((g) => g.numbers.join(",")).join(";")).toBe(b.games.map((g) => g.numbers.join(",")).join(";"));
  });
});
