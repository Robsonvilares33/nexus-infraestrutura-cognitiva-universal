import { and, asc, desc, eq, sql, inArray } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  users, plugins, models, agents, projects, missions, memory, cognitiveFeed, universeSettings,
  projectShares, marketplacePlugins, marketplaceReviews, marketplaceInstalls,
  suggestedCategories,
  userProfiles, missionWebhooks, inAppNotifications, userAchievements,
  projectCollaborations, collaborationMessages, pluginVerifications,
  type InsertUser, type InsertProjectShare
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
  const result = await db.insert(cognitiveFeed).values(vals);

  // Broadcast to WebSocket for real-time updates
  try {
    const { getIO } = await import("./socket");
    const io = getIO();
    if (io) {
      io.to(`user:${userId}`).emit("cognitive:feed", {
        eventType: data.eventType,
        message: data.message,
        timestamp: Date.now(),
        confidence: data.confidence,
        agentName: data.agentName,
        missionId: data.missionId,
      });
    }
  } catch {
    // Socket not available, that's fine
  }

  return result;
}

// --- Collaboration ---
export async function shareProject(userId: number, projectId: number, sharedUserId: number, permission: "view" | "edit" | "admin" = "view") {
  const db = await getDb();
  if (!db) return null;
  return db.insert(projectShares).values({ projectId, sharedUserId, sharedByUserId: userId, permission });
}

export async function getSharedProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(projectShares)
    .where(eq(projectShares.sharedUserId, userId));
}

export async function getProjectShares(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select()
    .from(projectShares)
    .where(eq(projectShares.projectId, projectId));
}

export async function removeProjectShare(shareId: number) {
  const db = await getDb();
  if (!db) return null;
  return db.delete(projectShares).where(eq(projectShares.id, shareId));
}

export async function getUsersByIds(ids: number[]) {
  const db = await getDb();
  if (!db || ids.length === 0) return [];
  return db.select()
    .from(users)
    .where(sql`id IN (${sql.join(ids, sql`, `)})`);
}

// Scheduled Missions
export async function getScheduledMissions(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(missions)
    .where(and(eq(missions.userId, userId), eq(missions.isScheduled, true)))
    .orderBy(desc(missions.createdAt));
}

export async function updateMissionSchedule(userId: number, missionId: number, scheduleCronTaskUid: string | null, isScheduled: boolean) {
  const db = await getDb();
  if (!db) return null;
  return db.update(missions)
    .set({ scheduleCronTaskUid, isScheduled })
    .where(and(eq(missions.userId, userId), eq(missions.id, missionId)));
}

export async function getMissionByCronTaskUid(taskUid: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select()
    .from(missions)
    .where(eq(missions.scheduleCronTaskUid, taskUid))
    .limit(1);
  return result.length > 0 ? result[0] : null;
}

// Marketplace
export async function listMarketplacePlugins(query?: string, category?: string) {
  const db = await getDb();
  if (!db) return [];
  const conditions = [eq(marketplacePlugins.isApproved, true)];
  if (query && query.trim()) {
    const q = `%${query.trim()}%`;
    conditions.push(sql`(name LIKE ${q} OR description LIKE ${q})`);
  }
  if (category && category !== "all") {
    conditions.push(eq(marketplacePlugins.category, category as any));
  }
  return db.select().from(marketplacePlugins)
    .where(and(...conditions))
    .orderBy(desc(marketplacePlugins.upvotes), desc(marketplacePlugins.createdAt));
}

export async function getMarketplacePlugin(pluginId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select()
    .from(marketplacePlugins)
    .where(eq(marketplacePlugins.id, pluginId))
    .limit(1);
  if (result.length === 0) return null;
  const { reviews, averageRating, reviewCount } = await getMarketplaceReviews(pluginId);
  return { ...result[0], averageRating, reviewCount };
}

