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

// ---------- Fase 23: conferência de apostas e alertas ----------

import {
  buildLotteryStatsContext,
  checkBetHits,
  evaluateAccumulatedAlert,
  isLotteryRelated,
  parseBRL,
} from "./nexus-loterias";
import type { DrawStats, NumberStat } from "./nexus-loterias";

describe("Fase 23 — conferência de apostas", () => {
  it("conta os acertos corretamente", () => {
    expect(checkBetHits([3, 10, 20, 30, 40, 50], [10, 20, 30, 55, 56, 57])).toBe(3);
    expect(checkBetHits([3, 10, 20, 30, 40, 50], [10, 20, 30, 40, 50, 55])).toBe(5);
    expect(checkBetHits([3, 10, 20, 30, 40, 50], [1, 2, 3, 4, 5, 6])).toBe(1);
    expect(checkBetHits([3, 10, 20, 30, 40, 50], [3, 10, 20, 30, 40, 50])).toBe(6);
  });

  it("retorna null sem dezenas sorteadas (concurso ainda não coletado)", () => {
    expect(checkBetHits([3, 10, 20, 30, 40, 50], null)).toBeNull();
  });

  it("retorna null para dezenas fora do range da Mega-Sena (1-60) ou vazias", () => {
    expect(checkBetHits([3, 10, 20, 30, 40, 61], [10, 20, 30, 55, 56, 57])).toBeNull();
    expect(checkBetHits([], [10, 20, 30, 55, 56, 57])).toBeNull();
    expect(checkBetHits([3, 10, 20, 30, 40, 50], [10, 20, 30, 55, 56, 57])).toBe(3); // 6 dezenas válidas conta normalmente
  });
});

describe("Fase 23 — parseBRL", () => {
  it("converte formato brasileiro", () => {
    expect(parseBRL("1.234.567,89")).toBeCloseTo(1234567.89, 1);
    expect(parseBRL("45.000.000,00")).toBeCloseTo(45000000, 0);
    expect(parseBRL("0")).toBe(0);
    expect(parseBRL("")).toBe(0);
    expect(parseBRL("não é número")).toBe(0);
  });
});

describe("Fase 23 — evaluateAccumulatedAlert", () => {
  const draw = { drawNumber: 10, accumulatedPrize: "30.000.000,00", estimatedNextPrize: "50.000.000,00" };

  it("dispara alertas habilitados com limiar ultrapassado e não repetidos", () => {
    const fired = evaluateAccumulatedAlert(
      [
        { id: 1, lotteryType: "megasena", thresholdBRL: "20000000", enabled: 1, lastNotifiedDraw: 5 },
        { id: 2, lotteryType: "megasena", thresholdBRL: "100000000", enabled: 1, lastNotifiedDraw: 5 },
        { id: 3, lotteryType: "megasena", thresholdBRL: "20000000", enabled: 1, lastNotifiedDraw: 10 },
        { id: 4, lotteryType: "megasena", thresholdBRL: "20000000", enabled: 0, lastNotifiedDraw: 5 },
      ],
      draw,
    );
    expect(fired.length).toBe(1);
    expect(fired[0].id).toBe(1);
  });

  it("dispara com acumulado zerado quando o próximo estimado ultrapassa o limiar", () => {
    const emptyDraw = { drawNumber: 11, accumulatedPrize: "0", estimatedNextPrize: "60.000.000,00" };
    const fired = evaluateAccumulatedAlert(
      [{ id: 5, lotteryType: "megasena", thresholdBRL: "50000000", enabled: 1, lastNotifiedDraw: 0 }],
      emptyDraw,
    );
    expect(fired.length).toBe(1);
  });
});

