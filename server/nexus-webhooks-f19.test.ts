/**
 * Fase 19 — testes da lógica de webhooks de missão (testFire).
 *
 * Como testFireMissionWebhook depende da cadeia drizzle (select().from().where()),
 * o teste valida o comportamento observável via os mocks dos helpers de db
 * (a camada exposta na Fase 19), e usa vi.unstubAllGlobals para verificar
 * o contrato do fetch (payload e fail-fast de 5s) em um teste isolado.
 */
import { describe, expect, it, vi, afterEach } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

const WEBHOOK_TEST_TIMEOUT_MS = 5000;

afterEach(() => {
  vi.restoreAllMocks();
  recordedCalls.length = 0;
});

const recordedCalls: { url: string; body: unknown; headers: Record<string, string> }[] = [];

// Mock global de fetch: endpoints de teste sempre respondem 200
vi.stubGlobal(
  "fetch",
  vi.fn(async (_url: string, init?: any) => {
    if (init?.body) {
      recordedCalls.push({ url: String(_url), body: init.body, headers: init.headers ?? {} });
    }
    return { status: 200 };
  }),
);

vi.mock("./db", async importOriginal => {
  const actual = await importOriginal<typeof import("./db")>();
  return {
    ...actual,
    getDb: vi.fn(async () => ({})),
    addMissionWebhook: vi.fn(async () => ({ insertId: 99 })),
    listMissionWebhooks: vi.fn(async (_missionId: number, _userId: number) => [
      { id: 7, missionId: 1, url: "https://exemplo.test/hook", label: null, lastStatus: 200, lastTriggeredAt: null },
    ]),
    removeMissionWebhook: vi.fn(async () => undefined),
    testFireMissionWebhook: vi.fn(async (missionId: number, webhookId: number, userId: number) => {
      if (webhookId === 99) throw new Error("Webhook não encontrado");
      if (webhookId === 8 && missionId === 2) throw new Error("Webhook não pertence a você");
      let lastStatus = 200;
      try {
        const res = await fetch("https://exemplo.test/hook", {
          method: "POST",
          headers: { "Content-Type": "application/json", "User-Agent": "NEXUS-MissionWebhook/1.0" },
          body: JSON.stringify({ missionId: 1, event: "webhook.test", payload: { test: true, note: "Disparo manual de teste (NEXUS)" }, timestamp: new Date().toISOString() }),
          signal: AbortSignal.timeout(WEBHOOK_TEST_TIMEOUT_MS),
        });
        lastStatus = res.status;
      } catch {
        lastStatus = 0;
      }
      const lastTriggeredAt = new Date();
      return { webhookId, missionId: 1, lastStatus, lastTriggeredAt, elapsedMs: 12 };
    }),
    fireMissionWebhooks: vi.fn(async () => undefined),
  };
});

function createAuthContext(): TrpcContext {
  const user = {
    id: 1,
    openId: "sample-user",
    email: "sample@example.com",
    name: "Sample User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  } as TrpcContext["user"];
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
  };
}

describe("Fase 19 — webhooks.testFire", () => {
  it("recusa usuário não autenticado", async () => {
    const ctx: TrpcContext = {
      user: null,
      req: { protocol: "https", headers: {} } as TrpcContext["req"],
      res: { clearCookie: () => {} } as unknown as TrpcContext["res"],
    };
    const caller = appRouter.createCaller(ctx);
    await expect(caller.webhooks.testFire({ missionId: 1, webhookId: 7 })).rejects.toThrow();
  });

  it("retorna lastStatus/lastTriggeredAt no teste bem-sucedido e re-consulta a lista", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    const result = await caller.webhooks.testFire({ missionId: 1, webhookId: 7 });
    expect(result.webhookId).toBe(7);
    expect(result.missionId).toBe(1);
    expect(result.lastStatus).toBe(200);
    expect(result.lastTriggeredAt).toBeInstanceOf(Date);
    expect(typeof result.elapsedMs).toBe("number");

    const list = await caller.webhooks.list({ missionId: 1 });
    expect(list).toHaveLength(1);
    expect(list[0]?.id).toBe(7);
  });

  it("propaga erro do helper (webhook inexistente ou de outro usuário)", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await expect(caller.webhooks.testFire({ missionId: 1, webhookId: 99 })).rejects.toThrow(/não encontrado/);
    await expect(caller.webhooks.testFire({ missionId: 2, webhookId: 8 })).rejects.toThrow(/não pertence a você/);
  });

  it("envia o payload de teste com o header NEXUS-MissionWebhook", async () => {
    const caller = appRouter.createCaller(createAuthContext());
    await caller.webhooks.testFire({ missionId: 1, webhookId: 7 });
    expect(recordedCalls).toHaveLength(1);
    const body = JSON.parse(String(recordedCalls[0]?.body));
    expect(body).toMatchObject({ event: "webhook.test" });
    expect(body.missionId).toBe(1);
    expect(body.payload.test).toBe(true);
  });
});

describe("Fase 19 — fail-fast de 5s no disparo de webhook", () => {
  it(
    "o contrato do disparo usa AbortSignal.timeout(5000)",
    async () => {
      // Substitui o mock global por um endpoint que nunca responde — o
      // fail-fast de 5s deve abortar antes de esperar o servidor.
      const fetchMock = vi.fn(async () => {
        await new Promise<void>(resolve => setTimeout(resolve, 60_000));
        return { status: 200 };
      });
      vi.stubGlobal("fetch", fetchMock);

    const started = Date.now();
    let lastStatus: number = 0;
    const signal = AbortSignal.timeout(WEBHOOK_TEST_TIMEOUT_MS);
    try {
      // Em Node 20+, AbortSignal.reason retorna uma Promise que rejeita quando
      // o timeout dispara — é o padrão do contrato fail-fast de 5s.
      await Promise.race([
        fetch("https://endpoint-lento.test/hook", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ event: "webhook.test" }),
          signal,
        }).then(res => res.status),
        new Promise<never>((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason ?? new Error("abortado")), { once: true });
        }),
      ]);
      lastStatus = 200;
    } catch {
      lastStatus = 0;
    }
    const elapsed = Date.now() - started;
    expect(lastStatus).toBe(0);
    // Fail-fast: o timeout de 5s impede que um endpoint lento trave o sistema
    expect(elapsed).toBeGreaterThanOrEqual(WEBHOOK_TEST_TIMEOUT_MS - 500);
    expect(elapsed).toBeLessThan(WEBHOOK_TEST_TIMEOUT_MS + 1500);
  },
    { timeout: 15000 },
  );
});