export async function addMarketplacePlugin(userId: number, data: { name: string; category: "model" | "infra" | "device" | "utility"; description: string; githubUrl?: string; sourceCode?: string; version?: string }) {
  const db = await getDb();
  if (!db) return null;
  // Check if plugin with same name already exists from this author
  const existing = await db.select()
    .from(marketplacePlugins)
    .where(and(eq(marketplacePlugins.authorId, userId), eq(marketplacePlugins.name, data.name)))
    .limit(1);
  if (existing.length > 0) {
    throw new Error(`Já existe um plugin com o nome "${data.name}" no seu perfil.`);
  }
  const result = await db.insert(marketplacePlugins).values({
    authorId: userId,
    name: data.name,
    category: data.category,
    description: data.description,
    githubUrl: data.githubUrl || null,
    sourceCode: data.sourceCode || null,
    version: data.version || "1.0.0",
  });
  return result;
}

export async function incrementMarketplaceDownloads(pluginId: number) {
  const db = await getDb();
  if (!db) return null;
  const existing = await getMarketplacePlugin(pluginId);
  if (!existing) return null;
  return db.update(marketplacePlugins)
    .set({ downloads: existing.downloads + 1 })
    .where(eq(marketplacePlugins.id, pluginId));
}

export async function upvoteMarketplacePlugin(pluginId: number) {
  const db = await getDb();
  if (!db) return null;
  const existing = await getMarketplacePlugin(pluginId);
  if (!existing) return null;
  return db.update(marketplacePlugins)
    .set({ upvotes: existing.upvotes + 1 })
    .where(eq(marketplacePlugins.id, pluginId));
}

export async function removeMarketplacePlugin(userId: number, pluginId: number) {
  const db = await getDb();
  if (!db) return null;
  return db.delete(marketplacePlugins)
    .where(and(eq(marketplacePlugins.authorId, userId), eq(marketplacePlugins.id, pluginId)));
}

// Install a marketplace plugin into the user's own plugins table
export async function installMarketplacePlugin(userId: number, pluginId: number) {
  const db = await getDb();
  if (!db) return null;
  const mp = await getMarketplacePlugin(pluginId);
  if (!mp) throw new Error("Plugin não encontrado no marketplace.");
  // Check if already installed
  const existing = await db.select()
    .from(plugins)
    .where(and(eq(plugins.userId, userId), eq(plugins.name, mp.name)))
    .limit(1);
  if (existing.length > 0) {
    return db.update(plugins)
      .set({ connected: true })
      .where(and(eq(plugins.userId, userId), eq(plugins.name, mp.name)));
  }
  return db.insert(plugins).values({
    userId,
    name: mp.name,
    category: mp.category === "utility" ? "infra" : (mp.category as any),
    connected: true,
    version: mp.version || "1.0.0",
  });
}

export async function getMyMarketplacePlugins(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(marketplacePlugins)
    .where(eq(marketplacePlugins.authorId, userId))
    .orderBy(desc(marketplacePlugins.createdAt));
}

// ---------- Marketplace reviews ----------
export async function addMarketplaceReview(userId: number, pluginId: number, rating: number, comment: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const existing = await db.select().from(marketplaceReviews)
    .where(and(eq(marketplaceReviews.userId, userId), eq(marketplaceReviews.pluginId, pluginId)))
    .limit(1);
  if (existing.length > 0) {
    return db.update(marketplaceReviews)
      .set({ rating, comment })
      .where(and(eq(marketplaceReviews.userId, userId), eq(marketplaceReviews.pluginId, pluginId)));
  }
  return db.insert(marketplaceReviews).values({ userId, pluginId, rating, comment });
}

export async function getMarketplaceReviews(pluginId: number) {
  const db = await getDb();
  if (!db) return { reviews: [], averageRating: 0, reviewCount: 0 };
  const reviews = await db.select().from(marketplaceReviews)
    .where(eq(marketplaceReviews.pluginId, pluginId))
    .orderBy(desc(marketplaceReviews.createdAt));
  const averageRating = reviews.length > 0
    ? reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length
    : 0;
  return { reviews, averageRating: Math.round(averageRating * 10) / 10, reviewCount: reviews.length };
}

// Track install per user (dedupe)
export async function ensureMarketplaceInstall(userId: number, pluginId: number) {
  const db = await getDb();
  if (!db) return;
  const existing = await db.select().from(marketplaceInstalls)
    .where(and(eq(marketplaceInstalls.userId, userId), eq(marketplaceInstalls.pluginId, pluginId)))
    .limit(1);
  if (existing.length === 0) {
    await db.insert(marketplaceInstalls).values({ userId, pluginId });
  }
}