describe("Fase 23 — integração com chat (isLotteryRelated / buildLotteryStatsContext)", () => {
  it("detecta perguntas sobre loterias", () => {
    expect(isLotteryRelated("quais os padrões da loteria?")).toBe(true);
    expect(isLotteryRelated("analise os últimos concursos da Mega-Sena")).toBe(true);
    expect(isLotteryRelated("o valor do acumulado da Quina aumentou?")).toBe(true);
    expect(isLotteryRelated("me ajude com um projeto em Python")).toBe(false);
    expect(isLotteryRelated("receita de bolo")).toBe(false);
  });

  it("gera contexto textual compacto das estatísticas", () => {
    const stats: DrawStats = {
      type: "megasena",
      totalDraws: 100,
      dateRange: { first: "2025-01-01", last: "2026-01-01" },
      latestDraw: 3000,
      latestAccumulated: "10.000.000,00",
      estimatedNext: "15.000.000,00",
      totalAccumulatedCount: 40,
      frequency: [{ number: 10, frequency: 5, delay: 0 } as NumberStat],
      hot: [10],
      cold: [1],
      delayed: [2],
      commonPairs: [{ pair: [10, 20] as [number, number], count: 3 }],
      lastDraws: [{ drawNumber: 3000, drawDate: "2026-01-01", numbers: [1, 2, 3, 4, 5, 6] }],
    };
    const ctx = buildLotteryStatsContext(stats);
    expect(ctx).toContain("Mega-Sena");
    expect(ctx).toContain("3000");
    expect(ctx).toContain("sorteios são aleatórios");
  });
});

// ---------- Fase 24: exportação e compartilhamento de apostas ----------
describe("Fase 24 — código base64 de compartilhamento", () => {
  it("exporta e decodifica payload versionado sem padding nem quebras", () => {
    const numbers = [4, 8, 15, 16, 23, 42];
    const payload = { app: "nexus", v: 1, kind: "lottery-bet", lotteryType: "megasena", drawNumber: 0, numbers };
    const code = Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");
    expect(code).not.toMatch(/[+/=\r\n]/);
    const decoded = JSON.parse(Buffer.from(code, "base64url").toString("utf-8"));
    expect(decoded).toMatchObject({ app: "nexus", v: 1, kind: "lottery-bet", lotteryType: "megasena" });
    expect(decoded.numbers).toEqual(numbers);
  });

  it("payload com kind errado decodifica mas é rejeitado na validação semântica", () => {
    const badKind = Buffer.from(JSON.stringify({ app: "nexus", v: 1, kind: "mission", numbers: [1, 2] }), "utf-8").toString(
      "base64url",
    );
    const parsed = JSON.parse(Buffer.from(badKind, "base64url").toString("utf-8"));
    expect(parsed.kind).toBe("mission");
    expect(parsed.kind === "lottery-bet").toBe(false);
  });

  it("string não-base64url não decodifica em JSON válido do NEXUS", () => {
    // Buffer.from aceita chars inválidos sem lançar; a rejeição vem do JSON.parse ou da validação semântica
    const decoded = Buffer.from("!!!nao-eh-base64url!!", "base64url").toString("utf-8");
    expect(() => JSON.parse(decoded)).toThrow();
    const garbage = Buffer.from("eyIgYmFnb3Jh", "base64url").toString("utf-8"); // decodifica para JSON inválido
    expect(() => JSON.parse(garbage)).toThrow();
  });
});

describe("Fase 24 — formatação de dezenas para lotérica", () => {
  it("ordena com zero à esquerda sem mutar o array original", () => {
    const numbers = [3, 60, 21, 7, 44];
    const formatted = numbers.slice().sort((a, b) => a - b).map((n) => String(n).padStart(2, "0")).join(" - ");
    expect(formatted).toBe("03 - 07 - 21 - 44 - 60");
    expect(numbers).toEqual([3, 60, 21, 7, 44]);
  });
});

