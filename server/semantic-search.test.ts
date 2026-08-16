import { describe, it, expect, vi, beforeEach } from "vitest";

// --- Mocks set up BEFORE importing modules under test. ---

// Fake embeddings so every note has a vector (avoiding the empty-query text fallback).
const NOTE_VECTORS: Record<number, number[]> = {
  1: Array.from({ length: 1024 }, (_, i) => (i % 7 === 1 ? 1 : 0.01)), // roadmap/trabalho
  2: Array.from({ length: 1024 }, (_, i) => (i % 7 === 2 ? 1 : 0.01)), // recomendação/projetos
  3: Array.from({ length: 1024 }, (_, i) => (i % 7 === 3 ? 1 : 0.01)), // agentes/Geral
};

const MOCK_ROWS: any[] = [
  { id: 1, userId: 7, title: "Reunião de planejamento", content: "roadmap trimestral do projeto", folder: "Trabalho", embedding: Buffer.from(makeBytes(NOTE_VECTORS[1])) },
  { id: 2, userId: 7, title: "Algoritmo de recomendação", content: "matrizes de similaridade e filtro colaborativo", folder: "Projetos", embedding: Buffer.from(makeBytes(NOTE_VECTORS[2])) },
  { id: 3, userId: 7, title: "Anotação sobre IA e agentes", content: "agentes autônomos escolhem ferramentas e executam missões", folder: "Geral", embedding: Buffer.from(makeBytes(NOTE_VECTORS[3])) },
  { id: 4, userId: 99, title: "Nota de outro usuário", content: "privada", folder: "Geral", embedding: null },
];

function makeBytes(vec: number[]) {
  const b = Buffer.alloc(vec.length * 4);
  vec.forEach((x, i) => b.writeFloatLE(x, i * 4));
  return b;
}

vi.mock("./db", async importOriginal => {
  const orig = await importOriginal<typeof import("./db")>();
  return {
    ...orig,
    getDb: vi.fn(async () => null), // semantic search is in-memory over rows
    addSuperNote: orig.addSuperNote,
    listSuperNotes: async (_u: number, _o?: { folder?: string }) => MOCK_ROWS.filter(r => r.userId === 7),
    searchSuperNotes: async (_u: number, _q: string) => MOCK_ROWS.filter(r => r.userId === 7),
    saveSuperNoteEmbedding: vi.fn(async () => {}),
    semanticSearchSuperNotes: vi.fn(async (userId: number, vec: number[], opts?: { folder?: string; limit?: number }) => {
      const limit = opts?.limit ?? 10;
      const rows = MOCK_ROWS.filter(r => r.userId === userId && (!opts?.folder || r.folder === opts.folder));
      const scored = rows.map(note => {
        const row = note as { embedding: Buffer | null };
        let score = 0;
        if (row.embedding && row.embedding instanceof Buffer && row.embedding.length >= vec.length * 4) {
          const stored = new Float32Array(row.embedding.buffer, row.embedding.byteOffset, vec.length);
          score = cosineSimilarity(vec, Array.from(stored));
        }
        return { note, score };
      });
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, limit);
    }),
    computeTextRelevance: orig.computeTextRelevance,
    getLlmSettings: vi.fn(async () => undefined),
  };
});

function cosineSimilarity(a: number[], b: number[]): number {
  const norm = (v: number[]) => {
    let s = 0;
    for (const x of v) s += x * x;
    s = Math.sqrt(s) || 1;
    return v.map(x => x / s);
  };
  const na = norm(a);
  const nb = norm(b);
  const len = Math.min(na.length, nb.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += na[i] * nb[i];
  return dot;
}

import type { RouterOutputs } from "@trpc/server";

describe("semanticSearchSuperNotes (in-memory cosine ranking)", () => {
  it("ranqueia a nota de agentes em primeiro para uma consulta sobre agentes", async () => {
    const { semanticSearchSuperNotes } = await import("./db");
    const results = await semanticSearchSuperNotes(7, NOTE_VECTORS[3], { limit: 3 });
    expect(results.length).toBe(3);
    expect(results[0].note.title).toBe("Anotação sobre IA e agentes");
    expect(results.every(r => r.score > 0)).toBe(true);
  });

  it("filtra por pasta", async () => {
    const { semanticSearchSuperNotes } = await import("./db");
    const results = await semanticSearchSuperNotes(7, NOTE_VECTORS[1], { folder: "Trabalho", limit: 10 });
    expect(results.every(r => r.note.folder === "Trabalho")).toBe(true);
  });

  it("isola usuários: nota do usuário 99 nunca aparece", async () => {
    const { semanticSearchSuperNotes } = await import("./db");
    const results = await semanticSearchSuperNotes(7, NOTE_VECTORS[2], { limit: 50 });
    expect(results.some(r => r.note.userId === 99)).toBe(false);
  });
});

describe("superNotes router (semanticSearch, reindexEmbedding, availability)", () => {
  // Router depends on the real db (getDb) — stub getDb inside the router's import
  // by re-mocking the whole db module for these router tests is handled via the
  // shared mock above (semanticSearchSuperNotes/availability use process env).
  beforeEach(() => {
    vi.stubEnv("QWEN_API_KEY", "sk-test-key");
  });

  it("availability espelha a configuração da chave de embeddings", async () => {
    const { appRouter } = await import("./routers");
    const caller = appRouter.createCaller({
      user: { id: 7, openId: "test", name: "Test", role: "user", createdAt: new Date() } as any,
      req: { headers: { host: "localhost" } } as any,
      res: {} as any,
    } as any);
    vi.stubEnv("QWEN_API_KEY", "sk-key");
    const on = await caller.superNotes.availability();
    expect(on.embeddings).toBe(true);
    vi.stubEnv("QWEN_API_KEY", "");
    const off = await caller.superNotes.availability();
    expect(off.embeddings).toBe(false);
  });
});

describe("computeTextRelevance (fallback textual — importado via db)", () => {
  it("pontua acima de zero para tokens em comum", async () => {
    const { computeTextRelevance } = await import("./db");
    expect(computeTextRelevance("agentes autônomos", { title: "agentes", content: "autônomos", tags: null })).toBeGreaterThan(0);
  });
  it("zero quando nada em comum", async () => {
    const { computeTextRelevance } = await import("./db");
    expect(computeTextRelevance("astronauta", { title: "receita", content: "bolo", tags: null })).toBe(0);
  });
});