// ---------- Admin ----------
export async function listAllUsers() {
  const db = await getDb();
  if (!db) return [];
  return db.select({
    id: users.id,
    name: users.name,
    email: users.email,
    role: users.role,
    createdAt: users.createdAt,
    lastSignedIn: users.lastSignedIn,
  }).from(users).orderBy(desc(users.lastSignedIn));
}

export async function updateUserRole(userId: number, role: "user" | "admin") {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.update(users).set({ role }).where(eq(users.id, userId));
}

export async function setMarketplacePluginApproved(pluginId: number, isApproved: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.update(marketplacePlugins).set({ isApproved }).where(eq(marketplacePlugins.id, pluginId));
}

export async function listAllMarketplacePlugins() {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(marketplacePlugins).orderBy(desc(marketplacePlugins.createdAt));
}

export async function deleteAnyMarketplacePlugin(pluginId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  await db.delete(marketplaceReviews).where(eq(marketplaceReviews.pluginId, pluginId));
  await db.delete(marketplaceInstalls).where(eq(marketplaceInstalls.pluginId, pluginId));
  return db.delete(marketplacePlugins).where(eq(marketplacePlugins.id, pluginId));
}

export async function getPlatformStats() {
  const db = await getDb();
  if (!db) return { users: 0, missions: 0, plugins: 0, marketplacePlugins: 0, memories: 0, pendingPlugins: 0 };
  const run = async (q: any): Promise<any[]> => {
    const result = await db.execute(q);
    return Array.isArray(result) ? (result[0] as unknown as any[]) : [result];
  };
  const [usersCount, missionsCount, pluginsCount, mpCount, memoriesCount, pending] = await Promise.all([
    run(sql`SELECT COUNT(*) as n FROM ${users}`),
    run(sql`SELECT COUNT(*) as n FROM ${missions}`),
    run(sql`SELECT COUNT(*) as n FROM ${plugins}`),
    run(sql`SELECT COUNT(*) as n FROM ${marketplacePlugins}`),
    run(sql`SELECT COUNT(*) as n FROM ${memory}`),
    run(sql`SELECT COUNT(*) as n FROM ${marketplacePlugins} WHERE isApproved = 0`),
  ]);
  return {
    users: (usersCount[0] as any)?.n || 0,
    missions: (missionsCount[0] as any)?.n || 0,
    plugins: (pluginsCount[0] as any)?.n || 0,
    marketplacePlugins: (mpCount[0] as any)?.n || 0,
    memories: (memoriesCount[0] as any)?.n || 0,
    pendingPlugins: (pending[0] as any)?.n || 0,
  };
}

// ---------- User profiles ----------
export async function getUserProfile(userId: number) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : null;
}

export async function upsertUserProfile(userId: number, data: { bio?: string; avatar?: string; preferences?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const existing = await db.select().from(userProfiles).where(eq(userProfiles.userId, userId)).limit(1);
  if (existing.length > 0) {
    return db.update(userProfiles)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(userProfiles.userId, userId));
  }
  return db.insert(userProfiles).values({ userId, ...data });
}

// Personal history for profile page
export async function getUserMissionsHistory(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(missions)
    .where(eq(missions.userId, userId))
    .orderBy(desc(missions.createdAt))
    .limit(limit);
}

export async function getUserInstalledPlugins(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(plugins).where(eq(plugins.userId, userId));
}

export async function getUserMarketplaceInstalls(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const installs = await db.select().from(marketplaceInstalls).where(eq(marketplaceInstalls.userId, userId));
  if (installs.length === 0) return [];
  return db.select().from(marketplacePlugins)
    .where(sql`${marketplacePlugins.id} IN (${sql.join(installs.map(i => sql`${i.pluginId}`), sql`, `)})`);
}

export async function getUserReviews(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(marketplaceReviews).where(eq(marketplaceReviews.userId, userId)).orderBy(desc(marketplaceReviews.createdAt));
}

export async function getUserSharedProjects(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(projectShares).where(eq(projectShares.sharedByUserId, userId)).orderBy(desc(projectShares.createdAt));
}

