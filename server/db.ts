import { and, asc, desc, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  users, plugins, models, agents, projects, missions, memory, cognitiveFeed, universeSettings,
  type InsertUser
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }
  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};
    const textFields = ["name", "email", "loginMethod"] as const;
    for (const field of textFields) {
      const value = user[field];
      if (value === undefined) continue;
      const normalized = value ?? null;
      (values as any)[field] = normalized;
      updateSet[field] = normalized;
    }
    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();
    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// Dashboard Stats
export async function getDashboardStats(userId: number) {
  const db = await getDb();
  if (!db) return { missions: 0, projects: 0, plugins: 0, connectedPlugins: 0, models: 0, connectedModels: 0, agents: 0, onlineAgents: 0, executingMissions: 0, memoryItems: 0 };
  let [mCount, pCount, plCount, cpCount, moCount, cmCount, agCount, oaCount, emCount, memCount] = await Promise.all([
    db.select({ count: sql<number>`count(*)` }).from(missions).where(eq(missions.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(projects).where(eq(projects.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(plugins).where(eq(plugins.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(plugins).where(and(eq(plugins.userId, userId), eq(plugins.connected, true))),
    db.select({ count: sql<number>`count(*)` }).from(models).where(eq(models.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(models).where(and(eq(models.userId, userId), eq(models.connected, true))),
    db.select({ count: sql<number>`count(*)` }).from(agents).where(eq(agents.userId, userId)),
    db.select({ count: sql<number>`count(*)` }).from(agents).where(and(eq(agents.userId, userId), eq(agents.status, 'online'))),
    db.select({ count: sql<number>`count(*)` }).from(missions).where(and(eq(missions.userId, userId), eq(missions.status, 'executing'))),
    db.select({ count: sql<number>`count(*)` }).from(memory).where(eq(memory.userId, userId)),
  ]);

  // Auto-seed if no agents
  if ((agCount[0]?.count ?? 0) === 0) {
    await seedPlugins(userId);
    await seedModels(userId);
    await seedAgents(userId);
    // Re-fetch stats after seed
    [mCount, pCount, plCount, cpCount, moCount, cmCount, agCount, oaCount, emCount, memCount] = await Promise.all([
      db.select({ count: sql<number>`count(*)` }).from(missions).where(eq(missions.userId, userId)),
      db.select({ count: sql<number>`count(*)` }).from(projects).where(eq(projects.userId, userId)),
      db.select({ count: sql<number>`count(*)` }).from(plugins).where(eq(plugins.userId, userId)),
      db.select({ count: sql<number>`count(*)` }).from(plugins).where(and(eq(plugins.userId, userId), eq(plugins.connected, true))),
      db.select({ count: sql<number>`count(*)` }).from(models).where(eq(models.userId, userId)),
      db.select({ count: sql<number>`count(*)` }).from(models).where(and(eq(models.userId, userId), eq(models.connected, true))),
      db.select({ count: sql<number>`count(*)` }).from(agents).where(eq(agents.userId, userId)),
      db.select({ count: sql<number>`count(*)` }).from(agents).where(and(eq(agents.userId, userId), eq(agents.status, 'online'))),
      db.select({ count: sql<number>`count(*)` }).from(missions).where(and(eq(missions.userId, userId), eq(missions.status, 'executing'))),
      db.select({ count: sql<number>`count(*)` }).from(memory).where(eq(memory.userId, userId)),
    ]);
  }

  return {
    missions: mCount[0]?.count ?? 0,
    projects: pCount[0]?.count ?? 0,
    plugins: plCount[0]?.count ?? 0,
    connectedPlugins: cpCount[0]?.count ?? 0,
    models: moCount[0]?.count ?? 0,
    connectedModels: cmCount[0]?.count ?? 0,
    agents: agCount[0]?.count ?? 0,
    onlineAgents: oaCount[0]?.count ?? 0,
    executingMissions: emCount[0]?.count ?? 0,
    memoryItems: memCount[0]?.count ?? 0,
  };
}

// Universe Settings
export async function getUniverseSettings(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(universeSettings).where(eq(universeSettings.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}
export async function saveUniverseSettings(userId: number, data: { displayName: string | null; foundingDate: string | null }) {
  const db = await getDb();
  if (!db) return null;
  const existing = await getUniverseSettings(userId);
  const vals: any = { userId, displayName: data.displayName, foundingDate: data.foundingDate ? new Date(data.foundingDate) : null };
  const updates: any = { displayName: data.displayName, foundingDate: data.foundingDate ? new Date(data.foundingDate) : null };
  if (existing) return db.update(universeSettings).set(updates).where(eq(universeSettings.userId, userId));
  return db.insert(universeSettings).values(vals);
}

// Seed data
const SEED_PLUGINS = [
  { name: "Claude", category: "model", version: "4.0" },
  { name: "GPT-5", category: "model", version: "5.0" },
  { name: "Gemini", category: "model", version: "2.5" },
  { name: "DeepSeek", category: "model", version: "3.0" },
  { name: "Qwen", category: "model", version: "3.0" },
  { name: "Llama", category: "model", version: "4.0" },
  { name: "Mistral", category: "model", version: "3.0" },
  { name: "Local LLM", category: "model", version: "1.0" },
  { name: "GitHub", category: "infra" },
  { name: "Docker", category: "infra" },
  { name: "PostgreSQL", category: "infra" },
  { name: "Redis", category: "infra" },
  { name: "Telegram", category: "infra" },
  { name: "SMTP", category: "infra" },
  { name: "Webhook", category: "infra" },
  { name: "IoT Hub", category: "device" },
  { name: "Raspberry Pi", category: "device" },
  { name: "Camera System", category: "device" },
];
const SEED_MODELS = SEED_PLUGINS.filter(p => p.category === "model").map(p => ({ name: p.name }));
const SEED_AGENTS = [
  { name: "Sincronia" }, { name: "Pesquisa" }, { name: "Memória" },
  { name: "Código" }, { name: "Planejamento" }, { name: "Crítica" },
  { name: "Síntese" }, { name: "Execução" }, { name: "Comunicação" },
];

export async function seedPlugins(userId: number) {
  const db = await getDb();
  if (!db) return;
  for (const p of SEED_PLUGINS) {
    const existing = await db.select().from(plugins).where(and(eq(plugins.userId, userId), eq(plugins.name, p.name))).limit(1);
    if (existing.length === 0) {
      await db.insert(plugins).values({ userId, name: p.name, category: p.category as any, version: p.version, connected: false });
    }
  }
}
export async function seedModels(userId: number) {
  const db = await getDb();
  if (!db) return;
  for (const m of SEED_MODELS) {
    const existing = await db.select().from(models).where(and(eq(models.userId, userId), eq(models.name, m.name))).limit(1);
    if (existing.length === 0) {
      await db.insert(models).values({ userId, name: m.name, connected: false });
    }
  }
}
const AGENT_SPECIALIZATIONS: Record<string, string> = {
  Sincronia: "Orquestração",
  Pesquisa: "Busca",
  Memória: "Armazenamento",
  Código: "Programação",
  Planejamento: "Estratégia",
  Crítica: "Validação",
  Síntese: "Consolidação",
  Execução: "Implementação",
  Comunicação: "Interface",
};
const AGENT_HUES: Record<string, string> = {
  Sincronia: "#7cf3ff",
  Pesquisa: "#c9b8ff",
  Memória: "#3fe7b0",
  Código: "#9fd8ff",
  Planejamento: "#ffd479",
  Crítica: "#ff6b6b",
  Síntese: "#aab4d6",
  Execução: "#7cf3ff",
  Comunicação: "#c9b8ff",
};

export async function seedAgents(userId: number) {
  const db = await getDb();
  if (!db) return;
  for (const a of SEED_AGENTS) {
    const existing = await db.select().from(agents).where(and(eq(agents.userId, userId), eq(agents.name, a.name))).limit(1);
    if (existing.length === 0) {
      await db.execute(sql`
        INSERT INTO \`agents\` (\`userId\`, \`name\`, \`specialization\`, \`status\`, \`hue\`)
        VALUES (${userId}, ${a.name}, ${AGENT_SPECIALIZATIONS[a.name] || ''}, 'online', ${AGENT_HUES[a.name] || '#7cf3ff'})
      `);
    }
  }
}

// Plugins
export async function getPlugins(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(plugins).where(eq(plugins.userId, userId));
}
export async function upsertPlugin(userId: number, data: { name: string; category: "model" | "infra" | "device"; version?: string; permissions?: string }) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(plugins).where(and(eq(plugins.userId, userId), eq(plugins.name, data.name))).limit(1);
  if (existing.length > 0) return db.update(plugins).set({ version: data.version, permissions: data.permissions }).where(and(eq(plugins.userId, userId), eq(plugins.name, data.name)));
  return db.insert(plugins).values({ userId, ...data, connected: false });
}
export async function updatePluginConnection(userId: number, name: string, connected: boolean) {
  const db = await getDb();
  if (!db) return;
  return db.update(plugins).set({ connected }).where(and(eq(plugins.userId, userId), eq(plugins.name, name)));
}

// Models
export async function getModels(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(models).where(eq(models.userId, userId));
}
export async function updateModelConnection(userId: number, name: string, connected: boolean) {
  const db = await getDb();
  if (!db) return;
  return db.update(models).set({ connected }).where(and(eq(models.userId, userId), eq(models.name, name)));
}

// Agents
export async function getAgents(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(agents).where(eq(agents.userId, userId));
}
export async function updateAgentModel(userId: number, agentName: string, modelName: string) {
  const db = await getDb();
  if (!db) return;
  await db.execute(sql`
    UPDATE \`agents\` SET \`currentModel\` = ${modelName}
    WHERE \`userId\` = ${userId} AND \`name\` = ${agentName}
  `);
}

// Projects
export async function getProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projects).where(eq(projects.userId, userId)).orderBy(desc(projects.createdAt));
}
export async function createProject(userId: number, data: { name: string; description?: string }) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(projects).values({ userId, ...data });
  return result;
}
export async function updateProject(userId: number, projectId: number, data: { name?: string; description?: string; status?: string }) {
  const db = await getDb();
  if (!db) return null;
  const setObj: Record<string, unknown> = {};
  if (data.name !== undefined) setObj.name = data.name;
  if (data.description !== undefined) setObj.description = data.description;
  if (data.status !== undefined) setObj.status = data.status;
  return db.update(projects).set(setObj).where(and(eq(projects.userId, userId), eq(projects.id, projectId)));
}
export async function deleteProject(userId: number, projectId: number) {
  const db = await getDb();
  if (!db) return null;
  return db.delete(projects).where(and(eq(projects.userId, userId), eq(projects.id, projectId)));
}

// Missions
export async function getMissions(userId: number, projectId?: number) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(missions.userId, userId)];
  if (projectId) conditions.push(eq(missions.projectId, projectId));
  return db.select().from(missions).where(and(...conditions)).orderBy(desc(missions.createdAt)).limit(50);
}
export async function getMissionById(userId: number, missionId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(missions).where(and(eq(missions.userId, userId), eq(missions.id, missionId))).limit(1);
  return result.length > 0 ? result[0] : null;
}
export async function createMission(userId: number, data: { input: string; projectId?: number }) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(missions).values({ userId, ...data, status: 'pending' });
  return result;
}
export async function updateMission(userId: number, missionId: number, data: { status?: string; result?: string; resultType?: string; confidence?: number; startedAt?: Date; completedAt?: Date }) {
  const db = await getDb();
  if (!db) return null;
  const setObj: Record<string, unknown> = {};
  if (data.status !== undefined) setObj.status = data.status;
  if (data.result !== undefined) setObj.result = data.result;
  if (data.resultType !== undefined) setObj.resultType = data.resultType;
  if (data.confidence !== undefined) setObj.confidence = data.confidence.toString();
  if (data.startedAt !== undefined) setObj.startedAt = data.startedAt;
  if (data.completedAt !== undefined) setObj.completedAt = data.completedAt;
  return db.update(missions).set(setObj).where(and(eq(missions.userId, userId), eq(missions.id, missionId)));
}

// Memory
export async function getMemoryByTier(userId: number, tier: string) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(memory).where(and(eq(memory.userId, userId), eq(memory.tier, tier as any))).orderBy(desc(memory.createdAt));
}
export async function getAllMemory(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(memory).where(eq(memory.userId, userId)).orderBy(desc(memory.createdAt));
}
export async function addMemory(userId: number, data: { content: string; tier?: string; confidence?: number; origin?: string; tags?: string[] }) {
  const db = await getDb();
  if (!db) return null;
  const tier = data.tier || 'ativa';
  const confidence = data.confidence !== undefined ? data.confidence.toString() : null;
  const origin = data.origin || null;
  const tags = data.tags ? JSON.stringify(data.tags) : null;
  await db.execute(sql`
    INSERT INTO \`memory\` (\`userId\`, \`content\`, \`tier\`, \`confidence\`, \`origin\`, \`tags\`, \`embedding\`)
    VALUES (${userId}, ${data.content}, ${tier}, ${confidence}, ${origin}, ${tags}, ${null})
  `);
  return { success: true };
}
export async function reprioritizeMemory(userId: number, memoryId: number, newTier: string) {
  const db = await getDb();
  if (!db) return null;
  const updateSet: Record<string, unknown> = { tier: newTier as any };
  if (newTier === 'arquivada') updateSet.archivedAt = new Date();
  else if (newTier === 'relevante' || newTier === 'historica') updateSet.promotedAt = new Date();
  return db.update(memory).set(updateSet).where(and(eq(memory.userId, userId), eq(memory.id, memoryId)));
}
export async function deleteMemory(userId: number, memoryId: number) {
  const db = await getDb();
  if (!db) return null;
  return db.delete(memory).where(and(eq(memory.userId, userId), eq(memory.id, memoryId)));
}

// GitHub Tool Validation
export async function addValidatedTool(userId: number, data: { name: string; category: "model" | "infra" | "device"; version?: string; description?: string; stars?: number; url?: string; validated: boolean }) {
  const db = await getDb();
  if (!db) return null;
  // Check if already exists
  const existing = await db.select().from(plugins).where(and(eq(plugins.userId, userId), eq(plugins.name, data.name))).limit(1);
  if (existing.length > 0) return existing[0];
  const result = await db.insert(plugins).values({
    userId,
    name: data.name,
    category: data.category,
    version: data.version || "1.0",
    connected: false,
  });
  return result;
}

// Cognitive Feed
export async function getFeedEvents(userId: number, limit: number = 50) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(cognitiveFeed).where(eq(cognitiveFeed.userId, userId)).orderBy(desc(cognitiveFeed.createdAt)).limit(limit);
}
export async function addFeedEvent(userId: number, data: { eventType: string; message: string; confidence?: number; agentName?: string; missionId?: number }) {
  const db = await getDb();
  if (!db) return null;
  const vals: any = { userId, eventType: data.eventType, message: data.message };
  if (data.confidence !== undefined) vals.confidence = data.confidence.toString();
  if (data.agentName) vals.agentName = data.agentName;
  if (data.missionId) vals.missionId = data.missionId;
  return db.insert(cognitiveFeed).values(vals);
}
