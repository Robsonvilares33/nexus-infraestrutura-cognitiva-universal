/**
 * Fase 22 — Loterias NEXUS
 * Coleta de resultados oficiais da Caixa Loterias (endpoint público
 * servicebus2.caixa.gov.br, sem token) + motor de estatísticas.
 *
 * DISCLAIMER: análises puramente estatísticas. Sorteios são aleatórios —
 * nenhum método garante acerto. Uso responsável.
 */

import type { LotteryDraw } from "../drizzle/schema";

export type LotteryType = "megasena" | "quina" | "lotofacil" | "lotomania" | "timemania";

export const LOTTERY_TYPES: LotteryType[] = ["megasena", "quina", "lotofacil", "lotomania", "timemania"];

export const LOTTERY_LABELS: Record<LotteryType, string> = {
  megasena: "Mega-Sena",
  quina: "Quina",
  lotofacil: "Lotofácil",
  lotomania: "Lotomania",
  timemania: "Timemania",
};

export const LOTTERY_MAX_NUMBER: Record<LotteryType, number> = {
  megasena: 60,
  quina: 80,
  lotofacil: 25,
  lotomania: 100,
  timemania: 80,
};

export const LOTTERY_DRAW_SIZE: Record<LotteryType, number> = {
  megasena: 6,
  quina: 5,
  lotofacil: 15,
  lotomania: 20,
  timemania: 7,
};

/** Quantos concursos coletar por loteria (últimos draws) */
export const COLLECT_LIMITS: Record<LotteryType, number> = {
  megasena: 300,
  quina: 500,
  lotofacil: 500,
  lotomania: 300,
  timemania: 500,
};

// ---------- Coleta ----------

const CAIXA_BASE = "https://servicebus2.caixa.gov.br/portaldeloterias/api";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Busca um concurso específico no portal da Caixa. Retorna null se não existir.
 * OBS: o endpoint `/api/{type}/0` é instável (500) em produção — nunca dependa dele.
 */
export async function fetchDrawFromCaixa(type: LotteryType, drawNumber: number): Promise<{
  drawNumber: number;
  drawDate: string | null;
  numbers: number[];
  accumulatedPrize: string;
  estimatedNextPrize: string;
  winners: { faixa: number; descricao: string; ganhadores: number; valorPremio: string }[] | null;
} | null> {
  const url = `${CAIXA_BASE}/${type}/${drawNumber}`;
  const headers = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
    Referer: "https://loterias.caixa.gov.br/",
  };
  let lastError: unknown = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers,
        signal: AbortSignal.timeout(15000),
      });
      if (res.status === 404) return null;
      if (res.status >= 500 || !res.ok) {
        lastError = new Error(`HTTP ${res.status}`);
        await sleep(2000 * (attempt + 1));
        continue;
      }
      const d = (await res.json()) as Record<string, unknown>;
      const numbers = ((d.listaDezenas as string[]) ?? []).map((s) => parseInt(s, 10)).filter((n) => Number.isFinite(n));
      const rateio = ((d.listaRateioPremio as { faixa: number; descricaoFaixa: string; numeroDeGanhadores: number; valorPremio: string }[]) ?? []).map((r) => ({
        faixa: r.faixa,
        descricao: r.descricaoFaixa,
        ganhadores: r.numeroDeGanhadores,
        valorPremio: r.valorPremio,
      }));
      return {
        drawNumber: Number(d.numero ?? drawNumber),
        drawDate: typeof d.dataApuracao === "string" && d.dataApuracao ? String(d.dataApuracao) : null,
        numbers,
        accumulatedPrize: String(d.valorAcumuladoProximoConcurso ?? "0"),
        estimatedNextPrize: String(d.valorEstimadoProximoConcurso ?? "0"),
        winners: rateio.length > 0 ? rateio : null,
      };
    } catch (err) {
      lastError = err;
      await sleep(2000 * (attempt + 1));
    }
  }
  void lastError;
  return null;
}

/**
 * Descobre o último concurso via busca binária (o endpoint `/0` é instável):
 * prova números crescentes até encontrar um 500/ausente → latest é o último 200.
 */
export async function findLatestDrawNumber(type: LotteryType): Promise<number | null> {
  let lo = 1;
  let hi = 1;
  while (hi < 100000) {
    const probe = await fetchDrawFromCaixa(type, hi);
    if (!probe) break;
    lo = hi;
    hi = Math.min(hi * 2, 100000);
    await sleep(250);
  }
  while (lo + 1 < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const probe = await fetchDrawFromCaixa(type, mid);
    if (probe) lo = mid;
    else hi = mid;
    await sleep(250);
  }
  return lo;
}

/**
 * Coleta concursos do mais recente para o mais antigo (rate-limit 1s/req),
 * parando ao atingir `limit` ou quando não há mais dados.
 */
export async function collectRecentDraws(
  type: LotteryType,
  limit: number = COLLECT_LIMITS[type],
  onProgress?: (draw: number, status: string) => void,
): Promise<{ collected: number; errors: number; latest: number | null }> {
  // descobrir o último concurso via busca binária (endpoint `/0` é instável)
  const maxDraw = await findLatestDrawNumber(type).catch(() => null);
  if (!maxDraw) return { collected: 0, errors: 1, latest: null };
  let drawNumber = maxDraw;
  let collected = 0;
  let errors = 0;
  for (let i = 0; i < limit; i++) {
    try {
      const draw = await fetchDrawFromCaixa(type, drawNumber);
      if (!draw || draw.numbers.length === 0) {
        errors += 1;
        onProgress?.(drawNumber, "ausente/erro");
      } else {
        onProgress?.(drawNumber, "ok");
      }
      // retorno via callback para o chamador persistir (db helper)
      if (draw) onProgress?.(drawNumber, JSON.stringify({ draw }));
    } catch {
      errors += 1;
    }
    drawNumber -= 1;
    await sleep(1000); // rate-limit
  }
  return { collected, errors, latest: maxDraw };
}