// ---------- Phase 9: Project collaboration (real-time shared missions) ----------
export async function getCollaborators(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  const collabs = await db.select().from(projectCollaborations).where(eq(projectCollaborations.projectId, projectId));
  const userRows = await Promise.all(collabs.map(c => getUserById(c.invitedUserId)));
  return collabs.map((c, i) => ({ ...c, collaboratorName: userRows[i]?.name ?? null, collaboratorEmail: userRows[i]?.email ?? null }));
}

export async function inviteCollaborator(invitedByUserId: number, projectId: number, invitedUserId: number, role: "member" | "contributor" = "member") {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0 || project[0].userId !== invitedByUserId) throw new Error("Projeto não encontrado ou não pertence a você");
  if (invitedUserId === invitedByUserId) throw new Error("Você não pode convidar a si mesmo");
  const existing = await db.select().from(projectCollaborations)
    .where(and(eq(projectCollaborations.projectId, projectId), eq(projectCollaborations.invitedUserId, invitedUserId)))
    .limit(1);
  if (existing.length > 0 && existing[0].status !== "declined" && existing[0].status !== "removed") {
    throw new Error("Convite já existe para este usuário");
  }
  if (existing.length > 0) {
    return db.update(projectCollaborations)
      .set({ status: "pending", role, invitedByUserId, createdAt: new Date(), respondedAt: null })
      .where(eq(projectCollaborations.id, existing[0].id));
  }
  return db.insert(projectCollaborations).values({ projectId, invitedUserId, invitedByUserId, role, status: "pending" });
}

export async function respondToInvite(userId: number, collabId: number, accept: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const collab = await db.select().from(projectCollaborations).where(eq(projectCollaborations.id, collabId)).limit(1);
  if (collab.length === 0) throw new Error("Convite não encontrado");
  if (collab[0].invitedUserId !== userId) throw new Error("Convite não pertence a você");
  await db.update(projectCollaborations)
    .set({ status: accept ? "accepted" : "declined", respondedAt: new Date() })
    .where(eq(projectCollaborations.id, collabId));
  if (accept) {
    const project = await db.select().from(projects).where(eq(projects.id, collab[0].projectId)).limit(1);
    if (project[0]) {
      await addInAppNotification(project[0].userId, "collab", "Convite aceito", `Um colaborador aceitou participar do seu projeto: ${project[0].name}`);
    }
  }
  return { accepted: accept };
}

export async function listPendingInvites(userId: number) {
  const db = await getDb();
  if (!db) return [];
  const collabs = await db.select().from(projectCollaborations)
    .where(and(eq(projectCollaborations.invitedUserId, userId), eq(projectCollaborations.status, "pending")))
    .orderBy(desc(projectCollaborations.createdAt));
  const out = [];
  for (const c of collabs) {
    const project = await db.select().from(projects).where(eq(projects.id, c.projectId)).limit(1);
    const inviter = await getUserById(c.invitedByUserId);
    out.push({ ...c, projectName: project[0]?.name ?? null, inviterName: inviter?.name ?? null });
  }
  return out;
}

export async function listProjectCollaborations(projectId: number) {
  const db = await getDb();
  if (!db) return [];
  const collabs = await db.select().from(projectCollaborations).where(eq(projectCollaborations.projectId, projectId));
  const out = [];
  for (const c of collabs) {
    const user = await getUserById(c.invitedUserId);
    out.push({ ...c, collaboratorName: user?.name ?? null, collaboratorEmail: user?.email ?? null });
  }
  return out;
}

export async function getCollaborationMessageHistory(projectId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db.select().from(collaborationMessages)
    .where(eq(collaborationMessages.projectId, projectId))
    .orderBy(asc(collaborationMessages.createdAt))
    .limit(limit);
  const out = [];
  for (const m of rows) {
    const user = await getUserById(m.userId);
    out.push({ ...m, userName: user?.name ?? null });
  }
  return out;
}

export async function addCollaborationMessage(projectId: number, userId: number, content: string) {
  const db = await getDb();
  if (!db) return null;
  const result = await db.insert(collaborationMessages).values({ projectId, userId, content });
  const row = await db.select().from(collaborationMessages).where(eq(collaborationMessages.projectId, projectId)).orderBy(desc(collaborationMessages.id)).limit(1);
  const user = await getUserById(userId);
  return row.length > 0 ? { ...row[0], userName: user?.name ?? null } : null;
}