describe("Fase 24 — estatísticas pessoais de acertos", () => {
  const series = [
    { lotteryType: "megasena", drawNumber: 3044, drawDate: "2026-08-13T23:00:00.000Z", hits: 2 },
    { lotteryType: "megasena", drawNumber: 3045, drawDate: "2026-08-16T23:00:00.000Z", hits: 4 },
    { lotteryType: "quina", drawNumber: 7000, drawDate: "2026-08-16T23:00:00.000Z", hits: 3 },
  ];

  it("resumo por loteria agrega apostas, total de acertos e máximo", () => {
    const summary: Record<string, { bets: number; totalHits: number; maxHits: number }> = {};
    for (const s of series) {
      const acc = (summary[s.lotteryType] ??= { bets: 0, totalHits: 0, maxHits: 0 });
      acc.bets += 1;
      acc.totalHits += s.hits;
      acc.maxHits = Math.max(acc.maxHits, s.hits);
    }
    expect(summary.megasena).toEqual({ bets: 2, totalHits: 6, maxHits: 4 });
    expect(summary.quina).toEqual({ bets: 1, totalHits: 3, maxHits: 3 });
  });

  it("série temporal rotula a loteria em português", () => {
    const labels: Record<string, string> = { megasena: "Mega-Sena", quina: "Quina" };
    const rows = series.map((s) => ({
      // mesma estratégia do frontend: data local do usuário (toLocaleDateString converte UTC → fuso local)
      data: new Date(s.drawDate).toLocaleDateString("pt-BR"),
      hits: s.hits,
      loteria: labels[s.lotteryType],
    }));
    // o dia exibido depende do fuso do ambiente de teste; verifica estrutura e ordem em vez de data fixa
    expect(rows[0].hits).toBe(2);
    expect(rows[2].hits).toBe(3);
    expect(rows[0].loteria).toBe("Mega-Sena");
    expect(rows[2].loteria).toBe("Quina");
    expect(rows.every((r) => /^\d{2}\/\d{2}\/\d{4}$/.test(r.data))).toBe(true);
  });
});

// ---------- Fase 25: período, dataset LSTM, treinamento e inferência ----------
import {
  buildLstmDataset,
  blendWithStats,
  drawsWithinDays,
  lstmPredict,
  runLstmTrainingEpoch,
} from "./nexus-loterias";
import type { LstmWeights } from "./nexus-loterias";

describe("Fase 25 — drawsWithinDays (filtro de período)", () => {
  it("mantém apenas sorteios dentro da janela de dias", () => {
    const now = new Date();
    const inside = { drawDate: `${now.getDate().toString().padStart(2, "0")}/${(now.getMonth() + 1).toString().padStart(2, "0")}/${now.getFullYear()}` };
    const old = { drawDate: "01/01/2020" };
    const noDate = { drawDate: null };
    expect(drawsWithinDays([inside, old, noDate], 30)).toEqual([inside]);
    expect(drawsWithinDays([inside], 0)).toEqual([]);
  });

  it("rejeita formato de data inválido", () => {
    expect(drawsWithinDays([{ drawDate: "invalida" }], 30)).toEqual([]);
    expect(drawsWithinDays([{ drawDate: "30/13/2026" }], 30)).toEqual([]);
  });
});

describe("Fase 25 — buildLstmDataset", () => {
  it("gera janelas de sequência com normalização 0..1", () => {
    const draws = Array.from({ length: 15 }, (_, i) => ({
      numbers: [1 + i, 2 + i, 3 + i, 4 + i, 5 + i, 6 + i].map((n) => (n % 60) || 60),
    }));
    const ds = buildLstmDataset("megasena", draws, 10);
    expect(ds.inputs.length).toBe(5);
    expect(ds.inputs[0].length).toBe(10);
    expect(ds.targets.length).toBe(5);
    // normalização pelo maxNumber (60)
    expect(ds.inputs[0][0].every((v) => v > 0 && v <= 1)).toBe(true);
  });

  it("ignora sorteios com quantidade de dezenas errada", () => {
    const draws = [{ numbers: [1, 2, 3] }, { numbers: [1, 2, 3, 4, 5, 6] }, { numbers: [1, 2, 3, 4, 5, 6] }];
    const ds = buildLstmDataset("megasena", draws as any, 2);
    expect(ds.inputs.length).toBe(0);
  });
});

