import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolCall } from "./_core/llm";

// --- Mock LLM module: scripted tool-call decisions drive the loop. ---
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn(async (params: any) => (mockInvokeLLM as any)(params)),
  listLLMModels: vi.fn(async () => ({ data: [] })),
}));

// --- Mock db: persist in memory; provide super-notes RAG data. ---
vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    addFeedEvent: vi.fn(async () => undefined),
    addMissionStep: vi.fn(async () => undefined),
    getMemoryByTier: vi.fn(async () => []),
    addMemory: vi.fn(async () => undefined),
    updateMission: vi.fn(async () => undefined),
    awardXp: vi.fn(async () => undefined),
    fireMissionWebhooks: vi.fn(async () => undefined),
    addInAppNotification: vi.fn(async () => undefined),
    evaluateAchievements: vi.fn(async () => undefined),
    searchSuperNotes: vi.fn(async () => [
      { id: 10, userId: 1, title: "Chave API do projeto", content: "anotação sobre chaves de API", folder: "Geral", source: "user" },
    ]),
    semanticSearchSuperNotes: vi.fn(async () => [
      { note: { id: 11, userId: 1, title: "Arquitetura da ponte neural", content: "a ponte neural conecta Manus-01 à rede SIAOL", folder: "Projetos", source: "agent" }, score: 0.92 },
    ]),
    saveSuperNoteEmbedding: vi.fn(async () => undefined),
  };
});

// --- Mock embeddings (no real QwenCloud call). ---
vi.mock("./nexus-embeddings", async () => {
  const orig = await import("./nexus-embeddings");
  return {
    ...orig,
    generateEmbedding: vi.fn(async (text: string) => ({
      vector: orig.normalize(Array.from({ length: 1024 }, () => text.length % 2 ? 1 : 0.5)),
      model: "text-embedding-v3",
      cached: false,
    })),
    isEmbeddingAvailable: () => true,
  };
});

import { runAgentLoop } from "./nexus-agent";
import { addMissionStep, getDb } from "./db";

function toolCall(name: string, args: Record<string, unknown>): ToolCall {
  return { id: `call_${name}_${Math.random().toString(36).slice(2, 8)}`, type: "function", function: { name, arguments: JSON.stringify(args) } };
}

const INTERPRET_RESPONSE = {
  choices: [{ index: 0, message: { role: "assistant", content: JSON.stringify({ interpretedGoal: "verificar ponte neural", complexity: "low", initialPlan: "comunicar via symbiosis" }) }, finish_reason: "stop" }],
} as any;

let mockInvokeLLM: (params: any) => Promise<any>;
const recordedSteps: any[] = [];

beforeEach(() => {
  recordedSteps.length = 0;
  addMissionStep.mockImplementation(async (missionId: number, data: any) => {
    recordedSteps.push({ missionId, ...data });
    return undefined;
  });
});

afterEach(async () => {
  vi.clearAllMocks();
  const db = await getDb();
  if (db) {
    try {
        await db.execute(`DELETE FROM missionSteps WHERE detail LIKE '%vitest%'` as any);
        await db.execute(`DELETE FROM cognitiveFeed WHERE message LIKE '%vitest%'` as any);
      } catch { /* never fail the suite */ }
  }
});

afterAll(() => vi.resetAllMocks());

