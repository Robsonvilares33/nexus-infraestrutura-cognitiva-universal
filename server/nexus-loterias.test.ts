import { describe, expect, it } from "vitest";
import {
  computeStats,
  generateStatisticalBet,
  LOTTERY_DRAW_SIZE,
  LOTTERY_MAX_NUMBER,
  LOTTERY_TYPES,
  mulberry32,
  validateNumbers,
} from "./nexus-loterias";
import type { LotteryDraw } from "../drizzle/schema";

function makeDraw(drawNumber: number, numbers: number[], opts: Partial<LotteryDraw> = {}): LotteryDraw {
  return {
    id: drawNumber,
    lotteryType: "megasena",
    drawNumber,
    drawDate: null,
    numbers,
    accumulatedPrize: "0",
    estimatedNextPrize: "0",
    winners: null,
    collectedAt: new Date(),
    ...opts,
  };
}

describe("validateNumbers", () => {
  it("aceita dezenas válidas da Mega-Sena", () => {
    expect(validateNumbers("megasena", [1, 10, 23, 42, 55, 60])).toBe(true);
  });
  it("rejeita dezena acima do máximo", () => {
    expect(validateNumbers("megasena", [1, 2, 3, 4, 5, 61])).toBe(false);
  });
  it("rejeita dezena zero", () => {
    expect(validateNumbers("quina", [0, 1, 2, 3, 4])).toBe(false);
  });
  it("rejeita não-array e array vazio", () => {
    expect(validateNumbers("megasena", "1,2,3")).toBe(false);
    expect(validateNumbers("megasena", [])).toBe(false);
  });
  it("rejeita número fracionário", () => {
    expect(validateNumbers("megasena", [1.5, 2, 3, 4, 5, 6])).toBe(false);
  });
  it("respeita o máximo da Quina (80) e da Lotofácil (25)", () => {
    expect(validateNumbers("quina", [80])).toBe(true);
    expect(validateNumbers("quina", [81])).toBe(false);
    expect(validateNumbers("lotofacil", [25])).toBe(true);
    expect(validateNumbers("lotofacil", [26])).toBe(false);
  });
});