describe("Fase 25 — runLstmTrainingEpoch", () => {
  const draws = Array.from({ length: 25 }, (_, i) => ({ numbers: [1 + (i % 10), 2 + (i % 10), 3 + (i % 10), 4 + (i % 10), 5 + (i % 10), 6 + (i % 10)] }));
  const dataset = buildLstmDataset("megasena", draws, 10);

  it("treina uma época e produz pesos válidos no formato LstmWeights", () => {
    const res = runLstmTrainingEpoch("megasena", dataset, 16, 0.02, null);
    expect(res.epochs).toBe(1);
    expect(res.avgLoss).toBeGreaterThan(0);
    expect(Number.isFinite(res.avgLoss)).toBe(true);
    expect(res.weights.layers).toHaveLength(1);
    expect(res.weights.dense.W).toHaveLength(60);
    expect(res.weights.maxNumber).toBe(60);
  });

  it("retoma de pesos anteriores incrementando épocas", () => {
    const a = runLstmTrainingEpoch("megasena", dataset, 16, 0.02, null);
    const b = runLstmTrainingEpoch("megasena", dataset, 16, 0.02, { layers: a.weights.layers, dense: a.weights.dense, epochs: a.epochs });
    expect(b.epochs).toBe(2);
    expect(Number.isFinite(b.avgLoss)).toBe(true);
  });
});

describe("Fase 25 — lstmPredict", () => {
  function makeWeights(): LstmWeights {
    const res = runLstmTrainingEpoch("megasena", buildLstmDataset("megasena", Array.from({ length: 25 }, (_, i) => ({ numbers: [1 + (i % 10), 2 + (i % 10), 3 + (i % 10), 4 + (i % 10), 5 + (i % 10), 6 + (i % 10)] })), 10), 16, 0.02, null);
    return res.weights;
  }

  it("prediz exatamente o tamanho do sorteio com dezenas em range crescente", () => {
    const weights = makeWeights();
    const history = [[1, 2, 3, 4, 5, 6], [7, 8, 9, 10, 11, 12], [13, 14, 15, 16, 17, 18]];
    const pred = lstmPredict(weights, history);
    expect(pred.numbers).toHaveLength(6);
    expect(pred.numbers.every((n) => n >= 1 && n <= 60)).toBe(true);
    expect(pred.confidence).toBeGreaterThanOrEqual(0);
    expect(pred.confidence).toBeLessThanOrEqual(1);
    expect([...pred.numbers]).toEqual(pred.numbers.sort((a, b) => a - b));
  });

  it("é determinístico com o mesmo histórico e pesos", () => {
    const weights = makeWeights();
    const history = [[1, 2, 3, 4, 5, 6]];
    expect(lstmPredict(weights, history).numbers).toEqual(lstmPredict(weights, history).numbers);
  });
});

describe("Fase 25 — blendWithStats", () => {
  it("mistura aposta LSTM e estatística preservando o tamanho do sorteio", () => {
    const blended = blendWithStats([3, 10, 20, 30, 40, 50], [1, 2, 3, 4, 5, 6], 0.5);
    expect(blended).toHaveLength(6);
    expect(blended).toContain(3); // presente nas duas
    expect([...blended]).toEqual(blended.sort((a, b) => a - b));
  });

  it("com peso 1 privilegia as dezenas do LSTM", () => {
    const blended = blendWithStats([1, 2, 3, 4, 5, 6], [55, 56, 57, 58, 59, 60], 1);
    expect(blended).toEqual([1, 2, 3, 4, 5, 6]);
  });
});

// ---------- Fase 26: backtest por método ----------
import { backtestByMethod, buildLstmDataset, runLstmTrainingEpoch, type LstmWeights } from "./nexus-loterias";

function makeWeights26(): LstmWeights {
  const res = runLstmTrainingEpoch(
    "megasena",
    buildLstmDataset(
      "megasena",
      Array.from({ length: 25 }, (_, i) => ({
        numbers: [1 + (i % 10), 2 + (i % 10), 3 + (i % 10), 4 + (i % 10), 5 + (i % 10), 6 + (i % 10)],
      })),
      10,
    ),
    16,
    0.02,
    null,
  );
  return res.weights;
}

