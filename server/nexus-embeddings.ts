/**
 * Phase 15 — Semantic embeddings for the Super Memória vault.
 *
 * Provider: QwenCloud `text-embedding-v3` (multilingual, cheap, 1024 dims).
 * Fallback chain: QWEN_API_KEY (user-provided) → no embedding generation;
 * text search is used instead. Users running locally configure their own
 * key in .env (see docs/ENV-TEMPLATE.md) — any OpenAI-compatible endpoint
 * with a `text-embedding-v3`-style model works via QWEN_EMBEDDING_BASE_URL.
 */

const DEFAULT_EMBEDDING_BASE_URL = "https://dashscope-intl.aliyuncs.com/compatible-mode/v1";
export const EMBEDDING_MODEL = "text-embedding-v3";
export const EMBEDDING_DIMS = 1024;

// Simple in-memory LRU cache keyed by normalized text → vector
const cache = new Map<string, number[]>();
const CACHE_MAX = 2000;

function cacheKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim();
}

export interface EmbeddingResult {
  vector: number[];
  model: string;
  cached: boolean;
}

export interface EmbeddingError {
  ok: false;
  reason: string;
}

export function isEmbeddingAvailable(): boolean {
  return Boolean(process.env.QWEN_API_KEY);
}

/** Generate an embedding for an arbitrary text. Never throws — returns result or error. */
export async function generateEmbedding(text: string): Promise<EmbeddingResult | EmbeddingError> {
  const key = process.env.QWEN_API_KEY ?? "";
  if (!key) return { ok: false, reason: "QWEN_API_KEY não configurada — usando busca textual" } as EmbeddingError;

  const ck = cacheKey(text);
  const cached = cache.get(ck);
  if (cached) return { vector: cached, model: EMBEDDING_MODEL, cached: true };

  const base = process.env.QWEN_EMBEDDING_BASE_URL ?? DEFAULT_EMBEDDING_BASE_URL;
  try {
    const res = await fetch(`${base}/embeddings`, {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBEDDING_MODEL, input: text.slice(0, 4000), dimensions: EMBEDDING_DIMS }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return { ok: false, reason: `Embedding falhou (${res.status}): ${body.slice(0, 200)}` } as EmbeddingError;
    }
    const json = (await res.json()) as { data?: { embedding: number[] }[] };
    const vector = json.data?.[0]?.embedding;
    if (!vector || vector.length === 0) {
      return { ok: false, reason: "Embedding retornou vetor vazio" } as EmbeddingError;
    }
    // normalize + store
    const norm = normalize(vector);
    cache.set(ck, norm);
    if (cache.size > CACHE_MAX) {
      const firstKey = cache.keys().next().value;
      if (firstKey !== undefined) cache.delete(firstKey);
    }
    return { vector: norm, model: EMBEDDING_MODEL, cached: false };
  } catch (err) {
    return { ok: false, reason: `Embedding indisponível: ${(err as Error).message}` } as EmbeddingError;
  }
}

export function normalize(v: number[]): number[] {
  let s = 0;
  for (const x of v) s += x * x;
  s = Math.sqrt(s) || 1;
  return v.map(x => x / s);
}

/** Cosine similarity between two normalized vectors (dot product). */
export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

/** Text fallback (BM25-lite) when embeddings are unavailable. */
export function textRelevance(query: string, note: { title?: string; content?: string; tags?: string | null }): number {
  const tokens = query
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^a-z0-9áéíóúâêôãõçü ]/g, " ")
    .split(/\s+/)
    .filter(t => t.length > 1);
  if (tokens.length === 0) return 0;
  const haystack = `${note.title ?? ""} ${note.content ?? ""} ${note.tags ?? ""}`.toLowerCase();
  const words = new Set(haystack.split(/\s+/));
  let score = 0;
  for (const t of tokens) if (words.has(t)) score += 1 / tokens.length;
  return score;
}
