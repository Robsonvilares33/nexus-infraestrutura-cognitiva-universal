import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";

type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createTestContext(overrides?: Partial<TrpcContext>): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-user-nexus",
    email: "test@nexus.ai",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
  };

  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
    ...overrides,
  };
}

describe("auth", () => {
  it("returns current user", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.openId).toBe("test-user-nexus");
  });

  it("clears session on logout", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
    expect(ctx.res.clearCookie).toHaveBeenCalled();
  });
});

describe("dashboard", () => {
  it("returns stats object", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const stats = await caller.dashboard.stats();
    expect(stats).toBeDefined();
    expect(typeof stats.missions).toBe("number");
    expect(typeof stats.plugins).toBe("number");
  });
});

describe("universe", () => {
  it("seeds ecosystem", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const result = await caller.universe.seed();
    expect(result.success).toBe(true);
  });

  it("gets universe settings", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const settings = await caller.universe.settings();
    // May be null if not yet configured
    expect(settings === null || typeof settings === "object").toBe(true);
  });
});

describe("plugins", () => {
  it("lists plugins after seed", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    // Seed first
    await caller.universe.seed();
    const plugins = await caller.plugins.list();
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
  });

  it("connects and disconnects a plugin", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await caller.universe.seed();
    await caller.plugins.connect({ name: "Claude" });
    let plugins = await caller.plugins.list();
    let claude = plugins.find(p => p.name === "Claude");
    expect(claude?.connected).toBe(true);

    await caller.plugins.disconnect({ name: "Claude" });
    plugins = await caller.plugins.list();
    claude = plugins.find(p => p.name === "Claude");
    expect(claude?.connected).toBe(false);
  });
});

describe("agents", () => {
  it("lists agents after seed", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await caller.universe.seed();
    const agents = await caller.agents.list();
    expect(Array.isArray(agents)).toBe(true);
    expect(agents.length).toBe(9);
    const names = agents.map(a => a.name).sort();
    expect(names).toContain("Sincronia");
    expect(names).toContain("Pesquisa");
    expect(names).toContain("Execução");
  });
});

describe("projects", () => {
  it("creates and lists projects", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await caller.projects.create({ name: "Test Project", description: "A test" });
    const projects = await caller.projects.list();
    expect(projects.length).toBeGreaterThan(0);
    expect(projects[0]?.name).toBe("Test Project");
  });
});

describe("memory", () => {
  it("adds and lists memory items", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await caller.memory.add({ content: "Test memory", tier: "ativa", tags: ["test"] });
    const memory = await caller.memory.list();
    expect(memory.length).toBeGreaterThan(0);
    expect(memory[0]?.content).toBe("Test memory");
    expect(memory[0]?.tier).toBe("ativa");
  });
});

describe("feed", () => {
  it("adds and lists feed events", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await caller.feed.add({ eventType: "mission", message: "Test event" });
    const feed = await caller.feed.list({ limit: 10 });
    expect(feed.length).toBeGreaterThan(0);
    expect(feed[0]?.message).toBe("Test event");
  });
});