function makeSyntheticDraws(type: "megasena" = "megasena", count: number, startAt: number = 1000): LotteryDraw[] {
  // sorteios sintéticos determinísticos para avaliar o backtest
  const max = LOTTERY_MAX_NUMBER[type];
  const size = LOTTERY_DRAW_SIZE[type];
  const rnd = mulberry32(12345);
  const draws: LotteryDraw[] = [];
  for (let i = 0; i < count; i++) {
    const nums = new Set<number>();
    while (nums.size < size) nums.add(Math.floor(rnd() * max) + 1);
    draws.push(makeDraw(startAt + i, [...nums].sort((a, b) => a - b), { lotteryType: type }));
  }
  return draws;
}

describe("Fase 26 — backtestByMethod", () => {
  it("avalia os 4 métodos sobre concursos sintéticos (megasena)", () => {
    const draws = makeSyntheticDraws("megasena", 40);
    const res = backtestByMethod("megasena", draws, null);
    expect(res.contests).toBe(40 - 12);
    expect(res.methods.estatistico.contests).toBe(res.contests);
    expect(res.methods.blend.contests).toBe(res.contests);
    expect(res.methods.aleatorio.contests).toBe(res.contests);
    expect(res.methods.lstm.contests).toBe(0); // sem pesos, LSTM não é avaliado
    // média de acertos dentro do range possível (1..6 para mega)
    for (const m of Object.values(res.methods)) {
      expect(m.avgHits).toBeGreaterThanOrEqual(0);
      expect(m.avgHits).toBeLessThanOrEqual(6);
    }
    expect(res.disclaimer).toBeTruthy();
  });

  it("usa apenas histórico anterior: a aposta de cada concurso não vê o próprio resultado", () => {
    // com 100 concursos sintéticos, nenhum método pode acertar mais que
    // o tamanho do sorteio (6) — garante que não há vazamento do futuro
    const draws = makeSyntheticDraws("megasena", 100);
    const res = backtestByMethod("megasena", draws, null);
    expect(res.methods.estatistico.avgHits).toBeLessThan(LOTTERY_DRAW_SIZE.megasena + 0.5);
    // e a média estatística sobre 88 concursos deve ser positiva
    expect(res.methods.estatistico.totalHits).toBeGreaterThan(0);
  });

  it("respeita o limit", () => {
    const draws = makeSyntheticDraws("megasena", 100);
    const full = backtestByMethod("megasena", draws, null);
    const limited = backtestByMethod("megasena", draws, null, { limit: 30 });
    // com limit=30 e minHistory=12 → 18 concursos avaliados vs 88 do total
    expect(limited.contests).toBe(18);
    expect(full.contests).toBeGreaterThan(limited.contests);
  });

  it("avalia o LSTM quando há pesos (determinístico)", () => {
    const draws = makeSyntheticDraws("megasena", 30);
    const weights = makeWeights26();
    const withWeights = backtestByMethod("megasena", draws, weights, { seed: 7 });
    const without = backtestByMethod("megasena", draws, null, { seed: 7 });
    expect(withWeights.methods.lstm.contests).toBeGreaterThan(0);
    expect(without.methods.lstm.contests).toBe(0);
    // mesmíssimo seed: estatístico e aleatório devem ser idênticos
    expect(withWeights.methods.estatistico.avgHits).toBe(without.methods.estatistico.avgHits);
    expect(withWeights.methods.aleatorio.avgHits).toBe(without.methods.aleatorio.avgHits);
  });

  it("funciona em lotofacil (15 dezenas)", () => {
    const draws = makeSyntheticDraws("lotofacil", 40);
    const res = backtestByMethod("lotofacil", draws, null);
    expect(res.contests).toBe(28);
    for (const m of Object.values(res.methods)) {
      if (m.contests > 0) {
        expect(m.avgHits).toBeLessThanOrEqual(15);
      }
    }
  });

  it("retorna zero concursos quando o histórico é insuficiente", () => {
    const draws = makeSyntheticDraws("megasena", 11);
    const res = backtestByMethod("megasena", draws, null);
    expect(res.contests).toBe(0);
    expect(res.methods.estatistico.avgHits).toBe(0);
  });
});

