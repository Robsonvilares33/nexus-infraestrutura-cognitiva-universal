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

describe("analytics", () => {
  it("returns metrics with expected shape", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    await caller.universe.seed();
    // Create a mission so missionsByDay/avgConfidence have data
    await caller.missions.create({
      input: "Análise de mercado de tecnologia",
    });
    const analytics = await caller.analytics.get();
    expect(analytics).toBeDefined();
    expect(Array.isArray(analytics.missionsByDay)).toBe(true);
    expect(typeof analytics.avgConfidence).toBe("number");
    expect(Array.isArray(analytics.agentsActivity)).toBe(true);
    expect(Array.isArray(analytics.memoryByTier)).toBe(true);
  });

  it("returns rows with expected field format", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const analytics = await caller.analytics.get();
    expect(analytics).toBeDefined();
    expect(Array.isArray(analytics.missionsByDay)).toBe(true);
    for (const row of analytics.missionsByDay) {
      expect(row).toHaveProperty("day");
      expect(row).toHaveProperty("count");
      expect(typeof (row as any).count).toBe("number");
    }
    expect(Array.isArray(analytics.agentsActivity)).toBe(true);
    for (const row of analytics.agentsActivity) {
      expect(row).toHaveProperty("agentName");
      expect(row).toHaveProperty("count");
    }
    expect(Array.isArray(analytics.memoryByTier)).toBe(true);
    expect(typeof analytics.avgConfidence).toBe("number");
  });
});

describe(
  "chat",
  () => {
    it(
      "sends a message and receives a response",
      async () => {
        const ctx = createTestContext();
        const caller = appRouter.createCaller(ctx);
        await caller.universe.seed();
        const result = await caller.chat.send({ message: "Qual é o seu papel no ecossistema NEXUS?" });
        expect(result).toBeDefined();
        expect(typeof result.response).toBe("string");
        expect(result.response.length).toBeGreaterThan(0);
      },
      120000,
    );

    it(
      "stores chat messages in memory",
      async () => {
        const ctx = createTestContext();
        const caller = appRouter.createCaller(ctx);
        await caller.chat.send({ message: "Mensagem de teste para verificação" });
        const memory = await caller.memory.list();
        const chatEntries = memory.filter(m => m.content.includes("[Chat]"));
        expect(chatEntries.length).toBeGreaterThan(0);
      },
      120000,
    );
  },
);

describe("marketplace", () => {
  it("lists published plugins", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const plugins = await caller.marketplace.list();
    expect(plugins).toBeDefined();
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
    expect(plugins[0]).toHaveProperty("name");
    expect(plugins[0]).toHaveProperty("category");
    expect(plugins[0]).toHaveProperty("description");
  });

  it("filters by query string", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const results = await caller.marketplace.list({ query: "Segurança" });
    expect(results.some(p => p.name.includes("Segurança") || p.description.includes("Segurança"))).toBe(true);
  });

  it("publishes a plugin and it appears in the listing", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const before = (await caller.marketplace.list()).length;
    const publishResult = await caller.marketplace.publish({
      name: "Plugin de Teste Vitest",
      category: "utility",
      description: "Plugin de teste criado pelo suite de testes",
      version: "0.1.0",
    });
    expect(publishResult.success).toBe(true);
    const after = (await caller.marketplace.list()).length;
    expect(after).toBeGreaterThan(before);

    // Remove test plugin to keep DB clean
    const listed = await caller.marketplace.list({ query: "Plugin de Teste Vitest" });
    await caller.marketplace.remove({ pluginId: listed[0].id });
  });

  it("installs a marketplace plugin into user plugins", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const mp = await caller.marketplace.list();
    const result = await caller.marketplace.install({ pluginId: mp[0].id });
    expect(result.success).toBe(true);
    // Verify it appears in the user's plugins
    const userPlugins = await caller.plugins.list();
    expect(userPlugins.some(p => p.name === mp[0].name)).toBe(true);
  });

  it("lists the current user's published plugins", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const mine = await caller.marketplace.listMine();
    expect(Array.isArray(mine)).toBe(true);
    // Test user seeded demo plugins in this session
    expect(mine.length).toBeGreaterThan(0);
    for (const p of mine) {
      expect(p.authorId).toBe(1);
    }
  });

  it("upvotes a plugin", async () => {
    const ctx = createTestContext();
    const caller = appRouter.createCaller(ctx);
    const mp = await caller.marketplace.list();
    const before = mp[0].upvotes;
    const result = await caller.marketplace.upvote({ pluginId: mp[0].id });
    expect(result.success).toBe(true);
    const after = await caller.marketplace.list();
    const updated = after.find(p => p.id === mp[0].id);
    expect(updated?.upvotes).toBe(before + 1);
  });
});
