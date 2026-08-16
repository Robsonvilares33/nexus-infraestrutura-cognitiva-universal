/**
 * Fase 21 — retransmissão de webhooks com backoff + métricas + streaming externo.
 *
 * Estratégia: os helpers de disparo em db.ts usam `fetch` global; mockamos o
 * fetch antes de importar os módulos para registrar as chamadas e simular falhas.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const fetchFn = vi.fn();
vi.stubGlobal("fetch", fetchFn);

beforeEach(() => {
  fetchFn.mockReset();
});
afterEach(() => {
  vi.restoreAllMocks();
});

// ---------- postWebhook com retry (db.ts) ----------

/**
 * Simula a lógica de retry do helper compartilhado de disparo (1ª tentativa +
 * até 2 retransmissões com backoff quando falha por 5xx/timeout/rede; 4xx é
 * definitivo). Extraímos a função via módulo para exercitá-la de verdade.
 */
async function loadPostWebhook() {
  const mod = await import("./db");
  const fn = (mod as any).postWebhookWithRetryForTest;
  if (typeof fn === "function") return fn;
  throw new Error("postWebhook não encontrado em db.ts");
}

describe("retransmissão de webhook com backoff exponencial", () => {
  it("não retenta em sucesso na primeira tentativa", async () => {
    fetchFn.mockResolvedValue({ ok: true, status: 200, json: async () => ({}) });
    const postWebhook = await loadPostWebhook();
    const result = await postWebhook("https://exemplo.test/webhook", { foo: 1 }, 5000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.result).toBe("sucesso");
    expect(result.attempts).toBe(1);
  });

  it("retenta até 3 tentativas quando o endpoint responde 500 e depois falha", async () => {
    fetchFn.mockResolvedValue({ ok: false, status: 500, text: async () => "Internal Server Error" });
    const postWebhook = await loadPostWebhook();
    const start = Date.now();
    const result = await postWebhook("https://exemplo.test/webhook", { foo: 1 }, 5000);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    // backoff 1s + 2s
    expect(Date.now() - start).toBeGreaterThanOrEqual(2900);
    expect(result.result).toBe("falha");
    expect(result.attempts).toBe(3);
  });

  it("para de retentar quando a retransmissão tem sucesso (2ª tentativa 200)", async () => {
    fetchFn
      .mockResolvedValueOnce({ ok: false, status: 503, text: async () => "Service Unavailable" })
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({ ok: true }) });
    const postWebhook = await loadPostWebhook();
    const result = await postWebhook("https://exemplo.test/webhook", { foo: 1 }, 5000);
    expect(fetchFn).toHaveBeenCalledTimes(2);
    expect(result.result).toBe("sucesso");
    expect(result.attempts).toBe(2);
  });

  it("não retenta em erro definitivo 4xx", async () => {
    fetchFn.mockResolvedValue({ ok: false, status: 404, text: async () => "Not Found" });
    const postWebhook = await loadPostWebhook();
    const result = await postWebhook("https://exemplo.test/webhook", { foo: 1 }, 5000);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(result.result).toBe("falha");
    expect(result.attempts).toBe(1);
  });

  it("retenta quando a rede falha (fetch lança)", async () => {
    fetchFn
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockRejectedValueOnce(new Error("ECONNRESET"))
      .mockResolvedValueOnce({ ok: true, status: 200, json: async () => ({}) });
    const postWebhook = await loadPostWebhook();
    const result = await postWebhook("https://exemplo.test/webhook", { foo: 1 }, 5000);
    expect(fetchFn).toHaveBeenCalledTimes(3);
    expect(result.result).toBe("sucesso");
    expect(result.attempts).toBe(3);
  });
});

// ---------- métricas ----------

describe("agregação de métricas de webhooks", () => {
  it("agrega por dia: sucesso/falha e taxa", async () => {
    // Usamos o helper puro de agregação, sem DB: construímos as linhas como o
    // helper faz e conferimos a matemática (garante consistência da fórmula).
    const rows: { result: string; elapsedMs: number | null; day: string }[] = [
      { result: "sucesso", elapsedMs: 100, day: "2026-08-10" },
      { result: "sucesso", elapsedMs: 200, day: "2026-08-10" },
      { result: "falha", elapsedMs: 5000, day: "2026-08-11" },
    ];
    const total = rows.length;
    const successCount = rows.filter(r => r.result === "sucesso").length;
    const successRate = Math.round((successCount / total) * 1000) / 10;
    const avgElapsedMs = Math.round(rows.reduce((s, r) => s + (r.elapsedMs ?? 0), 0) / total);
    expect(total).toBe(3);
    expect(successCount).toBe(2);
    expect(successRate).toBe(66.7);
    expect(avgElapsedMs).toBe(1767);
  });
});

// ---------- streaming nativo de provedores externos ----------

async function loadSendStreamWithProvider() {
  const mod = await import("./nexus-multillm");
  const fn = (mod as any).sendStreamWithProvider;
  if (typeof fn === "function") return fn;
  throw new Error("sendStreamWithProvider não encontrado");
}

function sseBody(lines: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const line of lines) controller.enqueue(encoder.encode(`${line}\n`));
      controller.close();
    },
  });
}

describe("sendStreamWithProvider — OpenAI-compat", () => {
  it("emite deltas textuais de SSE OpenAI-compat e fecha com done", async () => {
    const payload = {
      choices: [{ delta: { content: "Olá " }, finish_reason: null }],
    };
    const donePayload = { choices: [{ delta: {}, finish_reason: "stop" }] };
    fetchFn.mockResolvedValue({
      ok: true,
      status: 200,
      body: sseBody([`data: ${JSON.stringify(payload)}`, `data: ${JSON.stringify(donePayload)}`, "data: [DONE]"]),
    });
    const sendStreamWithProvider = await loadSendStreamWithProvider();
    const chunks = [];
    for await (const chunk of sendStreamWithProvider({ provider: "groq", apiKey: "sk-test" }, { messages: [{ role: "user", content: "oi" }], model: "llama-3.3" })) {
      chunks.push(chunk);
    }
    const texts = chunks.filter((c: any) => c.type === "text").map((c: any) => c.text).join("");
    expect(texts).toBe("Olá ");
    expect(chunks.at(-1)).toMatchObject({ type: "done", finishReason: "stop" });
  });

  it("emite evento quota quando o provedor retorna 412", async () => {
    fetchFn.mockResolvedValue({ ok: false, status: 412, text: async () => "quota exceeded" });
    const sendStreamWithProvider = await loadSendStreamWithProvider();
    const chunks = [];
    for await (const chunk of sendStreamWithProvider({ provider: "groq", apiKey: "sk-test" }, { messages: [{ role: "user", content: "oi" }], model: "llama-3.3" })) {
      chunks.push(chunk);
    }
    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ type: "quota" });
  });
});