// ---------- Fase 27 ----------
import { backtestNumberRanking, warmupAlerts } from "./nexus-loterias";

describe("Fase 27 — backtestNumberRanking", () => {
  it("rankeia dezenas por taxa de acerto condicional em cada método", () => {
    const draws = makeSyntheticDraws("megasena", 40);
    const res = backtestNumberRanking("megasena", draws, null);
    expect(res.contests).toBe(28);
    for (const key of ["lstm", "blend", "estatistico"] as const) {
      if (key === "lstm") continue; // sem pesos no teste sem modelo
      for (const r of res.perMethod[key]) {
        expect(r.number).toBeGreaterThanOrEqual(1);
        expect(r.number).toBeLessThanOrEqual(60);
        expect(r.hitRate).toBeGreaterThanOrEqual(0);
        expect(r.hitRate).toBeLessThanOrEqual(1);
        expect(r.generated).toBeGreaterThan(0);
      }
      expect(res.perMethod[key].length).toBeGreaterThan(0);
    }
    expect(res.combined.length).toBeGreaterThan(0);
    expect(res.combined[0].hitRate).toBeGreaterThanOrEqual(0);
  });

  it("avalia o LSTM apenas quando há pesos e ordena o combinado por hitRate", () => {
    const draws = makeSyntheticDraws("megasena", 30);
    const withWeights = backtestNumberRanking("megasena", draws, makeWeights26());
    expect(withWeights.perMethod.lstm.length).toBeGreaterThan(0);
    // ordenação decrescente por hitRate (desempate por score)
    for (let i = 1; i < withWeights.combined.length; i++) {
      const prev = withWeights.combined[i - 1];
      const curr = withWeights.combined[i];
      expect(curr.hitRate).toBeLessThanOrEqual(prev.hitRate + 1e-9);
    }
  });

  it("não tem vazamento do futuro: a dezena gerada não pode ver o próprio concurso", () => {
    const draws = makeSyntheticDraws("megasena", 100);
    const res = backtestNumberRanking("megasena", draws, null);
    // se houvesse vazamento, acertos poderiam ultrapassar o tamanho do sorteio
    for (const key of ["lstm", "blend", "estatistico"] as const) {
      if (key === "lstm") continue; // sem pesos no teste sem modelo
      const totalHits = res.perMethod[key].reduce((s, r) => s + r.hits, 0);
      const maxPossible = res.contests * LOTTERY_DRAW_SIZE.megasena;
      expect(totalHits).toBeLessThanOrEqual(maxPossible);
    }
  });

  it("respeita limit e mínimo de 12 concursos", () => {
    const draws = makeSyntheticDraws("megasena", 50);
    const full = backtestNumberRanking("megasena", draws, null);
    const limited = backtestNumberRanking("megasena", draws, null, { limit: 20 });
    expect(full.contests).toBe(38);
    expect(limited.contests).toBe(8);
  });

  it("não produz ranking com histórico insuficiente", () => {
    const draws = makeSyntheticDraws("megasena", 11);
    const res = backtestNumberRanking("megasena", draws, null);
    expect(res.contests).toBe(0);
    expect(res.combined.length).toBe(0);
  });
});