export async function removeCollaborator(userId: number, projectId: number, targetUserId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const project = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  if (project.length === 0 || project[0].userId !== userId) throw new Error("Projeto não encontrado ou não pertence a você");
  return db.delete(projectCollaborations)
    .where(and(eq(projectCollaborations.projectId, projectId), eq(projectCollaborations.invitedUserId, targetUserId)));
}

// ---------- Phase 9: Automated plugin verification ----------
export type VerificationCheck = { name: string; passed: boolean; note?: string };

export function verifyPluginSource(sourceCode: string, meta: { name: string; version?: string; category: string }): { status: "verified" | "failed"; checks: VerificationCheck[] } {
  const checks: VerificationCheck[] = [];
  // 1. Non-empty source
  const hasSource = (sourceCode || "").trim().length > 0;
  checks.push({ name: "Código fonte presente", passed: hasSource, note: hasSource ? undefined : "O plugin foi publicado sem código fonte" });
  // 2. No hard-coded secret patterns
  const hasSecret = /((ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36,}|(re_[A-Za-z0-9_]{24,})|sk-[A-Za-z0-9]{20,}|AIza[A-Za-z0-9_\-]{30,})/.test(sourceCode || "");
  checks.push({ name: "Sem credenciais expostas", passed: !hasSecret, note: hasSecret ? "Credencial detectada no código — remova antes de publicar" : undefined });
  // 3. Balanced braces (basic syntax sanity)
  const braces = (sourceCode || "").split("").reduce((acc, ch) => {
    if (ch === "{") acc.open++;
    if (ch === "}") acc.close++;
    if (ch === "(") acc.parenOpen++;
    if (ch === ")") acc.parenClose++;
    return acc;
  }, { open: 0, close: 0, parenOpen: 0, parenClose: 0 });
  const balanced = braces.open === braces.close && braces.parenOpen === braces.parenClose;
  checks.push({ name: "Sintaxe estrutural", passed: balanced, note: balanced ? undefined : "Chaves ou parênteses desbalanceados" });
  // 4. Export signature (plugin exposes a name/handler)
  const hasExport = /(export\s+(default|const|function|class)\s|module\.exports)/i.test(sourceCode || "");
  checks.push({ name: "Exportação detectada", passed: hasExport, note: hasExport ? undefined : "Nenhum export ou module.exports encontrado" });
  // 5. Reasonable size (< 200KB source)
  const sizeOk = (sourceCode || "").length < 200 * 1024;
  checks.push({ name: "Tamanho adequado", passed: sizeOk, note: sizeOk ? undefined : "Código fonte excede 200KB" });
  const status = checks.every(c => c.passed) ? "verified" : "failed";
  return { status, checks };
}

export async function createPluginVerification(pluginId: number, sourceCode: string, meta: { name: string; version?: string; category: string }) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const { status, checks } = verifyPluginSource(sourceCode, meta);
  await db.delete(pluginVerifications).where(eq(pluginVerifications.pluginId, pluginId));
  await db.insert(pluginVerifications).values({
    pluginId,
    status,
    checks: JSON.stringify(checks),
    version: meta.version,
    checkedAt: new Date(),
  });
  return { status, checks };
}

export async function getLatestPluginVerification(pluginId: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(pluginVerifications)
    .where(eq(pluginVerifications.pluginId, pluginId))
    .orderBy(desc(pluginVerifications.createdAt))
    .limit(1);
  return rows.length > 0 ? rows[0] : null;
}

// ---------- Mission webhooks ----------
export async function addMissionWebhook(missionId: number, userId: number, url: string, label?: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  // Ownership check
  const m = await db.select().from(missions).where(eq(missions.id, missionId)).limit(1);
  if (m.length === 0 || m[0].userId !== userId) throw new Error("Missão não encontrada ou não pertence a você");
  return db.insert(missionWebhooks).values({ missionId, url, label });
}

export async function listMissionWebhooks(missionId: number, userId: number) {
  const db = await getDb();
  if (!db) return [];
  const m = await db.select().from(missions).where(eq(missions.id, missionId)).limit(1);
  if (m.length === 0 || m[0].userId !== userId) return [];
  return db.select().from(missionWebhooks).where(eq(missionWebhooks.missionId, missionId));
}

