import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, boolean, datetime, customType, json, date, uniqueIndex, index } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// Plugins
export const plugins = mysqlTable("plugins", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  category: mysqlEnum("category", ["model", "infra", "device"]).notNull(),
  connected: boolean("connected").default(false).notNull(),
  version: varchar("version", { length: 32 }),
  permissions: text("permissions"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// AI Models
export const models = mysqlTable("models", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  connected: boolean("connected").default(false).notNull(),
  competencyScore: int("competencyScore").default(0),
  tasksAssigned: int("tasksAssigned").default(0),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Agents
export const agents = mysqlTable("agents", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 64 }).notNull(),
  specialization: varchar("specialization", { length: 32 }).default("").notNull(),
  status: varchar("status", { length: 32 }).default("offline").notNull(),
  currentModel: varchar("currentModel", { length: 64 }),
  hue: varchar("hue", { length: 16 }),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Projects
export const projects = mysqlTable("projects", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  name: varchar("name", { length: 256 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["active", "paused", "completed"]).default("active").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Missions
export const missions = mysqlTable("missions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  projectId: int("projectId"),
  input: text("input").notNull(),
  status: mysqlEnum("status", ["pending", "executing", "completed", "failed"]).default("pending").notNull(),
  result: text("result"),
  resultType: varchar("resultType", { length: 32 }),
  confidence: varchar("confidence", { length: 10 }),
  startedAt: datetime("startedAt"),
  completedAt: datetime("completedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  scheduleCronTaskUid: varchar("scheduleCronTaskUid", { length: 65 }),
  isScheduled: boolean("isScheduled").default(false).notNull(),
});

// Memory
export const memory = mysqlTable("memory", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  tier: mysqlEnum("tier", ["ativa", "relevante", "historica", "arquivada"]).default("ativa").notNull(),
  confidence: varchar("confidence", { length: 10 }),
  origin: varchar("origin", { length: 64 }),
  tags: varchar("tags", { length: 512 }),
  accessedAt: datetime("accessedAt"),
  promotedAt: datetime("promotedAt"),
  archivedAt: datetime("archivedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Cognitive Feed
export const cognitiveFeed = mysqlTable("cognitiveFeed", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  eventType: varchar("eventType", { length: 64 }).notNull(),
  message: text("message").notNull(),
  confidence: varchar("confidence", { length: 10 }),
  agentName: varchar("agentName", { length: 64 }),
  missionId: int("missionId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Universe Settings
export const universeSettings = mysqlTable("universeSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  displayName: varchar("displayName", { length: 256 }),
  foundingDate: datetime("foundingDate"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Project Collaboration - sharing between users
export const projectShares = mysqlTable("projectShares", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  sharedUserId: int("sharedUserId").notNull(),
  sharedByUserId: int("sharedByUserId").notNull(),
  permission: mysqlEnum("permission", ["view", "edit", "admin"]).default("view").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type ProjectShare = typeof projectShares.$inferSelect;
export type InsertProjectShare = typeof projectShares.$inferInsert;

// Marketplace - community-shared plugins
export const marketplacePlugins = mysqlTable("marketplacePlugins", {
  id: int("id").autoincrement().primaryKey(),
  authorId: int("authorId").notNull(),
  name: varchar("name", { length: 128 }).notNull(),
  category: mysqlEnum("category", ["model", "infra", "device", "utility"]).notNull(),
  description: text("description").notNull(),
  githubUrl: varchar("githubUrl", { length: 512 }),
  sourceCode: text("sourceCode"),
  downloads: int("downloads").default(0).notNull(),
  upvotes: int("upvotes").default(0).notNull(),
  version: varchar("version", { length: 32 }).default("1.0.0"),
  isApproved: boolean("isApproved").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketplacePlugin = typeof marketplacePlugins.$inferSelect;
export type InsertMarketplacePlugin = typeof marketplacePlugins.$inferInsert;

// Marketplace Reviews - community ratings and comments
export const marketplaceReviews = mysqlTable("marketplaceReviews", {
  id: int("id").autoincrement().primaryKey(),
  pluginId: int("pluginId").notNull(),
  userId: int("userId").notNull(),
  rating: int("rating").notNull(), // 1-5
  comment: text("comment"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketplaceReview = typeof marketplaceReviews.$inferSelect;
export type InsertMarketplaceReview = typeof marketplaceReviews.$inferInsert;

// Marketplace installs - tracks which user installed which plugin (dedupe + per-user list)
export const marketplaceInstalls = mysqlTable("marketplaceInstalls", {
  id: int("id").autoincrement().primaryKey(),
  pluginId: int("pluginId").notNull(),
  userId: int("userId").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MarketplaceInstall = typeof marketplaceInstalls.$inferSelect;
export type InsertMarketplaceInstall = typeof marketplaceInstalls.$inferInsert;

// User Profiles - bio, avatar, preferences
export const userProfiles = mysqlTable("userProfiles", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  bio: text("bio"),
  avatar: text("avatar"),
  preferences: text("preferences"), // JSON: theme accents, notifications
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().notNull(),
});

export type UserProfile = typeof userProfiles.$inferSelect;
export type InsertUserProfile = typeof userProfiles.$inferInsert;

// Mission Webhooks - trigger external URLs when missions complete
export const missionWebhooks = mysqlTable("missionWebhooks", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  url: text("url").notNull(),
  label: text("label"),
  lastStatus: int("lastStatus"),
  lastTriggeredAt: timestamp("lastTriggeredAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type MissionWebhook = typeof missionWebhooks.$inferSelect;
export type InsertMissionWebhook = typeof missionWebhooks.$inferInsert;

// Community-suggested dynamic categories for the marketplace
export const inAppNotifications = mysqlTable("in_app_notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  type: varchar("type", { length: 64 }).notNull().default("info"),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content"),
  isRead: boolean("is_read").notNull().default(false),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export const userAchievements = mysqlTable("user_achievements", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id").notNull(),
  badgeKey: varchar("badge_key", { length: 64 }).notNull(),
  unlockedAt: timestamp("unlocked_at").defaultNow().notNull(),
  seenAt: timestamp("seen_at"),
});

export const suggestedCategories = mysqlTable("suggestedCategories", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 64 }).notNull(),
  suggestedByUserId: int("suggestedByUserId").notNull(),
  upvotes: int("upvotes").default(0).notNull(),
  isApproved: boolean("isApproved").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Phase 9: Real-time project collaboration — invite/accept shared projects with role and mission visibility
export const projectCollaborations = mysqlTable("projectCollaborations", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  invitedUserId: int("invitedUserId").notNull(),
  invitedByUserId: int("invitedByUserId").notNull(),
  role: mysqlEnum("role", ["member", "contributor"]).default("member").notNull(),
  status: mysqlEnum("status", ["pending", "accepted", "declined", "removed"]).default("pending").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  respondedAt: timestamp("respondedAt"),
});

// Real-time chat/discussion inside a shared project (live via socket)
export const collaborationMessages = mysqlTable("collaborationMessages", {
  id: int("id").autoincrement().primaryKey(),
  projectId: int("projectId").notNull(),
  userId: int("userId").notNull(),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Phase 9: Automated plugin verification — structural/syntax validation with badge
export const pluginVerifications = mysqlTable("pluginVerifications", {
  id: int("id").autoincrement().primaryKey(),
  pluginId: int("pluginId").notNull(),
  status: mysqlEnum("status", ["pending", "verified", "failed"]).default("pending").notNull(),
  checks: text("checks"), // JSON: list of check results {name, passed, note}
  version: varchar("version", { length: 32 }),
  checkedAt: timestamp("checkedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Phase 10: Threaded plugin discussions — nested replies via parentId
export const pluginThreads = mysqlTable("pluginThreads", {
  id: int("id").autoincrement().primaryKey(),
  pluginId: int("pluginId").notNull(),
  authorId: int("authorId").notNull(),
  parentId: int("parentId"),
  content: text("content").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Phase 10: XP events — experience awarded for community contributions
export const xpEvents = mysqlTable("xp_events", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  source: mysqlEnum("source", ["plugin_publish", "review", "mission_complete", "collab_accept"]).notNull(),
  xp: int("xp").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Phase 13 (Manus fusion): agent loop steps — persisted think-act-observe history
export const missionSteps = mysqlTable("missionSteps", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  stepType: varchar("stepType", { length: 32 }).notNull(),
  toolName: varchar("toolName", { length: 64 }),
  agentName: varchar("agentName", { length: 64 }),
  detail: text("detail"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Phase 11: Mission templates — ready-made mission blueprints from the marketplace
export const missionTemplates = mysqlTable("missionTemplates", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description").notNull(),
  suggestedInput: text("suggestedInput").notNull(),
  agents: varchar("agents", { length: 255 }).notNull().default(""),
  category: varchar("category", { length: 64 }).notNull().default("geral"),
  icon: varchar("icon", { length: 32 }).notNull().default("Zap"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

// Phase 14: User LLM settings — provider/model/key chosen per user (open-source flexibility)
export const userLlmSettings = mysqlTable("userLlmSettings", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull().unique(),
  provider: varchar("provider", { length: 32 }).notNull().default("forge"),
  model: varchar("model", { length: 128 }),
  apiKey: varchar("apiKey", { length: 512 }),
  baseUrl: varchar("baseUrl", { length: 512 }),
  // Computer tools permission: which tool groups the user allows for agent missions
  shellEnabled: boolean("shellEnabled").default(false).notNull(),
  webEnabled: boolean("webEnabled").default(true).notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type UserLlmSettings = typeof userLlmSettings.$inferSelect;
export type InsertUserLlmSettings = typeof userLlmSettings.$inferInsert;

// Phase 14b: Super Memória — Obsidian-style notes that the agent and user never lose
export const superNotes = mysqlTable("superNotes", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  content: text("content").notNull(), // unlimited Markdown (like an Obsidian note)
  folder: varchar("folder", { length: 128 }).notNull().default("Geral"),
  tags: varchar("tags", { length: 512 }),
  links: varchar("links", { length: 512 }), // JSON: [[wiki-links]] to other notes
  source: mysqlEnum("source", ["user", "agent"]).default("user").notNull(),
  missionId: int("missionId"),
  // Phase 15: semantic embedding (1024 dims × 4 bytes = 4KB) for vector search + RAG
  embedding: customType<{ data: Buffer | null }>({
    dataType: () => "MEDIUMBLOB",
  })("embedding"),
  embeddingModel: varchar("embeddingModel", { length: 64 }),
  embeddingUpdatedAt: timestamp("embeddingUpdatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type SuperNote = typeof superNotes.$inferSelect;
export type InsertSuperNote = typeof superNotes.$inferInsert;

// Fase 20: histórico de disparos de webhooks — monitoramento por missão/webhook
export const webhookEvents = mysqlTable("webhookEvents", {
  id: int("id").autoincrement().primaryKey(),
  missionId: int("missionId").notNull(),
  webhookId: int("webhookId").notNull(),
  // sucesso / falha / timeout / teste (testFire)
  result: mysqlEnum("result", ["sucesso", "falha", "timeout", "teste"]).default("falha").notNull(),
  httpStatus: int("httpStatus").default(0),
  elapsedMs: int("elapsedMs").default(0),
  // Fase 21: número de tentativas realizadas (1 tentativa + retries com backoff)
  attempts: int("attempts").default(1),
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type WebhookEvent = typeof webhookEvents.$inferSelect;
export type InsertWebhookEvent = typeof webhookEvents.$inferInsert;

// Fase 22: resultados oficiais das loterias da Caixa
export const lotteryDraws = mysqlTable("lotteryDraws", {
  id: int("id").autoincrement().primaryKey(),
  // megasena / quina / lotofacil / lotomania / timemania
  lotteryType: varchar("lotteryType", { length: 16 }).notNull(),
  // número do concurso (ex.: 3044)
  drawNumber: int("drawNumber").notNull(),
  drawDate: varchar("drawDate", { length: 10 }),
  // dezenas sorteadas (JSON: [4, 15, 17, 40, 55, 58])
  numbers: json("numbers").notNull(),
  accumulatedPrize: varchar("accumulatedPrize", { length: 20 }).default("0"),
  estimatedNextPrize: varchar("estimatedNextPrize", { length: 20 }).default("0"),
  winners: json("winners"),
  collectedAt: timestamp("collectedAt").defaultNow().notNull(),
}, (t) => ({
  // dedup: uma linha por (loteria, concurso)
  uniqDraw: uniqueIndex("uniq_draw").on(t.lotteryType, t.drawNumber),
  idxType: index("idx_type").on(t.lotteryType),
  idxDrawNumber: index("idx_draw_number").on(t.drawNumber),
}));
export type LotteryDraw = typeof lotteryDraws.$inferSelect;
export type InsertLotteryDraw = typeof lotteryDraws.$inferInsert;
