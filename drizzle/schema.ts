import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, float, boolean, datetime } from "drizzle-orm/mysql-core";

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