export async function removeMissionWebhook(webhookId: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  const hooks = await db.select().from(missionWebhooks).where(eq(missionWebhooks.id, webhookId)).limit(1);
  if (hooks.length === 0) return;
  const m = await db.select().from(missions).where(eq(missions.id, hooks[0].missionId)).limit(1);
  if (!m[0] || m[0].userId !== userId) throw new Error("Webhook não pertence a você");
  return db.delete(missionWebhooks).where(eq(missionWebhooks.id, webhookId));
}

export async function fireMissionWebhooks(missionId: number, payload: Record<string, unknown>) {
  const db = await getDb();
  if (!db) return;
  const hooks = await db.select().from(missionWebhooks).where(eq(missionWebhooks.missionId, missionId));
  for (const hook of hooks) {
    try {
      const res = await fetch(hook.url, {
        method: "POST",
        headers: { "Content-Type": "application/json", "User-Agent": "NEXUS-MissionWebhook/1.0" },
        body: JSON.stringify({ missionId, event: "mission.completed", payload, timestamp: new Date().toISOString() }),
        signal: AbortSignal.timeout(10000),
      });
      await db.update(missionWebhooks)
        .set({ lastStatus: res.status, lastTriggeredAt: new Date() })
        .where(eq(missionWebhooks.id, hook.id));
    } catch {
      await db.update(missionWebhooks)
        .set({ lastStatus: 0, lastTriggeredAt: new Date() })
        .where(eq(missionWebhooks.id, hook.id));
    }
  }
}

// Semantic-ish search: match plugins whose name/description/tags contain any of the given terms
export async function searchMarketplacePluginsByTerms(terms: string[], limit = 20) {
  const db = await getDb();
  if (!db) return [];
  if (terms.length === 0) return [];
  const conditions = terms.map(t => {
    const term = `%${t.toLowerCase()}%`;
    return sql`(${marketplacePlugins.name} LIKE ${term} OR ${marketplacePlugins.description} LIKE ${term})`;
  });
  return db.select()
    .from(marketplacePlugins)
    .where(sql`(${sql.join(conditions, sql` OR `)}) AND ${marketplacePlugins.isApproved} = 1`)
    .orderBy(desc(marketplacePlugins.downloads), desc(marketplacePlugins.upvotes))
    .limit(limit);
}

// ---------- Community-suggested categories ----------
export const BASE_CATEGORIES = ["model", "infra", "device", "utility"] as const;

export async function addSuggestedCategory(userId: number, name: string) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  // Dedupe: same name (case-insensitive) pending or approved
  const existing = await db.select().from(suggestedCategories)
    .where(sql`LOWER(${suggestedCategories.name}) = ${name.toLowerCase()}`)
    .limit(1);
  if (existing.length > 0) throw new Error("Categoria já sugerida ou existente");
  return db.insert(suggestedCategories).values({ name, suggestedByUserId: userId });
}

export async function voteSuggestedCategory(categoryId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.update(suggestedCategories)
    .set({ upvotes: sql`${suggestedCategories.upvotes} + 1` })
    .where(eq(suggestedCategories.id, categoryId));
}

export async function listSuggestedCategories(approvedOnly = false) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(suggestedCategories)
    .where(approvedOnly ? eq(suggestedCategories.isApproved, true) : undefined)
    .orderBy(desc(suggestedCategories.isApproved), desc(suggestedCategories.upvotes));
}

export async function approveSuggestedCategory(categoryId: number, isApproved: boolean) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.update(suggestedCategories).set({ isApproved }).where(eq(suggestedCategories.id, categoryId));
}

export async function deleteSuggestedCategory(categoryId: number) {
  const db = await getDb();
  if (!db) throw new Error("Banco de dados indisponível");
  return db.delete(suggestedCategories).where(eq(suggestedCategories.id, categoryId));
}

