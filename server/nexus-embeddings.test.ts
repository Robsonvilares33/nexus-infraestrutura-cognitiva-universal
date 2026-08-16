import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  normalize,
  cosineSimilarity,
  generateEmbedding,
  isEmbeddingAvailable,
  textRelevance,
} from "./nexus-embeddings";

describe("nexus-embeddings (unidade)", () => {
  describe("normalize", () => {
    it("produz vetor unitário", () => {
      const v = normalize([3, 4]);
      expect(Math.hypot(v[0], v[1])).toBeCloseTo(1);
    });
    it("não quebra com vetor nulo", () => {
      const v = normalize([0, 0, 0]);
      expect(v.every(n => Number.isFinite(n))).toBe(true);
    });
  });

  describe("cosineSimilarity", () => {
    it("vetores idênticos = 1", () => {
      const a = normalize([1, 2, 3]);
      expect(cosineSimilarity(a, a)).toBeCloseTo(1);
    });
    it("vetores opostos = -1", () => {
      const a = normalize([1, 2, 3]);
      const b = normalize([-1, -2, -3]);
      expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
    });
    it("vetores ortogonais = 0", () => {
      expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
    });
    it("similaridade parcial entre 0 e 1", () => {
      const a = normalize([10, 1, 1]);
      const b = normalize([9, 2, 1]);
      const s = cosineSimilarity(a, b);
      expect(s).toBeGreaterThan(0.9);
    });
  });

  describe("textRelevance (fallback textual)", () => {
    it("nota com tokens da consulta pontua", () => {
      const score = textRelevance("inteligência artificial", { title: "IA na educação", content: "artigos sobre inteligência artificial", tags: null });
      expect(score).toBeGreaterThan(0);
    });
    it("nota sem relação pontua 0", () => {
      const score = textRelevance("astronauta", { title: "receita de bolo", content: "farinha e açúcar", tags: null });
      expect(score).toBe(0);
    });
    it("título tem o mesmo peso do conteúdo", () => {
      const a = textRelevance("projeto nexus", { title: "projeto nexus", content: "x", tags: null });
      const b = textRelevance("projeto nexus", { title: "x", content: "projeto nexus", tags: null });
      expect(a).toBe(b);
    });
  });

  describe("generateEmbedding", () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it("retorna erro quando QWEN_API_KEY não existe", async () => {
      vi.stubEnv("QWEN_API_KEY", "");
      const res = await generateEmbedding("teste");
      expect(res).toHaveProperty("reason");
      expect((res as any).reason).toContain("QWEN_API_KEY");
    });

    it("gera vetor 1024 via QwenCloud e cacheia", async () => {
      const fakeFetch = vi.fn(async (_url: string, init: any) => {
        const body = JSON.parse(init.body);
        expect(body.model).toBe("text-embedding-v3");
        expect(body.dimensions).toBe(1024);
        return {
          ok: true,
          json: async () => ({
            model: "text-embedding-v3",
            data: [{ embedding: Array.from({ length: 1024 }, (_, i) => Math.sin(i)) }],
          }),
        };
      });
      vi.stubGlobal("fetch", fakeFetch);
      vi.stubEnv("QWEN_API_KEY", "sk-test-key");

      const r1 = (await generateEmbedding("teste cache")) as { vector: number[]; cached: boolean };
      expect(r1.vector.length).toBe(1024);
      expect(r1.cached).toBe(false);

      const r2 = (await generateEmbedding("teste cache")) as { vector: number[]; cached: boolean };
      expect(r2.vector).toBe(r1.vector);
      expect(r2.cached).toBe(true);
      expect(fakeFetch).toHaveBeenCalledTimes(1);
    });

    it("propaga erro HTTP do provedor", async () => {
      vi.stubEnv("QWEN_API_KEY", "sk-test-key");
      vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 500, text: async () => "boom" })));
      const res = await generateEmbedding("erro");
      expect(res).toHaveProperty("reason");
      expect(String((res as any).reason)).toContain("500");
    });
  });

  describe("isEmbeddingAvailable", () => {
    it("espelha QWEN_API_KEY", () => {
      vi.stubEnv("QWEN_API_KEY", "k");
      expect(isEmbeddingAvailable()).toBe(true);
      vi.stubEnv("QWEN_API_KEY", "");
      expect(isEmbeddingAvailable()).toBe(false);
    });
  });
});