describe("computeStats", () => {
  // 10 concursos Mega-Sena: 5 sai em todos (hot), 60 sai em nenhum (cold),
  // 7 saiu apenas no último concurso anterior ao final (delay=1), 1 nunca sai (delay total).
  // Desenhados para controle exato: 5 sai em todos, 10 sai em 9, 60 sai apenas no draw 100
  // (delay alto), 7 sai no draw 108 (2 atrás do último = delay 1).
  // 10 concursos Mega-Sena controlados: 5 sai em todos (hot); 1 nunca sai
  // (cold + atraso máximo); 7 sai no índice 8 (2 draws antes do último, delay=1);
  // 60 sai apenas no primeiro concurso (delay alto).
  const draws: LotteryDraw[] = Array.from({ length: 10 }, (_, i) => {
    let base: number[];
    if (i === 0) base = [5, 10, 20, 30, 60, 2];
    else if (i === 8) base = [5, 10, 20, 30, 40, 7]; // 7 sai 2 draws antes do último
    else base = [5, 10, 20, 30, 40 + (i % 9), 2];
    return makeDraw(100 + i, base, { accumulatedPrize: i % 3 === 2 ? "500000" : "0" });
  });

  it("calcula frequência e atrasos corretamente", () => {
    const stats = computeStats("megasena", draws);
    expect(stats.totalDraws).toBe(10);
    expect(stats.latestDraw).toBe(109);
    const freq5 = stats.frequency.find((s) => s.number === 5);
    const freq60 = stats.frequency.find((s) => s.number === 60);
    const freq7 = stats.frequency.find((s) => s.number === 7);
    const freq1 = stats.frequency.find((s) => s.number === 1);
    expect(freq5?.frequency).toBe(10);
    expect(freq60?.frequency).toBe(1);
    expect(freq7?.delay).toBe(1);
    expect(freq1?.frequency).toBe(0);
    expect(freq1?.delay).toBe(10); // 1 nunca apareceu — atraso máximo
  });

  it("lista hot/cold/delayed com 10 números cada", () => {
    const stats = computeStats("megasena", draws);
    expect(stats.hot).toHaveLength(10);
    expect(stats.cold).toHaveLength(10);
    expect(stats.delayed).toHaveLength(10);
    expect(stats.hot).toContain(5);
    // 1 nunca apareceu: frequência 0 (cold) e atraso máximo (delayed)
    expect(stats.cold).toContain(1);
    expect(stats.delayed).toContain(1);
    // 60 apareceu apenas 1x, então não está entre os hot
    expect(stats.hot).not.toContain(60);
  });

  it("conta pares comuns sem duplicidade (a-b == b-a)", () => {
    const stats = computeStats("megasena", draws);
    const keys = new Set(stats.commonPairs.map((p) => p.pair.join("-")));
    expect(stats.commonPairs.length).toBe(keys.size);
    // par (5,10) deve ser o mais comum (saiu junto 10 vezes)
    expect(stats.commonPairs[0].pair).toEqual([5, 10]);
    expect(stats.commonPairs[0].count).toBe(10);
  });

  it("identifica concursos acumulados", () => {
    const stats = computeStats("megasena", draws);
    expect(stats.totalAccumulatedCount).toBe(3);
  });

  it("retorna os 10 últimos concursos ordenados crescentemente", () => {
    const stats = computeStats("megasena", draws);
    expect(stats.lastDraws[0].drawNumber).toBeLessThan(stats.lastDraws[9].drawNumber);
    expect(stats.lastDraws).toHaveLength(10);
  });

  it("lida com lista vazia", () => {
    const stats = computeStats("megasena", []);
    expect(stats.totalDraws).toBe(0);
    expect(stats.hot).toHaveLength(10);
  });

  it("funciona para todas as loterias sem erro", () => {
    const tiny: LotteryDraw[] = [makeDraw(1, [1, 2, 3])];
    for (const t of LOTTERY_TYPES) {
      expect(() => computeStats(t, tiny)).not.toThrow();
    }
  });
});

describe("generateStatisticalBet", () => {
  const stats = computeStats(
    "megasena",
    Array.from({ length: 20 }, (_, i) => makeDraw(i + 1, [1, 2, 3, 4, 5, 6 + (i % 5)])),
  );

  it("gera aposta com o tamanho exato da loteria", () => {
    for (const t of LOTTERY_TYPES) {
      const bet = generateStatisticalBet(t, stats, 12345);
      expect(bet).toHaveLength(LOTTERY_DRAW_SIZE[t]);
    }
  });

  it("não repete dezenas e mantém ordenação crescente", () => {
    const bet = generateStatisticalBet("megasena", stats, 99);
    const set = new Set(bet);
    expect(set.size).toBe(bet.length);
    expect([...bet]).toEqual(bet.sort((a, b) => a - b));
  });

  it("dentro do range da loteria", () => {
    const max = LOTTERY_MAX_NUMBER["megasena"];
    const bet = generateStatisticalBet("megasena", stats, 7);
    expect(bet.every((n) => n >= 1 && n <= max)).toBe(true);
  });

  it("é determinística com a mesma seed", () => {
    const a = generateStatisticalBet("megasena", stats, 42);
    const b = generateStatisticalBet("megasena", stats, 42);
    expect(a).toEqual(b);
  });
});

describe("mulberry32", () => {
  it("produz valores no intervalo [0,1) de forma determinística", () => {
    const r1 = mulberry32(7);
    const seq1 = [r1(), r1(), r1()];
    const r2 = mulberry32(7);
    expect([r2(), r2(), r2()]).toEqual(seq1);
    expect(seq1.every((v) => v >= 0 && v < 1)).toBe(true);
  });
});