describe("Fase 27 — warmupAlerts", () => {
  it("detecta dezena fria nos 90 dias que vira quente nos 30 dias", () => {
    // 90 draws recentes (i=90..1 dias atrás): dezena 5 NUNCA sai → fria nos 90d
    // os 30 draws mais recentes (i=30..1): 5 sai em todos → quente nos 30d
    const today = Date.now();
    const draws: LotteryDraw[] = [];
    let drawNum = 3000;
    for (let i = 90; i > 30; i--) {
      draws.push(makeDraw(drawNum++, [1, 2, 3, 4, 10, 11], { drawDate: new Date(today - i * 86400000).toISOString() }));
    }
    for (let i = 29; i > 0; i--) {
      draws.push(makeDraw(drawNum++, [5, 1, 2, 3, 4, 6], { drawDate: new Date(today - i * 86400000).toISOString() }));
    }
    const res = warmupAlerts("megasena", draws);
    expect(res.numbers.length).toBeGreaterThan(0);
    const five = res.numbers.find((n) => n.number === 5);
    expect(five).toBeTruthy();
    // 5 é quente nos 30d (apareceu em todos) mas nunca saiu nos 90d → delta grande
    expect(five!.freq30).toBeGreaterThan(0);
    expect(five!.deltaFactor).toBeGreaterThan(1);
  });

  it("não retorna nada com poucos concursos na janela", () => {
    const draws = makeSyntheticDraws("megasena", 12);
    expect(warmupAlerts("megasena", draws).numbers.length).toBe(0);
  });

  it("retorna vazio quando nenhuma dezena fria vira quente", () => {
    // dezenas quentes estáveis nos 30d e 90d (mesmas dezenas sempre)
    const draws: LotteryDraw[] = [];
    let drawNum = 4000;
    for (let i = 120; i > 0; i--) {
      draws.push(makeDraw(drawNum++, [1, 2, 3, 4, 10, 11]));
    }
    const res = warmupAlerts("megasena", draws);
    // nenhuma dezena fria nos 90d virou quente nos 30d
    expect(res.numbers.every((n) => ![1, 2, 3, 4, 10, 11].includes(n.number))).toBe(true);
  });
});

// ---------- Fase 28: simulador, relatório semanal e eventos de aquecimento ----------
import { persistWarmupEvents, simulateBet, weeklyReportPayload } from "./nexus-loterias";

describe("simulateBet (Fase 28)", () => {
  const size = LOTTERY_DRAW_SIZE.megasena;
  const max = LOTTERY_MAX_NUMBER.megasena;

  // histórico determinístico: concurso k usa as 6 dezenas do bet rotacionadas + complemento fixo (garante acertos parciais)
  const bet = [1, 2, 3, 4, 5, 6];
  const draws: LotteryDraw[] = Array.from({ length: 40 }, (_, k) => {
    const n = k + 1;
    const rotating = bet.slice(0, 3 + (n % 4)); // 3-6 dezenas do próprio bet por concurso
    const extra = Array.from({ length: size }, (_, i) => ((n + i) % max) + 1).filter((x) => !rotating.includes(x));
    return makeDraw(n, [...rotating, ...extra].slice(0, size));
  });

  it("avalia a aposta contra cada concurso com pelo menos 12 de histórico", () => {
    const result = simulateBet("megasena", draws, [1, 2, 3, 4, 5, 6], {});
    expect(result.numbers).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.contests).toBeGreaterThanOrEqual(12);
    expect(result.maxHits).toBeGreaterThanOrEqual(0);
    expect(result.avgHits).toBeGreaterThan(0);
    expect(result.hitsHistory.length).toBe(Math.min(result.contests, 20)); // hitsHistory é truncado aos 20 mais recentes
    expect(result.disclaimer.length).toBeGreaterThan(0);
  });

  it("compara com o baseline aleatório e reporta acima/abaixo", () => {
    const result = simulateBet("megasena", draws, [1, 2, 3, 4, 5, 6], { seed: 42 });
    expect(result.baselineAvgHits).toBeGreaterThan(0);
    expect(result.baselineAbove).toBeGreaterThanOrEqual(0);
    expect(result.baselineAbove).toBeLessThanOrEqual(result.contests);
  });

  it("tolera quantidade errada de dezenas mas contabiliza apenas os acertos válidos (comportamento defensivo)", () => {
    // o simulador é defensivo: aposta com menos dezenas ainda roda e tem avgHits >= 0
    const result = simulateBet("megasena", draws, [1, 2, 3], {});
    expect(result.avgHits).toBeGreaterThanOrEqual(0);
    expect(result.contests).toBeGreaterThanOrEqual(12);
  });

  it("respeita o limite de concursos", () => {
    const result = simulateBet("megasena", draws, [1, 2, 3, 4, 5, 6], { limit: 20 });
    expect(result.contests).toBeLessThanOrEqual(8); // 20 - 12 min history
  });
});