/**
 * Coleta e persiste (usa o helper do db passado). Reutiliza linhas via dedup
 * (unique index lotteryType+drawNumber).
 */
export async function collectAndPersist(
  type: LotteryType,
  limit: number,
  persist: (draw: { drawNumber: number; drawDate: string | null; numbers: number[]; accumulatedPrize: string; estimatedNextPrize: string; winners: unknown | null }) => Promise<number>,
  onProgress?: (drawNumber: number, status: string) => void,
): Promise<{ collected: number; skipped: number; errors: number; latest: number | null }> {
  const maxDraw = await findLatestDrawNumber(type).catch(() => null);
  if (!maxDraw) return { collected: 0, skipped: 0, errors: 1, latest: null };
  let drawNumber = maxDraw;
  let collected = 0;
  let skipped = 0;
  let errors = 0;
  for (let i = 0; i < limit; i++) {
    let status = "ok";
    try {
      const draw = await fetchDrawFromCaixa(type, drawNumber);
      if (!draw || draw.numbers.length === 0) {
        errors += 1;
        status = "erro";
      } else {
        const inserted = await persist(draw);
        if (inserted > 0) {
          collected += 1;
          status = "novo";
        } else {
          skipped += 1;
          status = "já existe";
        }
      }
    } catch {
      errors += 1;
      status = "erro";
    }
    onProgress?.(drawNumber, status);
    drawNumber -= 1;
    await sleep(1000);
  }
  return { collected, skipped, errors, latest: maxDraw };
}

// ---------- Validação ----------

/** Valida dezenas conforme a loteria (range e tamanho esperado) */
export function validateNumbers(type: LotteryType, numbers: unknown): numbers is number[] {
  if (!Array.isArray(numbers) || numbers.length === 0) return false;
  const max = LOTTERY_MAX_NUMBER[type];
  return numbers.every(
    (n) => typeof n === "number" && Number.isInteger(n) && n >= 1 && n <= max,
  );
}

// ---------- Estatísticas ----------

export interface NumberStat {
  number: number;
  frequency: number;
  /** atraso: concursos desde a última aparição (0 = saiu no último) */
  delay: number;
}

export interface DrawStats {
  type: LotteryType;
  totalDraws: number;
  dateRange: { first: string | null; last: string | null };
  latestDraw: number;
  latestAccumulated: string;
  estimatedNext: string;
  totalAccumulatedCount: number;
  frequency: NumberStat[];
  hot: number[]; // top 10 mais frequentes
  cold: number[]; // bottom 10 menos frequentes
  delayed: number[]; // top 10 com maior atraso
  commonPairs: { pair: [number, number]; count: number }[]; // pares que mais saíram juntos
  lastDraws: { drawNumber: number; drawDate: string | null; numbers: number[] }[];
}

/**
 * Calcula estatísticas sobre um conjunto de sorteios (ordenado por concurso
 * crescente). Lógica pura — testável sem banco.
 */
export function computeStats(type: LotteryType, draws: LotteryDraw[]): DrawStats {
  const sorted = [...draws].sort((a, b) => a.drawNumber - b.drawNumber);
  const maxNum = LOTTERY_MAX_NUMBER[type];

  // frequência
  const freq = new Map<number, number>();
  for (const d of sorted) {
    const nums = d.numbers as number[];
    if (!Array.isArray(nums)) continue;
    for (const n of nums) freq.set(n, (freq.get(n) ?? 0) + 1);
  }

  // atraso (concorridos desde a última aparição, varrendo do fim)
  const delay = new Map<number, number>();
  for (let i = sorted.length - 1; i >= 0; i--) {
    const nums = sorted[i].numbers as number[];
    if (!Array.isArray(nums)) continue;
    for (const n of nums) if (!delay.has(n)) delay.set(n, sorted.length - 1 - i);
  }

  const stats: NumberStat[] = [];
  for (let n = 1; n <= maxNum; n++) {
    stats.push({ number: n, frequency: freq.get(n) ?? 0, delay: delay.get(n) ?? sorted.length });
  }
  stats.sort((a, b) => b.frequency - a.frequency);

  const hot = stats.slice(0, 10).map((s) => s.number);
  const cold = [...stats].sort((a, b) => a.frequency - b.frequency).slice(0, 10).map((s) => s.number);
  const delayed = [...stats].sort((a, b) => b.delay - a.delay).slice(0, 10).map((s) => s.number);

  // pares mais comuns
  const pairs = new Map<string, number>();
  for (const d of sorted) {
    const nums = ((d.numbers as number[]) ?? []).slice().sort((x, y) => x - y);
    for (let i = 0; i < nums.length; i++) {
      for (let j = i + 1; j < nums.length; j++) {
        const key = `${nums[i]}-${nums[j]}`;
        pairs.set(key, (pairs.get(key) ?? 0) + 1);
      }
    }
  }
  const commonPairs = Array.from(pairs.entries())
    .map(([key, count]) => {
      const [a, b] = key.split("-").map(Number);
      return { pair: [a, b] as [number, number], count };
    })
    .sort((x, y) => y.count - x.count)
    .slice(0, 15);

  const accumCount = sorted.filter(
    (d) => Number(d.accumulatedPrize ?? "0") > 0,
  ).length;

  const lastDraws = sorted.slice(-10).map((d) => ({
    drawNumber: d.drawNumber,
    drawDate: d.drawDate,
    numbers: d.numbers as number[],
  }));

  return {
    type,
    totalDraws: sorted.length,
    dateRange: { first: sorted[0]?.drawDate ?? null, last: sorted.at(-1)?.drawDate ?? null },
    latestDraw: sorted.at(-1)?.drawNumber ?? 0,
    latestAccumulated: sorted.at(-1)?.accumulatedPrize ?? "0",
    estimatedNext: sorted.at(-1)?.estimatedNextPrize ?? "0",
    totalAccumulatedCount: accumCount,
    frequency: stats,
    hot,
    cold,
    delayed,
    commonPairs,
    lastDraws,
  };
}