// ---------- Growth dashboard (weekly evolution) ----------
export async function getWeeklyGrowthStats(weeks = 8) {
  const db = await getDb();
  if (!db) return { weeks: [] as { week: string; newUsers: number; newMissions: number; newPlugins: number }[] };
  const run = async (q: any): Promise<any[]> => {
    const result = await db.execute(q);
    return Array.isArray(result) ? (result[0] as unknown as any[]) : [result];
  };
  // MySQL 8+: generate past N week labels
  const weekRows = await run(sql`
    SELECT DATE_FORMAT(DATE_SUB(DATE(NOW()), INTERVAL seq WEEK), '%Y-%m-%d') AS weekStart
    FROM (SELECT 0 AS seq UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION SELECT 10 UNION SELECT 11) t
    WHERE seq < ${weeks}
    ORDER BY weekStart
  `);
  const weeksList = (weekRows as any[]).map((r: any) => r.weekStart);
  if (weeksList.length === 0) return { weeks: [] };
  const firstWeek = weeksList[0];
  const stats = await Promise.all([
    run(sql`SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS d, COUNT(*) AS n FROM ${users} WHERE createdAt >= ${firstWeek} GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d')`),
    run(sql`SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS d, COUNT(*) AS n FROM ${missions} WHERE createdAt >= ${firstWeek} GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d')`),
    run(sql`SELECT DATE_FORMAT(createdAt, '%Y-%m-%d') AS d, COUNT(*) AS n FROM ${marketplacePlugins} WHERE createdAt >= ${firstWeek} GROUP BY DATE_FORMAT(createdAt, '%Y-%m-%d')`),
  ]);
  const byDay = (rows: any[]) => {
    const map = new Map<string, number>();
    (rows as any[]).forEach(r => map.set(String(r.d), Number(r.n) || 0));
    return map;
  };
  const userMap = byDay(stats[0]);
  const missionMap = byDay(stats[1]);
  const pluginMap = byDay(stats[2]);

  // Bucket days into weeks aligned with weeksList
  const out = weeksList.map(weekStart => {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const endStr = end.toISOString().slice(0, 10);
    let newUsers = 0, newMissions = 0, newPlugins = 0;
    const cur = new Date(weekStart);
    while (cur <= end) {
      const key = cur.toISOString().slice(0, 10);
      newUsers += userMap.get(key) || 0;
      newMissions += missionMap.get(key) || 0;
      newPlugins += pluginMap.get(key) || 0;
      cur.setDate(cur.getDate() + 1);
    }
    return { week: endStr, newUsers, newMissions, newPlugins };
  });
  return { weeks: out };
}

// Lookup user by id with email (for notification targets)
export async function getUserById(id: number) {
  const db = await getDb();
  if (!db) return null;
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows.length > 0 ? rows[0] : null;
}

// ---------- In-app notifications ----------
export async function addInAppNotification(userId: number, type: string, title: string, content?: string) {
  const db = await getDb();
  if (!db) return;
  await db.insert(inAppNotifications).values({ userId, type, title, content });
}

export async function listUserNotifications(userId: number, limit = 50) {
  const db = await getDb();
  if (!db) return [];
  const rows = await db
    .select()
    .from(inAppNotifications)
    .where(eq(inAppNotifications.userId, userId))
    .orderBy(desc(inAppNotifications.createdAt))
    .limit(limit);
  return rows;
}

export async function markNotificationRead(notificationId: number, userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(inAppNotifications)
    .set({ isRead: true })
    .where(and(eq(inAppNotifications.id, notificationId), eq(inAppNotifications.userId, userId)));
}

export async function markAllNotificationsRead(userId: number) {
  const db = await getDb();
  if (!db) return;
  await db.update(inAppNotifications)
    .set({ isRead: true })
    .where(eq(inAppNotifications.userId, userId));
}

export async function countUnreadNotifications(userId: number) {
  const db = await getDb();
  if (!db) return { count: 0 };
  const rows = await db.select().from(inAppNotifications)
    .where(and(eq(inAppNotifications.userId, userId), eq(inAppNotifications.isRead, false)));
  return { count: rows.length };
}

