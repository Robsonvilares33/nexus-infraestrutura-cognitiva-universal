import { afterEach, describe, expect, it, vi } from "vitest";

// --- Mock LLM: invokeLLMWithProvider vive em nexus-multillm. ---
vi.mock("./nexus-multillm", () => ({
  invokeLLMWithProvider: vi.fn(async (cfg: any, params: any) => (mockInvoke as any)(cfg, params)),
}));

// --- Mock db: preferências qwen + notas semânticas. ---
const recordedMemory: any[] = [];
vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getLlmSettings: vi.fn(async () => ({ provider: "qwen", model: "qwen-turbo", apiKey: "test-key", baseUrl: undefined })),
    getAgents: vi.fn(async () => []),
    addMemory: vi.fn(async (userId: number, data: any) => { recordedMemory.push({ userId, ...data }); return { success: true }; }),
    addFeedEvent: vi.fn(async () => undefined),
    searchSuperNotes: vi.fn(async () => [
      { id: 20, userId: 1, title: "Token do GitHub", content: "anotação sobre o token do GitHub", folder: "Geral", source: "user" },
    ]),
    semanticSearchSuperNotes: vi.fn(async () => [
      { note: { id: 21, userId: 1, title: "Arquitetura da ponte neural", content: "a ponte neural conecta Manus-01 à rede SIAOL", folder: "Projetos", source: "agent" }, score: 0.92 },
    ]),
    saveSuperNoteEmbedding: vi.fn(async () => undefined),
  };
});

// --- Mock embeddings (sem chamada real ao QwenCloud). ---
vi.mock("./nexus-embeddings", async () => {
  const orig = await import("./nexus-embeddings");
  return {
    ...orig,
    generateEmbedding: vi.fn(async () => ({ vector: Array.from({ length: 1024 }, (_, i) => i / 1024), model: "text-embedding-v3", cached: false })),
    isEmbeddingAvailable: () => true,
    normalize: orig.normalize,
  };
});

import { buildAgentSystemPrompt, buildRagContext, multiAgentChat } from "./nexus-multichat";
import { addMemory } from "./db";

let mockInvoke: (cfg: any, params: any) => Promise<any>;

afterEach(() => {
  vi.clearAllMocks();
  recordedMemory.length = 0;
});

describe("Fase 18 — Chat multiagente", () => {
  it("monta o system prompt com a persona do agente escolhido", async () => {
    const prompt = await buildAgentSystemPrompt("Código");
    expect(prompt).toContain("agente NEXUS \"Código\"");
    expect(prompt).toContain("desenvolvimento, revisão e depuração de código");
    expect(prompt).toContain("preciso e prático");

    const geral = await buildAgentSystemPrompt("");
    expect(geral).toContain("Você é o NEXUS");
    expect(geral).not.toContain("agente NEXUS \"");
  });

  it("injeta notas da Super Memória via RAG semântico e responde pelo provedor do usuário", async () => {
    let capturedParams: any = null;
    let capturedConfig: any = null;
    mockInvoke = async (cfg, params) => {
      capturedConfig = cfg;
      capturedParams = params;
      return { choices: [{ index: 0, message: { role: "assistant", content: "A ponte neural conecta Manus-01 à rede SIAOL." }, finish_reason: "stop" }] };
    };

    const result = await multiAgentChat(1, { message: "como funciona a ponte neural?", agent: "Memória" });
    expect(result.agentName).toBe("Memória");
    expect(result.ragNotes).toBe(1);
    expect(capturedConfig.provider).toBe("qwen");
    expect(capturedConfig.apiKey).toBe("test-key");
    expect(capturedParams.messages[0].content).toContain("Arquitetura da ponte neural");
    expect(capturedParams.messages[0].content).toContain("0.920");
    expect(capturedParams.messages[0].content).toContain("agente NEXUS \"Memória\"");
    expect(result.response).toContain("ponte neural");
  });

  it("usa o fallback textual quando embeddings estão indisponíveis", async () => {
    const embMod = await import("./nexus-embeddings");
    vi.spyOn(embMod, "isEmbeddingAvailable").mockReturnValue(false);
    const searchFn = vi.fn(async () => [
      { id: 22, userId: 1, title: "Token do GitHub", content: "token ghp_xxx para o repositório", folder: "Geral", source: "user" },
    ]);
    const { searchSuperNotes } = await import("./db");
    vi.mocked(searchSuperNotes).mockImplementation(searchFn as any);

    mockInvoke = async () => ({ choices: [{ index: 0, message: { role: "assistant", content: "token encontrado" }, finish_reason: "stop" }] });
    const result = await multiAgentChat(1, { message: "qual o token do GitHub?" });
    expect(result.ragNotes).toBe(1);
    const prompt = (await import("./db")).searchSuperNotes;
    // a chamada textual aconteceu (fallback)
    expect(searchFn.mock.calls.length >= 1 || vi.mocked(prompt).mock.calls.length >= 1).toBe(true);
    vi.restoreAllMocks();
  });

  it("envia o histórico da sessão ao LLM (janela de 10 turns)", async () => {
    let capturedParams: any = null;
    mockInvoke = async (_cfg, params) => {
      capturedParams = params;
      return { choices: [{ index: 0, message: { role: "assistant", content: "ok" }, finish_reason: "stop" }] };
    };
    const history = Array.from({ length: 12 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `turn-${i}` }));
    await multiAgentChat(1, { message: "último", agent: "Sincronia", history });
    const nonSystem = capturedParams.messages.filter((m: any) => m.role !== "system");
    expect(nonSystem.length).toBe(11); // 10 do histórico + 1 do usuário
    expect(nonSystem[0].content).toBe("turn-2"); // os 2 mais antigos foram descartados
  });

  it("propaga erro do LLM em vez de engolir", async () => {
    mockInvoke = async () => { throw new Error("LLM invoke failed: 412"); };
    await expect(multiAgentChat(1, { message: "erro de cota" })).rejects.toThrow("412");
  });

  it("registra pergunta e resposta na Super Memória com tags chat", async () => {
    mockInvoke = async () => ({ choices: [{ index: 0, message: { role: "assistant", content: "resposta do agente" }, finish_reason: "stop" }] });
    const result = await multiAgentChat(1, { message: "pergunta registrada", agent: "Execução" });
    // o registro é assíncrono (fire-and-forget); espera curta
    await new Promise(r => setTimeout(r, 300));
    const entries = (recordedMemory.length > 0 ? recordedMemory : vi.mocked(addMemory).mock.calls.map(c => c[1]));
    const texts = entries.map(e => e.content as string);
    expect(texts.some(t => t.includes("pergunta registrada"))).toBe(true);
    expect(texts.some(t => t.includes("resposta do agente"))).toBe(true);
    expect(entries[0].origin).toBe("chat");
    expect(result.response).toContain("resposta do agente");
  });

  it("agentes all/vazio usam o prompt geral NEXUS", async () => {
    const all = await buildAgentSystemPrompt("all");
    expect(all).not.toContain("agente NEXUS \"");
    const unknown = await buildAgentSystemPrompt("AgenteInventado");
    expect(unknown).not.toContain("AgenteInventado");
  });
});