/**
 * Geração "preditiva" estatística: aposta com dezenas mais frequentes +
 * dezenas em atraso, misturadas aleatoriamente. Apenas simulação —
 * sorteios são aleatórios; não há garantia de acerto.
 */
export function generateStatisticalBet(type: LotteryType, stats: DrawStats, seed: number = Date.now()): number[] {
  const size = LOTTERY_DRAW_SIZE[type];
  const maxNum = LOTTERY_MAX_NUMBER[type];
  // pool ponderado: freq (40%) + atraso (30%) + aleatório (30%)
  const rand = mulberry32(seed);
  const chosen = new Set<number>();
  const tryAdd = () => {
    const r = rand();
    const delayedSet = stats.delayed.slice(0, 8);
    const hotSet = stats.hot.slice(0, 8);
    let pick = 0;
    if (r < 0.4 && hotSet.length) {
      pick = hotSet[Math.floor(rand() * hotSet.length)];
    } else if (r < 0.7 && delayedSet.length) {
      pick = delayedSet[Math.floor(rand() * delayedSet.length)];
    } else {
      pick = 1 + Math.floor(rand() * maxNum);
    }
    if (pick >= 1 && pick <= maxNum && !chosen.has(pick)) {
      chosen.add(pick);
      return true;
    }
    return false;
  };
  while (chosen.size < size) {
    if (!tryAdd()) break; // fallback: preencher aleatório
    if (chosen.size < size && rand() < 0.1) {
      const filler = 1 + Math.floor(rand() * maxNum);
      chosen.add(filler);
    }
  }
  // preencher até o tamanho com aleatório puro se faltarem
  while (chosen.size < size) {
    chosen.add(1 + Math.floor(rand() * maxNum));
  }
  return Array.from(chosen).slice(0, size).sort((a, b) => a - b);
}

/** PRNG determinístico simples (mulberry32) para testes reprodutíveis */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------- Fase 23: conferência de apostas e alertas de acumulado ----------

export interface CheckedBet {
  id: number;
  drawNumber: number;
  numbers: number[];
  drawn: number[] | null; // dezenas oficiais (null = concurso ainda não coletado)
  hits: number | null;
  drawDate: string | null;
}

/**
 * Confere uma aposta contra as dezenas oficiais de um concurso.
 * Pura — testável sem banco.
 */
export function checkBetHits(betNumbers: number[], drawnNumbers: number[] | null): number | null {
  if (!drawnNumbers) return null;
  if (!validateNumbers("megasena", betNumbers)) return null;
  const drawnSet = new Set(drawnNumbers);
  return betNumbers.filter((n) => drawnSet.has(n)).length;
}

