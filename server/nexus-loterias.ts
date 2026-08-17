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