describe("runAgentLoop — Fase 15 (RAG + Ponte Neural SIAOL)", () => {
  it("usa memory_search (RAG) e persiste o resultado semântico", async () => {
    let iter = 0;
    mockInvokeLLM = async (params: any) => {
      if (!params.tools) return INTERPRET_RESPONSE;
      iter += 1;
      if (iter === 1) {
        return { choices: [{ index: 0, message: { role: "assistant", content: "", tool_calls: [toolCall("memory_search", { query: "como a ponte neural conecta os agentes" })] }, finish_reason: "tool_calls" }] };
      }
      return { choices: [{ index: 0, message: { role: "assistant", content: "", tool_calls: [toolCall("finish", { result: "consulta à Super Memória concluída", confidence: 0.9 })] }, finish_reason: "tool_calls" }] };
    };

    const result = await runAgentLoop(1, 9001, "[vitest] RAG memory_search", { maxIterations: 4 });
    expect(result.result).toContain("consulta à Super Memória");
    const results = recordedSteps.filter(s => s.stepType === "tool_result" && s.toolName === "memory_search");
    expect(results.length).toBe(1);
    expect(results[0].detail).toContain("Arquitetura da ponte neural");
    expect(results[0].detail).toContain("92%");
  });

  it("envia mensagem à Ponte Neural SIAOL via symbiosis_post", async () => {
    const fakeFetch = vi.fn(async (url: string, init: any) => {
      // only the bridge call carries a JSON body; other internal fetches pass through untouched
      if (init?.body && String(url).includes("message")) {
        const body = JSON.parse(init.body);
        expect(body.sender).toBe("Manus-01");
        expect(body.channel).toBe("symbiosis");
        expect(body.priority).toBe("high");
        expect(init.headers.Authorization).toBe("Bearer spark-antigravity-symbiosis-2026");
        return { ok: true, json: async () => ({ message: { id: "test-msg-id" } }) };
      }
      throw new Error(`fetch não esperado para ${url}`);
    });
    vi.stubGlobal("fetch", fakeFetch);

    let iter = 0;
    mockInvokeLLM = async (params: any) => {
      if (!params.tools) return INTERPRET_RESPONSE;
      iter += 1;
      if (iter === 1) {
        return { choices: [{ index: 0, message: { role: "assistant", content: "", tool_calls: [toolCall("symbiosis_post", { content: "Ponte ativa — missão concluída", priority: "high" })] }, finish_reason: "tool_calls" }] };
      }
      return { choices: [{ index: 0, message: { role: "assistant", content: "", tool_calls: [toolCall("finish", { result: "comunicação enviada", confidence: 0.8 })] }, finish_reason: "tool_calls" }] };
    };

    const result = await runAgentLoop(1, 9002, "[vitest] symbiosis_post", { maxIterations: 4 });
    expect(result.result).toContain("comunicação enviada");
    expect(fakeFetch.mock.calls.some(([url]) => String(url).includes("message"))).toBe(true);
    const posted = recordedSteps.find(s => s.stepType === "tool_result" && s.toolName === "symbiosis_post");
    expect(posted.detail).toContain("sucesso");
    expect(posted.detail).toContain("test-msg-id");
    vi.unstubAllGlobals();
  });

  it("continua a missão quando a ponte neural está fora do ar", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: false, status: 502 })));

    let iter = 0;
    mockInvokeLLM = async (params: any) => {
      if (!params.tools) return INTERPRET_RESPONSE;
      iter += 1;
      if (iter === 1) {
        return { choices: [{ index: 0, message: { role: "assistant", content: "", tool_calls: [toolCall("symbiosis_post", { content: "ping" })] }, finish_reason: "tool_calls" }] };
      }
      return { choices: [{ index: 0, message: { role: "assistant", content: "", tool_calls: [toolCall("finish", { result: "ponte indisponível, mas missão concluiu", confidence: 0.6 })] }, finish_reason: "tool_calls" }] };
    };

    const result = await runAgentLoop(1, 9003, "[vitest] symbiosis_post fora do ar", { maxIterations: 4 });
    expect(result.result).toContain("missão concluiu");
    const posted = recordedSteps.find(s => s.stepType === "tool_result" && s.toolName === "symbiosis_post");
    expect(posted.detail).toContain("indisponível");
    vi.unstubAllGlobals();
  });

  it("system prompt anuncia memory_search e symbiosis_post como ferramentas", async () => {
    let captured: any = null;
    mockInvokeLLM = async (params: any) => {
      captured = params;
      return INTERPRET_RESPONSE;
    };
    await runAgentLoop(1, 9004, "[vitest] ferramentas no prompt", { maxIterations: 2 });
    const names = captured.messages[0].content.match(/memory_search|symbiosis_post/g) ?? [];
    expect(names.includes("memory_search")).toBe(true);
    expect(names.includes("symbiosis_post")).toBe(true);
  });
});