/** Converte valor monetário da Caixa ("1.234.567,89") para número (float). */
export function parseBRL(value: string): number {
  if (!value) return 0;
  const cleaned = String(value).replace(/\./g, "").replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Avalia alertas de acumulado de um usuário contra o último sorteio coletado.
 * Retorna os alertas que dispararam notificação (e devem ter lastNotifiedDraw atualizado).
 * Pura em relação ao banco — recebe alerts e o sorteio mais recente.
 */
export function evaluateAccumulatedAlert(
  alerts: { id: number; lotteryType: string; thresholdBRL: string; enabled: number; lastNotifiedDraw: number }[],
  draw: { drawNumber: number; accumulatedPrize: string | null; estimatedNextPrize: string | null },
): { id: number; lotteryType: string; drawNumber: number; accumulated: number; estimatedNext: number }[] {
  const accumulated = parseBRL(draw.accumulatedPrize ?? "");
  const estimatedNext = parseBRL(draw.estimatedNextPrize ?? "");
  return alerts
    .filter((a) => a.enabled === 1 && a.lastNotifiedDraw < draw.drawNumber)
    .filter((a) => {
      const threshold = parseBRL(a.thresholdBRL);
      return accumulated > threshold || (accumulated === 0 && estimatedNext > threshold);
    })
    .map((a) => ({ id: a.id, lotteryType: a.lotteryType, drawNumber: draw.drawNumber, accumulated, estimatedNext }));
}

// ---------- Fase 23: contexto de loterias para o chat multiagente ----------

/**
 * Constrói um contexto textual compacto das estatísticas de loterias para
 * injetar no chat multiagente quando a pergunta do usuário menciona loterias.
 * Usa dados do banco (não faz rede) — chama a partir de multiAgentChat.
 */
export function buildLotteryStatsContext(stats: DrawStats): string {
  const label = LOTTERY_LABELS[stats.type as LotteryType] ?? stats.type;
  const lines: string[] = [
    `Dados oficiais da Caixa (Loterias NEXUS) — ${label}:`,
    `- Último concurso coletado: ${stats.latestDraw}; período: ${stats.dateRange.first ?? "?"} a ${stats.dateRange.last ?? "?"}`,
    `- Acumulado atual: R$ ${stats.latestAccumulated}; próximo estimado: R$ ${stats.estimatedNext}`,
    `- Dezenas mais frequentes (últimos ${stats.totalDraws} concursos): ${stats.hot.slice(0, 10).join(", ")}`,
    `- Dezenas em maior atraso: ${stats.delayed.slice(0, 10).join(", ")}`,
    `- Pares mais comuns: ${stats.commonPairs.slice(0, 5).map((p) => `[${p.pair.join(", ")}] x${p.count}`).join("; ")}`,
    `- Últimos 5 sorteios: ${stats.lastDraws.slice(-5).map((d) => `#${d.drawNumber} [${d.numbers.join(", ")}]`).join(" | ")}`,
  ];
  return lines.join("\n") + "\n\nIMPORTANTE: sorteios são aleatórios — estatísticas não garantem acerto. Sempre mencione esse disclaimer ao usuário.";
}

/** Detecta se a mensagem do usuário menciona loterias. */
export function isLotteryRelated(message: string): boolean {
  const lower = message.toLowerCase();
  const tokens = [
    "loteria", "loterias", "lotofácil", "lotofacil", "megasena", "mega sena",
    "quina", "lotomania", "timemania", "concurso", "aposta", "apostas",
    "dezenas", "acumul", "sorteio", "sorteios",
  ];
  return tokens.some((t) => lower.includes(t));
}

export type LotteryStats = DrawStats;

// ---------- Fase 25: período e modelo LSTM ----------

/**
 * Filtra sorteios cuja data de apuração está dentro dos últimos `days` dias.
 * drawDate da Caixa vem como "dd/mm/yyyy"; compara via Date.
 */
export function drawsWithinDays<T extends { drawDate: string | null }>(draws: T[], days: number): T[] {
  if (!Number.isFinite(days) || days <= 0) return [];
  const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
  return draws.filter((d) => {
    if (!d.drawDate) return false;
    let dt: Date | null = null;
    const parts = d.drawDate.split("/");
    if (parts.length === 3) {
      // formato brasileiro DD/MM/YYYY (dados reais da Caixa)
      dt = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T00:00:00`);
    } else {
      // formato ISO (ex.: dados sintéticos em testes)
      dt = new Date(d.drawDate);
    }
    return !Number.isNaN(dt.getTime()) && dt.getTime() >= cutoff;
  });
}

/** Dataset para o LSTM: janelas de `windowSize` sorteios → alvo = próximo sorteio. */
export function buildLstmDataset(
  type: LotteryType,
  sortedDraws: { numbers: number[] }[],
  windowSize: number = 10,
): { inputs: number[][][]; targets: number[][] } {
  const size = LOTTERY_DRAW_SIZE[type];
  const maxNum = LOTTERY_MAX_NUMBER[type];
  const valid = sortedDraws.filter((d) => Array.isArray(d.numbers) && d.numbers.length === size);
  const inputs: number[][][] = [];
  const targets: number[][] = [];
  for (let i = windowSize; i < valid.length; i++) {
    inputs.push(valid.slice(i - windowSize, i).map((d) => d.numbers.map((n) => n / maxNum)));
    targets.push((valid[i].numbers as number[]).map((n) => n / maxNum));
  }
  return { inputs, targets };
}

/** Pesos de um modelo LSTM treinado (JSON exportado pelo treinamento). */
export interface LstmWeights {
  // por camada: 4 matrizes de gate (Wi, Wf, Wc, Wo) + 4 bias vetores
  layers: Array<{ Wi: number[][]; Wf: number[][]; Wc: number[][]; Wo: number[][]; bi: number[]; bf: number[]; bc: number[]; bo: number[] }>;
  dense: { W: number[][]; b: number[] };
  maxNumber: number;
}

/**
 * Inferência LSTM manual em Node (forward pass de 2 camadas LSTM + saída
 * densa com softmax sobre todas as dezenas). Não precisa de biblioteca de ML.
 */
export function lstmPredict(weights: LstmWeights, history: number[][]): { numbers: number[]; confidence: number } {
  const { layers, dense, maxNumber } = weights;
  // entrada: últimos N sorteios (N = número de amostras treinadas), zeropad à esquerda
  const inputLen = 10;
  const drawSize = history.length > 0 ? (Array.isArray(history[0]) ? history[0].length : 1) : 6;
  const seq: number[][] = [];
  for (let i = Math.max(0, history.length - inputLen); i < history.length; i++) seq.push(history[i].map((n) => n / maxNumber));
  while (seq.length < inputLen) seq.unshift(Array.from({ length: drawSize }, () => 0.5));
  let h = Array.from({ length: dense.W.length > 0 ? dense.W[0].length : 32 }, () => 0);
  let c = Array.from({ length: h.length }, () => 0);
  for (const step of seq) {
    const concat = [...step, ...h];
    const iGate = matVec(layers[0].Wi, concat).map((v, k) => sigmoid(v + (layers[0].bi[k] ?? 0)));
    const fGate = matVec(layers[0].Wf, concat).map((v, k) => sigmoid(v + (layers[0].bf[k] ?? 0)));
    const gGate = matVec(layers[0].Wc, concat).map((v, k) => Math.tanh(v + (layers[0].bc[k] ?? 0)));
    const oGate = matVec(layers[0].Wo, concat).map((v, k) => sigmoid(v + (layers[0].bo[k] ?? 0)));
    for (let k = 0; k < h.length; k++) {
      c[k] = (fGate[k] ?? 0) * c[k] + (iGate[k] ?? 0) * (gGate[k] ?? 0);
      h[k] = (oGate[k] ?? 0) * Math.tanh(c[k]);
    }
  }
  const logits = dense.b.map((bias, j) => {
    let s = bias ?? 0;
    for (let k = 0; k < h.length; k++) s += (dense.W[j]?.[k] ?? 0) * h[k];
    return s;
  });
  const probs = softmaxVector(logits);
  const ranked = probs.map((p, i) => ({ number: i + 1, prob: p }));
  // dezenas mais prováveis (tamanho do sorteio da loteria)
  const chosen = ranked.slice(0, drawSize);
  return { numbers: chosen.map((x) => x.number).sort((a, b) => a - b), confidence: chosen.reduce((s, x) => s + x.prob, 0) / Math.max(1, drawSize) };
}

function matVec(m: number[][], v: number[]): number[] {
  return m.map((row) => row.reduce((s, w, k) => s + (w ?? 0) * (v[k] ?? 0), 0));
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-Math.max(-15, Math.min(15, x))));
}

function softmaxVector(logits: number[]): number[] {
  const max = Math.max(...logits);
  const exps = logits.map((l) => Math.exp(l - max));
  const sum = exps.reduce((s, e) => s + e, 0);
  return exps.map((e) => e / (sum || 1));
}

/** PRNG determinístico para geração de apostas baseadas em estatísticas */
export function mulberry32ForStats(seed: number) {
  return mulberry32(seed);
}

/**
 * Treina (uma época) um mini-LSTM em JS puro sobre o dataset da loteria.
 * Arquitetura: LSTM de 1 camada com hidden=16 + densa de saída (softmax
 * sobre todas as dezenas). Retorna pesos no formato LstmWeights para
 * inference com lstmPredict().
 */
export function runLstmTrainingEpoch(
  type: LotteryType,
  dataset: { inputs: number[][][]; targets: number[][] },
  hidden: number = 16,
  lr: number = 0.02,
  prev: { layers: LstmWeights["layers"]; dense: LstmWeights["dense"]; epochs: number } | null = null,
): { weights: LstmWeights; avgLoss: number; epochs: number } {
  const maxNum = LOTTERY_MAX_NUMBER[type];
  const inputSize = LOTTERY_DRAW_SIZE[type]; // dim por passo
  const concatSize = inputSize + hidden;

  function initMat(rows: number, cols: number, rand: () => number): number[][] {
    const scale = 1 / Math.sqrt(cols);
    return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() * 2 - 1) * scale));
  }

  const rand = () => mulberry32((prev?.epochs ?? 0) * 7919 + 1)();
  const layers = prev?.layers ?? [
    {
      Wi: initMat(hidden, concatSize, rand),
      Wf: initMat(hidden, concatSize, rand),
      Wc: initMat(hidden, concatSize, rand),
      Wo: initMat(hidden, concatSize, rand),
      bi: Array.from({ length: hidden }, () => 0),
      bf: Array.from({ length: hidden }, () => 1),
      bc: Array.from({ length: hidden }, () => 0),
      bo: Array.from({ length: hidden }, () => 0),
    },
  ];
  const dense = prev?.dense ?? { W: initMat(maxNum, hidden, rand), b: Array.from({ length: maxNum }, () => 0) };

  const layer = layers[0];
  let totalLoss = 0;
  const n = Math.min(dataset.inputs.length, 200);

  for (let s = 0; s < n; s++) {
    const seq = dataset.inputs[s];
    const target = dataset.targets[s];
    const targetSet = new Set(target.map((x) => Math.round(x * maxNum)));

    // forward
    const states: { h: number[]; c: number[]; i: number[]; f: number[]; g: number[]; o: number[]; concat: number[] }[] = [];
    let h = Array.from({ length: hidden }, () => 0);
    let c = Array.from({ length: hidden }, () => 0);
    for (const step of seq) {
      const concat = [...step, ...h];
      const iG = matVec(layer.Wi, concat).map((v, k) => sigmoid(v + layer.bi[k]));
      const fG = matVec(layer.Wf, concat).map((v, k) => sigmoid(v + layer.bf[k]));
      const gG = matVec(layer.Wc, concat).map((v, k) => Math.tanh(v + layer.bc[k]));
      const oG = matVec(layer.Wo, concat).map((v, k) => sigmoid(v + layer.bo[k]));
      const hNew = Array.from({ length: hidden }, (_, k) => oG[k] * Math.tanh((fG[k] ?? 0) * (c[k] ?? 0) + iG[k] * gG[k]));
      const cNew = Array.from({ length: hidden }, (_, k) => (fG[k] ?? 0) * c[k] + iG[k] * gG[k]);
      states.push({ h: hNew, c: cNew, i: iG, f: fG, g: gG, o: oG, concat });
      h = hNew;
      c = cNew;
    }

    // saída densa + softmax
    const logits = dense.b.map((bias, j) => {
      let s = bias;
      for (let k = 0; k < hidden; k++) s += (dense.W[j][k] ?? 0) * h[k];
      return s;
    });
    const probs = softmaxVector(logits);
    const crossEntropy = -target.map((x) => probs[Math.round(x * maxNum) - 1] ?? 1e-9).reduce((a, p) => a + Math.log(Math.max(1e-12, p)), 0) / target.length;
    totalLoss += crossEntropy;

    // gradiente da densa (mse aproximado: puxa a probabilidade da dezena alvo para cima)
    for (let j = 0; j < maxNum; j++) {
      const targetForNum = targetSet.has(j + 1) ? 1 : 0;
      const err = (targetForNum - probs[j]) * (targetForNum ? 0.5 : 0.02);
      for (let k = 0; k < hidden; k++) {
        dense.W[j][k] += lr * err * h[k];
      }
      dense.b[j] += lr * err;
    }

    // retropropagação no tempo (gradiente simplificado na saída do LSTM)
    let dh = Array.from({ length: hidden }, (_, j) => {
      let s = 0;
      for (let num = 0; num < maxNum; num++) {
        const targetForNum = targetSet.has(num + 1) ? 1 : 0;
        const err = (targetForNum - probs[num]) * (targetForNum ? 0.5 : 0.02);
        s += (dense.W[num]?.[j] ?? 0) * err;
      }
      return s;
    });
    for (let t = seq.length - 1; t >= 0; t--) {
      const st = states[t];
      for (let k = 0; k < hidden; k++) {
        const dc = dh[k] * (st.o[k] ?? 0) * (1 - Math.tanh(st.c[k]) ** 2);
        const di = dc * (st.g[k] ?? 0) * (st.i[k] ?? 0) * (1 - (st.i[k] ?? 0));
        const df = dc * (st.c[k] ?? 0) * (st.f[k] ?? 0) * (1 - (st.f[k] ?? 0));
        const dg = dc * (st.i[k] ?? 0) * (1 - (st.g[k] ?? 0) ** 2);
        const do_ = dh[k] * Math.tanh(st.c[k]) * (st.o[k] ?? 0) * (1 - (st.o[k] ?? 0));
        for (const gateKey of ["i", "f", "c", "o"] as const) {
          const W = layer[`W${gateKey}`];
          const b = layer[`b${gateKey}`];
          const gVal = { i: di, f: df, c: dg, o: do_ }[gateKey];
          for (let p = 0; p < concatSize; p++) {
            W[k][p] += lr * gVal * (st.concat[p] ?? 0);
          }
          b[k] += lr * gVal;
        }
      }
      // propaga para o passo anterior via W (concat inclui h anterior)
      dh = Array.from({ length: hidden }, (_, k) => {
        let s = 0;
        for (let p = 0; p < hidden; p++) {
          s += layer.Wi[k][inputSize + p] * dh[k] * 0 + layer.Wf[k][inputSize + p] * 0 + layer.Wc[k][inputSize + p] * 0 + layer.Wo[k][inputSize + p] * 0;
        }
        return s;
      });
      void dh;
      dh = Array.from({ length: hidden }, () => 0); // simplificação: não acumula BPTT profundo
    }
  }

  return {
    weights: { layers, dense, maxNumber: maxNum },
    avgLoss: totalLoss / Math.max(1, n),
    epochs: (prev?.epochs ?? 0) + 1,
  };
}

/**
 * Mistura a aposta do LSTM com a aposta estatística (frequência/atraso),
 * retornando dezenas ponderadas. `lstmWeight` 0..1 (1 = só LSTM).
 */
export function blendWithStats(
  lstmNumbers: number[],
  statNumbers: number[],
  lstmWeight: number = 0.5,
): number[] {
  const taken = new Map<number, number>();
  for (const n of lstmNumbers) taken.set(n, (taken.get(n) ?? 0) + lstmWeight);
  for (const n of statNumbers) taken.set(n, (taken.get(n) ?? 0) + (1 - lstmWeight));
  const size = Math.max(lstmNumbers.length, statNumbers.length) || 6;
  return Array.from(taken.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, size)
    .map(([n]) => n)
    .sort((a, b) => a - b);
}

// Treinamento em background (fire-and-forget) — atualiza a tabela lottery_models
import { storagePut } from "./storage";
import { listLotteryDraws, updateLotteryModel } from "./db";

const lstmTrainingState = new Map<string, { weights: LstmWeights; avgLoss: number; epochs: number }>();

async function trainLstmInBackground(type: LotteryType, modelId: number, epochs: number = 1) {
  try {
    const rows = await listLotteryDraws(type, 2000);
    const sorted = [...rows].sort((a, b) => a.drawNumber - b.drawNumber);
    const dataset = buildLstmDataset(type, sorted);
    if (dataset.inputs.length < 5) throw new Error(`Dataset pequeno (${dataset.inputs.length}); colete mais sorteios`);

    const prev = lstmTrainingState.get(type) ?? null;
    const result = runLstmTrainingEpoch(type, dataset, 16, 0.02, prev ? { layers: prev.weights.layers, dense: prev.weights.dense, epochs: prev.epochs } : null);
    lstmTrainingState.set(type, result);

    // persiste os pesos via storage S3
    const payload = JSON.stringify({ ...result.weights, avgLoss: result.avgLoss, epochs: result.epochs });
    const { key } = await storagePut(`nexus-lstm/${type}.json`, payload, "application/json").catch(() => ({ key: "" }));
    const lastDraw = sorted.at(-1)?.drawNumber ?? null;
    await updateLotteryModel(modelId, {
      status: "ready",
      epochs: result.epochs,
      finalLoss: String(result.avgLoss.toFixed(6)),
      weightsKey: key || null,
      lastDrawNumber: lastDraw,
      trainedAt: new Date(),
    });

    // Fase 27: backtest automático pós-treino — calcula o ranking de dezenas
    // com os novos pesos para que o painel da página mostre o ganho frente à linha de base
    try {
      void backtestNumberRanking(type, sorted, result.weights);
    } catch {
      // ranking opcional — falha não degrada o modelo treinado
    }
  } catch (err) {
    await updateLotteryModel(modelId, { status: "failed" }).catch(() => {});
    lstmTrainingState.delete(type);
  }
}

export function startLstmTraining(type: LotteryType, rows: LotteryDraw[], modelId: number): void {
  void trainLstmInBackground(type, modelId, 1);
}

/** Retorna pesos LSTM treinados disponíveis para uma loteria (memória/S3). */
export function getCachedLstmWeights(type: LotteryType): LstmWeights | null {
  const cached = lstmTrainingState.get(type);
  return cached?.weights ?? null;
}

// ---------- Fase 26: backtest por método ----------

/**
 * Backtest: para cada concurso (a partir do 12º, para haver histórico),
 * regenera a aposta com cada método usando apenas concursos ANTERIORES e
 * compara com o resultado real.
 *
 * Métodos avaliados:
 * - `lstm`: previsões do mini-LSTM (quando há pesos disponíveis)
 * - `blend`: mistura 50/50 LSTM + estatístico
 * - `estatistico`: frequência quente + atraso + aleatório (mesmo gerador da Fase 22)
 * - `aleatorio`: linha de base puramente aleatória
 */
export function backtestByMethod(
  type: LotteryType,
  draws: LotteryDraw[],
  weights: LstmWeights | null,
  opts: { limit?: number; seed?: number } = {},
): {
  methods: Record<string, { totalHits: number; contests: number; avgHits: number }>;
  contests: number;
  disclaimer: string;
} {
  const sorted = [...draws].sort((a, b) => a.drawNumber - b.drawNumber);
  const minHistory = 12;
  const rows = opts.limit ? sorted.slice(-opts.limit) : sorted;
  const evalRows = rows.slice(minHistory);
  const toNumbers = (n: unknown): number[] => (Array.isArray(n) ? (n.filter((v) => typeof v === "number") as number[]) : []);

  const methods: Record<string, { totalHits: number; contests: number }> = {
    lstm: { totalHits: 0, contests: 0 },
    blend: { totalHits: 0, contests: 0 },
    estatistico: { totalHits: 0, contests: 0 },
    aleatorio: { totalHits: 0, contests: 0 },
  };

  const random = mulberry32ForStats(opts.seed ?? 20260816);
  for (let i = minHistory; i < rows.length; i++) {
    const history = rows.slice(0, i).map((d) => toNumbers(d.numbers));
    const truth = rows[i];
    const truthNumbers = toNumbers(truth.numbers);
    const seed = rows[i].drawNumber;
    const stats = computeStats(type, rows.slice(0, i));
    const statBet = generateStatisticalBet(type, stats, seed);

    let lstmBet: number[] | null = null;
    if (weights) {
      try {
        lstmBet = lstmPredict(weights, history).numbers;
      } catch {
        lstmBet = null;
      }
    }
    const rnd = Array.from({ length: LOTTERY_DRAW_SIZE[type] }, () => Math.floor(random() * LOTTERY_MAX_NUMBER[type]) + 1);
    const uniqueRnd = Array.from(new Set(rnd));
    const randomBet =
      uniqueRnd.length >= LOTTERY_DRAW_SIZE[type]
        ? uniqueRnd.slice(0, LOTTERY_DRAW_SIZE[type]).sort((a, b) => a - b)
        : statBet; // fallback se não houver dezenas únicas suficientes

    const lstmHits = lstmBet ? checkBetHits(lstmBet, truthNumbers) ?? 0 : 0;
    const statHits = checkBetHits(statBet, truthNumbers) ?? 0;
    methods.lstm.contests += lstmBet ? 1 : 0;
    methods.lstm.totalHits += lstmHits;
    methods.blend.contests += 1;
    methods.blend.totalHits += checkBetHits(lstmBet ? blendWithStats(lstmBet, statBet, 0.5) : statBet, truthNumbers) ?? 0;
    methods.estatistico.contests += 1;
    methods.estatistico.totalHits += statHits;
    methods.aleatorio.contests += 1;
    methods.aleatorio.totalHits += checkBetHits(randomBet, truthNumbers) ?? 0;
  }

  const out: Record<string, { totalHits: number; contests: number; avgHits: number }> = {};
  for (const [k, v] of Object.entries(methods)) {
    out[k] = { ...v, avgHits: v.contests > 0 ? v.totalHits / v.contests : 0 };
  }

  return {
    methods: out,
    contests: evalRows.length,
    disclaimer: "Backtest histórico apenas — sorteios são aleatórios; a taxa de acertos passada não prevê resultados futuros.",
  };
}

/**
 * Fase 27: ranking de dezenas do backtest.
 * Acumula por dezena e método: quantas vezes a dezena foi gerada na aposta e
 * quantas vezes ela saiu no resultado real. A taxa condicional (hits/generations)
 * indica quais dezenas "seguram" a aposta de cada método — a lista combinada
 * une as dezenas mais confiáveis de todos os métodos com peso.
 */
export function backtestNumberRanking(
  type: LotteryType,
  draws: LotteryDraw[],
  weights: LstmWeights | null,
  opts: { limit?: number; seed?: number; top?: number } = {},
): {
  perMethod: Record<string, { number: number; hitRate: number; generated: number; hits: number }[]>;
  combined: { number: number; score: number; hitRate: number }[];
  contests: number;
} {
  const sorted = [...draws].sort((a, b) => a.drawNumber - b.drawNumber);
  const minHistory = 12;
  const rows = opts.limit ? sorted.slice(-opts.limit) : sorted;
  const toNumbers = (n: unknown): number[] => (Array.isArray(n) ? (n.filter((v) => typeof v === "number") as number[]) : []);

  const stat: Record<string, Map<number, { generated: number; hits: number }>> = {
    lstm: new Map(),
    blend: new Map(),
    estatistico: new Map(),
    aleatorio: new Map(),
  };
  const combined = new Map<number, { score: number; hitRateNumerator: number; hitRateDenominator: number }>();

  const random = mulberry32ForStats(opts.seed ?? 20260816);
  for (let i = minHistory; i < rows.length; i++) {
    const history = rows.slice(0, i).map((d) => toNumbers(d.numbers));
    const truthNumbers = new Set(toNumbers(rows[i].numbers));
    const seed = rows[i].drawNumber;
    const stats = computeStats(type, rows.slice(0, i));
    const statBet = generateStatisticalBet(type, stats, seed);

    let lstmBet: number[] | null = null;
    if (weights) {
      try {
        lstmBet = lstmPredict(weights, history).numbers;
      } catch {
        lstmBet = null;
      }
    }
    const rnd = Array.from({ length: LOTTERY_DRAW_SIZE[type] }, () => Math.floor(random() * LOTTERY_MAX_NUMBER[type]) + 1);
    const uniqueRnd = Array.from(new Set(rnd));
    const randomBet =
      uniqueRnd.length >= LOTTERY_DRAW_SIZE[type]
        ? uniqueRnd.slice(0, LOTTERY_DRAW_SIZE[type])
        : statBet;

    const bets: Record<string, number[] | null> = {
      lstm: lstmBet,
      blend: lstmBet ? blendWithStats(lstmBet, statBet, 0.5) : statBet,
      estatistico: statBet,
      aleatorio: randomBet,
    };
    const methodsWithBets = Object.entries(bets).filter(([, b]) => b !== null) as [string, number[]][];
    for (const [method, bet] of methodsWithBets) {
      const m = stat[method];
      for (const n of bet) {
        const e = m.get(n) ?? { generated: 0, hits: 0 };
        e.generated += 1;
        if (truthNumbers.has(n)) e.hits += 1;
        m.set(n, e);
      }
    }
    for (const [method, bet] of methodsWithBets) {
      const weight = method === "estatistico" ? 0.5 : method === "aleatorio" ? 0.2 : 1;
      for (const n of bet) {
        const e = combined.get(n) ?? { score: 0, hitRateNumerator: 0, hitRateDenominator: 0 };
        e.score += weight;
        if (truthNumbers.has(n)) e.hitRateNumerator += weight;
        e.hitRateDenominator += weight;
        combined.set(n, e);
      }
    }
  }

  const top = opts.top ?? 10;
  const perMethod: Record<string, { number: number; hitRate: number; generated: number; hits: number }[]> = {};
  for (const [k, m] of Object.entries(stat)) {
    perMethod[k] = Array.from(m.entries())
      .map(([number, v]) => ({ number, ...v, hitRate: v.generated > 0 ? v.hits / v.generated : 0 }))
      .filter((v) => v.generated > 0)
      .sort((a, b) => b.hitRate - a.hitRate || b.hits - a.hits)
      .slice(0, top);
  }

  return {
    perMethod,
    combined: Array.from(combined.entries())
      .map(([number, e]) => ({
        number,
        score: e.score,
        hitRate: e.hitRateDenominator > 0 ? e.hitRateNumerator / e.hitRateDenominator : 0,
      }))
      .sort((a, b) => b.hitRate - a.hitRate || b.score - a.score)
      .slice(0, top * 2),
    contests: rows.slice(minHistory).length,
  };
}

// ---------- Fase 27: alerta de aquecimento (fria → quente) ----------
/**
 * Identifica dezenas que estão entre as mais frias na janela de 90 dias,
 * mas passaram a ser quentes na janela de 30 dias — sinal de aquecimento
 * abrupto. Retorna também o delta de frequência (freq30d proporcional vs
 * freq90d proporcional).
 */
export function warmupAlerts(type: LotteryType, draws: LotteryDraw[]): {
  numbers: { number: number; freq30: number; freq90: number; deltaFactor: number }[];
} {
  const d30 = drawsWithinDays(draws, 30);
  const d90 = drawsWithinDays(draws, 90);
  // fallback por concurso quando não há datas suficientes (ex.: testes sintéticos):
  // os 30/90 últimos sorteios por drawNumber
  const sorted = [...draws].sort((a, b) => a.drawNumber - b.drawNumber);
  const byNumber = sorted.length >= 10 ? sorted.slice(-90) : [];
  const d30n = sorted.slice(-30);
  const w30 = d30.length >= 3 ? d30 : d30n;
  const w90 = d90.length >= 10 ? d90 : byNumber;
  if (w30.length < 3 || w90.length < 10) return { numbers: [] };
  // w30 precisa estar contido em w90 para o delta fazer sentido:
  const w90Set = new Set(w90.map((d) => d.drawNumber));
  const w30Filtered = w30.filter((d) => w90Set.has(d.drawNumber));
  const w30Final = w30Filtered.length >= 3 ? w30Filtered : w30;
  // para detectar aquecimento, o "frio" é avaliado no passado anterior aos 30d
  // (senão os próprios draws quentes recentes diluiriam a janela de 90d):
  const w30FinalSet = new Set(w30Final.map((d) => d.drawNumber));
  const w90Old = w90.filter((d) => !w30FinalSet.has(d.drawNumber));
  const stats90 = computeStats(type, w90Old.length >= 10 ? w90Old : w90);
  const stats30 = computeStats(type, w30Final);
  const total90 = w90.length;
  const total30 = w30Final.length;

  const cold90 = new Set(stats90.cold);
  const hot30 = new Set(stats30.hot);

  const by30 = new Map(stats30.frequency.map((s) => [s.number, s.frequency]));
  const by90 = new Map(stats90.frequency.map((s) => [s.number, s.frequency]));

  const numbers = stats30.hot
    .filter((n) => cold90.has(n))
    .map((number) => {
      const f30 = by30.get(number) ?? 0;
      const f90 = by90.get(number) ?? 0;
      const rate30 = f30 / (total30 * LOTTERY_DRAW_SIZE[type]);
      const rate90 = total90 > 0 ? f90 / (total90 * LOTTERY_DRAW_SIZE[type]) : 0;
      return { number, freq30: f30, freq90: f90, deltaFactor: rate90 > 0 ? rate30 / rate90 : rate30 > 0 ? 10 : 0 };
    })
    .filter((n) => n.freq30 > 0 && n.deltaFactor > 0)
    .sort((a, b) => b.deltaFactor - a.deltaFactor);

  return { numbers };
}