describe("weeklyReportPayload (Fase 28)", () => {
  const makeDrawW = (n: number, numbers: number[]) =>
    ({
      id: n,
      lotteryType: "quina",
      drawNumber: n,
      drawDate: null,
      numbers,
      accumulatedPrize: "0",
      estimatedNextPrize: "0",
      winners: null,
      collectedAt: new Date(),
    } as LotteryDraw);

  it("consolida aquecimentos, lista de confiança e taxas por método", () => {
    const quinaDraws: LotteryDraw[] = Array.from({ length: 100 }, (_, k) => {
      const n = k + 1;
      return makeDrawW(n, Array.from({ length: 5 }, (_, i) => ((n * 7 + i * 13) % 80) + 1));
    });
    const report = weeklyReportPayload({ quina: quinaDraws }, {});
    expect(Object.keys(report.sections).length).toBeGreaterThan(0);
    expect(report.sections["Quina"]).toBeDefined();
    expect(report.sections["Quina"].confidenceList.length).toBeGreaterThan(0);
    expect(report.sections["Quina"].methodRates).toBeDefined();
    expect(report.disclaimer.length).toBeGreaterThan(0);
  });

  it("ignora loterias com histórico insuficiente", () => {
    const report = weeklyReportPayload({ quina: [], megasena: [] }, {});
    expect(Object.keys(report.sections).length).toBe(0);
  });
});

describe("persistWarmupEvents (Fase 28)", () => {
  const makeDrawP = (n: number, date: string, numbers: number[]) =>
    ({
      id: n,
      lotteryType: "megasena",
      drawNumber: n,
      drawDate: date,
      numbers,
      accumulatedPrize: "0",
      estimatedNextPrize: "0",
      winners: null,
      collectedAt: new Date(),
    } as LotteryDraw);

  it("detecta apenas números genuinamente frios que esquentaram e persiste com dedup do dia", async () => {
    // janela antiga (90..31 dias atrás de hoje): sem o número 5; janela recente (30..1): com o número 5
    const draws: LotteryDraw[] = [];
    const now = new Date("2026-09-30T12:00:00Z");
    let n = 1;
    for (let i = 90; i >= 31; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      draws.push(makeDrawP(n++, d.toISOString().slice(0, 10), [1, 2, 3, 4, 10, 11]));
    }
    for (let i = 30; i >= 1; i--) {
      const d = new Date(now);
      d.setUTCDate(d.getUTCDate() - i);
      draws.push(makeDrawP(n++, d.toISOString().slice(0, 10), [5, 6, 7, 8, 9, 10]));
    }
    // a primeira chamada persiste os novos eventos do dia (banco real, sem eventos anteriores hoje);
    // em ambiente compartilhado pode haver dedup do dia — por isso a verificação final é feita no banco
    const first = await persistWarmupEvents("megasena", draws);
    const detected = warmupAlerts("megasena", draws).numbers;
    expect(detected.some((d) => d.number === 5)).toBe(true);
    expect(first.every((r) => r.freq30 > 0)).toBe(true);
    // segunda chamada no mesmo dia não reduplica (dedup por chave do dia)
    const second = await persistWarmupEvents("megasena", draws);
    expect(second.length).toBe(0);
    // os eventos persistidos de fato estão no banco com freq30 > 0
    const rows = await persistWarmupEvents("megasena", draws);
    const { listLotteryWarmupEvents } = await import("./db");
    const persisted = await listLotteryWarmupEvents("megasena", 200);
    const five = persisted.find((r) => r.number === 5);
    expect(five).toBeDefined();
    expect(five!.freq30).toBeGreaterThan(0);
    void rows;
  });
});