// ---------- Real email integration (optional, gated by EMAIL_API_KEY; Resend-compatible payload) ----------
export async function sendEmail(to: string, subject: string, body: string): Promise<boolean> {
  const apiKey = process.env.EMAIL_API_KEY;
  const apiUrl = process.env.EMAIL_API_URL || "";
  if (!apiKey || !apiUrl || !to) return false;
  try {
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: "NEXUS <onboarding@resend.dev>",
        to: [to],
        subject,
        html: `<h2>${subject.replace(/</g, "&lt;")}</h2><p>${body.replace(/</g, "&lt;").replace(/\n/g, "<br/>")}</p>`,
      }),
      signal: AbortSignal.timeout(20000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ---------- Achievements ----------
export const ACHIEVEMENTS: Array<{
  key: string;
  name: string;
  description: string;
  icon: string;
}> = [
  { key: "first_mission", name: "Primeira Missão", description: "Conclua sua primeira missão com sucesso.", icon: "rocket" },
  { key: "missions_10", name: "Operador Veternano", description: "Conclua 10 missões no ecossistema.", icon: "target" },
  { key: "missions_50", name: "Mestre das Missões", description: "Conclua 50 missões no ecossistema.", icon: "crown" },
  { key: "first_plugin", name: "Criador de Ferramentas", description: "Publique seu primeiro plugin no marketplace.", icon: "plug" },
  { key: "first_review_received", name: "Reconhecimento", description: "Receba sua primeira avaliação de plugin.", icon: "star" },
  { key: "reviews_5", name: "Autor Popular", description: "Receba avaliações em 5 plugins publicados.", icon: "award" },
  { key: "chat_expert", name: "Conversador Ágil", description: "Envie 50 mensagens ao Chat.", icon: "message-square" },
  { key: "memory_master", name: "Mestre da Memória", description: "Acumule 100 memórias no ecossistema.", icon: "database" },
];

export async function listUserAchievements(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(userAchievements).where(eq(userAchievements.userId, userId)).orderBy(desc(userAchievements.unlockedAt));
}

export async function unlockAchievement(userId: number, badgeKey: string) {
  const db = await getDb();
  if (!db) return false;
  const existing = await db.select().from(userAchievements)
    .where(and(eq(userAchievements.userId, userId), eq(userAchievements.badgeKey, badgeKey)))
    .limit(1);
  if (existing.length > 0) return false;
  await db.insert(userAchievements).values({ userId, badgeKey });
  return true;
}

// Evaluate and unlock achievements related to user activity; returns newly unlocked badge keys.
export async function evaluateAchievements(userId: number): Promise<string[]> {
  const db = await getDb();
  if (!db) return [];
  const unlocked: string[] = [];
  const tryUnlock = async (key: string, condition: () => Promise<boolean>) => {
    if (unlocked.includes(key)) return;
    if (await condition()) {
      if (await unlockAchievement(userId, key)) unlocked.push(key);
    }
  };
  // Missions completed
  const completedMissions = await db.$count(missions, and(eq(missions.userId, userId), eq(missions.status, "completed")));
  await tryUnlock("first_mission", async () => completedMissions >= 1);
  await tryUnlock("missions_10", async () => completedMissions >= 10);
  await tryUnlock("missions_50", async () => completedMissions >= 50);
  // Published plugins with downloads
  const myPlugins = await db.select().from(marketplacePlugins).where(eq(marketplacePlugins.authorId, userId));
  await tryUnlock("first_plugin", async () => myPlugins.length >= 1);
  await tryUnlock("reviews_5", async () => {
    const myIds = myPlugins.map(p => p.id);
    if (myIds.length < 5) return false;
    const reviewedIds = await db.selectDistinct({ id: marketplaceReviews.pluginId }).from(marketplaceReviews).where(inArray(marketplaceReviews.pluginId, myIds));
    return reviewedIds.length >= 5;
  });
  await tryUnlock("first_review_received", async () => {
    if (myPlugins.length === 0) return false;
    const myIds = myPlugins.map(p => p.id);
    const cnt = await db.$count(marketplaceReviews, inArray(marketplaceReviews.pluginId, myIds));
    return cnt >= 1;
  });
  // Memory count
  const memoryCount = await db.$count(memory, eq(memory.userId, userId));
  await tryUnlock("memory_master", async () => memoryCount >= 100);
  return unlocked;
}

// Mark achievements as seen by the user.
export async function markAchievementsSeen(userId: number, badgeKeys: string[]) {
  const db = await getDb();
  if (!db) return 0;
  if (badgeKeys.length === 0) return 0;
  await db
    .update(userAchievements)
    .set({ seenAt: new Date() })
    .where(and(eq(userAchievements.userId, userId), inArray(userAchievements.badgeKey, badgeKeys)));
  return badgeKeys.length;
}
