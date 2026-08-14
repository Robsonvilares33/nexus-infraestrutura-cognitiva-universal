import { describe, expect, it } from "vitest";
import { appRouter } from "./routers";
import { createMission } from "./db";
import type { TrpcContext } from "./_core/context";

// Reprodução end-to-end do modo agente com o usuário real do owner,
// banco real e LLM real — para capturar o travamento observado no navegador.
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

const OWNER_OPEN_ID = process.env.OWNER_OPEN_ID;
const OWNER_NAME = process.env.OWNER_NAME ?? "Owner";

function createContext(): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1020001,
    openId: OWNER_OPEN_ID ?? "owner-open-id",
    email: "owner@example.com",
    name: OWNER_NAME,
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

describe("modo agente — execução real (live)", { timeout: 300_000 }, () => {
  it("executa missão no modo agent sem travar", async () => {
    const caller = appRouter.createCaller(createContext());

    const created = (await caller.missions.create({
      input: "Liste 5 startups brasileiras de fintech em alta e sugira 3 estratégias de entrada para uma nova fintech de crédito",
    })) as any;
    const mid = created?.insertId ?? created?.[0]?.insertId;
    expect(mid).toBeTruthy();

    const start = Date.now();
    // O upstream de LLM pode ficar degradado de forma transitória (AbortError
    // após as 3 tentativas). Neste cenário a missão deve falhar rápido e de
    // forma explícita (status failed) — nunca ficar travada em 'executing'.
    // O router re-lança o erro após marcar a missão como failed, então capturar
    // a exceção também é um sinal válido do caminho degradado.
    let res: any;
    let executeThrew = false;
    try {
      res = (await caller.missions.execute({
        missionId: mid,
        input: "Liste 5 startups brasileiras de fintech em alta e sugira 3 estratégias de entrada para uma nova fintech de crédito",
        mode: "agent",
      })) as any;
    } catch {
      executeThrew = true;
    }
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(180_000); // não pode travar por minutos

    if (res?.result) {
      // corrida completa com o LLM saudável
      expect(res.result).toBeTruthy();
      const steps = (await caller.missions.getSteps({ missionId: mid })) as any;
      expect(Array.isArray(steps)).toBe(true);
      expect(steps.length).toBeGreaterThan(0);
    } else {
      // corrida degradada (res vazio ou exceção re-lançada): missão deve terminar
      // em estado final (failed), nunca 'executing'
      const list = (await caller.missions.list({})) as any;
      const m = (Array.isArray(list) ? list : list?.missions)?.find?.((x: any) => x.id === mid);
      expect(executeThrew || !res).toBe(true);
      expect(m?.status).not.toBe("executing");
      expect(m?.status).toBe("failed");
    }
  });
});
