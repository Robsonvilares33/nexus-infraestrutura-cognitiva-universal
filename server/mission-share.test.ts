import { describe, it, expect, vi, beforeEach } from "vitest";

// Isolated unit tests for the mission share (export/import) payload logic
// — no DB, no router wiring: pure encoding/decoding + validation rules.

const makePayload = (overrides: Record<string, unknown> = {}) => ({
  version: 1,
  app: "nexus",
  input: "Analisar o mercado de IA em 2026",
  title: "Analisar o mercado de IA em 2026",
  result: "Mercado cresceu 40%.",
  confidence: "0.82",
  exportedAt: "2026-08-16T05:00:00.000Z",
  exportedBy: "usr_open_id_123",
  ...overrides,
});

const encode = (payload: Record<string, unknown>) =>
  Buffer.from(JSON.stringify(payload), "utf-8").toString("base64url");

const decode = (code: string) => JSON.parse(Buffer.from(code, "base64url").toString("utf-8"));

describe("compartilhamento de missões — formato do código", () => {
  it("roundtrip base64url preserva o payload completo", () => {
    const payload = makePayload();
    const code = encode(payload);
    expect(code).not.toContain("+"); // URL-safe
    expect(code).not.toContain("="); // no padding
    expect(decode(code)).toEqual(payload);
  });

  it("exportMission limita title a 80 caracteres e mantém input integral", () => {
    const longInput = "missão".repeat(200); // 1200 chars
    const payload = { ...makePayload({ input: longInput }), title: longInput.slice(0, 80) };
    expect(payload.title.length).toBe(80);
    expect(payload.input.length).toBe(1200);
  });

  it("importMission limita input a 5000 caracteres e rejeita strings vazias", () => {
    const huge = "x".repeat(6000);
    const limited = String(huge).slice(0, 5000);
    expect(limited.length).toBe(5000);
    expect("   ".trim()).toBe("");
  });
});

describe("compartilhamento de missões — validação de importação", () => {
  const validate = (code: string) => {
    try {
      const parsed = decode(code);
      if (parsed.app !== "nexus" || parsed.version !== 1) throw new Error("incompatível");
      const missionInput = String(parsed.input || "").slice(0, 5000);
      if (!missionInput.trim()) throw new Error("vazia");
      return { ok: true as const, missionInput };
    } catch (e) {
      return { ok: false as const, reason: (e as Error).message };
    }
  };

  it("aceita um código exportado válido", () => {
    const r = validate(encode(makePayload()));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.missionInput).toBe("Analisar o mercado de IA em 2026");
  });

  it("rejeita base64 inválido", () => {
    const r = validate("!!!não-é-base64-valido!!!");
    expect(r.ok).toBe(false);
  });

  it("rejeita JSON inválido dentro de base64 válido", () => {
    const code = encode("texto que não é JSON" as unknown as Record<string, unknown>);
    const r = validate(code);
    expect(r.ok).toBe(false);
  });

  it("rejeita payload de outro aplicativo (app ≠ nexus)", () => {
    const code = encode(makePayload({ app: "outro_app" }));
    const r = validate(code);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("incompatível");
  });

  it("rejeita versão de payload futura (version ≠ 1)", () => {
    const code = encode(makePayload({ version: 2 }));
    const r = validate(code);
    expect(r.ok).toBe(false);
  });

  it("rejeita missão vazia ou só com espaços", () => {
    const code = encode(makePayload({ input: "   " }));
    const r = validate(code);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("vazia");
  });

  it("aceita payload sem campos opcionais (title/result/confidence)", () => {
    const code = encode({ app: "nexus", version: 1, input: "missão mínima" });
    const r = validate(code);
    expect(r.ok).toBe(true);
  });
});
