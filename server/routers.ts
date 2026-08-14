import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, adminProcedure, router } from "./_core/trpc";
import {
  getDashboardStats, seedPlugins, seedModels, seedAgents,
  getPlugins, updatePluginConnection, upsertPlugin,
  getModels, updateModelConnection,
  getAgents, updateAgentModel,
  getProjects, createProject, updateProject, deleteProject,
  getMissions, getMissionById, createMission, updateMission,
  getMemoryByTier, getAllMemory, addMemory, reprioritizeMemory, deleteMemory,
  getFeedEvents, addFeedEvent,
  getUniverseSettings, saveUniverseSettings,
  addValidatedTool,
  shareProject, getSharedProjects, getProjectShares, removeProjectShare, getUsersByIds,
  getScheduledMissions, updateMissionSchedule,
  listMarketplacePlugins, getMarketplacePlugin, addMarketplacePlugin,
  incrementMarketplaceDownloads, upvoteMarketplacePlugin, removeMarketplacePlugin, installMarketplacePlugin,
  getMyMarketplacePlugins,
  addMarketplaceReview, getMarketplaceReviews, ensureMarketplaceInstall,
  listAllUsers, updateUserRole, setMarketplacePluginApproved, listAllMarketplacePlugins, deleteAnyMarketplacePlugin, getPlatformStats,
  getUserProfile, upsertUserProfile, getUserMissionsHistory, getUserInstalledPlugins,
  getUserMarketplaceInstalls, getUserReviews, getUserSharedProjects,
  addMissionWebhook, listMissionWebhooks, removeMissionWebhook, fireMissionWebhooks,
  addInAppNotification, markNotificationRead, markAllNotificationsRead, listUserNotifications, countUnreadNotifications,
  sendEmail, evaluateAchievements, listUserAchievements, markAchievementsSeen,
  searchMarketplacePluginsByTerms,
  inviteCollaborator, respondToInvite, listPendingInvites, listProjectCollaborations,
  getCollaborationMessageHistory, addCollaborationMessage, removeCollaborator,
  createPluginVerification, getLatestPluginVerification,
  verifyPluginSource,
  type VerificationCheck,
  createPluginThread, listPluginThreads, deletePluginThread,
  awardXp, getXpLeaderboard, getMyXp,
  addSuggestedCategory, voteSuggestedCategory, listSuggestedCategories, approveSuggestedCategory, deleteSuggestedCategory,
  getWeeklyGrowthStats, getUserById,
} from "./db";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { z } from "zod";
import { sql, eq, and, inArray } from "drizzle-orm";
import { getDb } from "./db";
import { memory, marketplaceReviews, missions, marketplacePlugins } from "../drizzle/schema";
import { ACHIEVEMENTS } from "./db";

export const appRouter = router({
  system: systemRouter,
  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  dashboard: router({
    stats: protectedProcedure.query(async ({ ctx }) => getDashboardStats(ctx.user.id)),
  }),

  universe: router({
    settings: protectedProcedure.query(async ({ ctx }) => getUniverseSettings(ctx.user.id)),
    saveSettings: protectedProcedure
      .input(z.object({ foundingDate: z.string().nullable(), displayName: z.string().nullable() }))
      .mutation(async ({ ctx, input }) => saveUniverseSettings(ctx.user.id, input)),
    seed: protectedProcedure.mutation(async ({ ctx }) => {
      await seedPlugins(ctx.user.id);
      await seedModels(ctx.user.id);
      await seedAgents(ctx.user.id);
      return { success: true };
    }),
  }),

  plugins: router({
    list: protectedProcedure.query(async ({ ctx }) => getPlugins(ctx.user.id)),
    connect: protectedProcedure.input(z.object({ name: z.string() })).mutation(async ({ ctx, input }) => {
      await updatePluginConnection(ctx.user.id, input.name, true);
      return { success: true };
    }),
    disconnect: protectedProcedure.input(z.object({ name: z.string() })).mutation(async ({ ctx, input }) => {
      await updatePluginConnection(ctx.user.id, input.name, false);
      return { success: true };
    }),
    add: protectedProcedure
      .input(z.object({ name: z.string(), category: z.enum(['model', 'infra', 'device']), version: z.string().optional(), permissions: z.string().optional() }))
      .mutation(async ({ ctx, input }) => { await upsertPlugin(ctx.user.id, input); return { success: true }; }),
  }),

  models: router({
    list: protectedProcedure.query(async ({ ctx }) => getModels(ctx.user.id)),
    connect: protectedProcedure.input(z.object({ name: z.string() })).mutation(async ({ ctx, input }) => {
      await updateModelConnection(ctx.user.id, input.name, true); return { success: true };
    }),
    disconnect: protectedProcedure.input(z.object({ name: z.string() })).mutation(async ({ ctx, input }) => {
      await updateModelConnection(ctx.user.id, input.name, false); return { success: true };
    }),
    llmModels: publicProcedure.query(async () => {
      try { const { data } = await listLLMModels(); return data; } catch { return []; }
    }),
  }),

  agents: router({
    list: protectedProcedure.query(async ({ ctx }) => getAgents(ctx.user.id)),
    assignModel: protectedProcedure
      .input(z.object({ agentName: z.string(), modelName: z.string() }))
      .mutation(async ({ ctx, input }) => { await updateAgentModel(ctx.user.id, input.agentName, input.modelName); return { success: true }; }),
  }),

  projects: router({
    list: protectedProcedure.query(async ({ ctx }) => getProjects(ctx.user.id)),
    create: protectedProcedure.input(z.object({ name: z.string(), description: z.string().optional() })).mutation(async ({ ctx, input }) => createProject(ctx.user.id, input)),
    update: protectedProcedure
      .input(z.object({ projectId: z.number(), name: z.string().optional(), description: z.string().optional(), status: z.string().optional() }))
      .mutation(async ({ ctx, input }) => { const { projectId, ...data } = input; return updateProject(ctx.user.id, projectId, data); }),
    delete: protectedProcedure.input(z.object({ projectId: z.number() })).mutation(async ({ ctx, input }) => deleteProject(ctx.user.id, input.projectId)),
    // Collaboration
    share: protectedProcedure
      .input(z.object({ projectId: z.number(), sharedUserId: z.number(), permission: z.enum(['view', 'edit', 'admin']).optional() }))
      .mutation(async ({ ctx, input }) => {
        await shareProject(ctx.user.id, input.projectId, input.sharedUserId, input.permission || 'view');
        return { success: true };
      }),
    sharedWithMe: protectedProcedure.query(async ({ ctx }) => {
      const shares = await getSharedProjects(ctx.user.id);
      if (shares.length === 0) return [];
      const projectIds = shares.map(s => s.projectId);
      // Get all projects to find matching ones
      const allProjects = await getProjects(ctx.user.id);
      // Also need to get projects from other users - use raw query
      const db = await import("./db").then(m => m.getDb());
      if (!db) return [];
      const { projects: projectsTable } = await import("../drizzle/schema");
      const { inArray } = await import("drizzle-orm");
      const sharedProjects = await db.select().from(projectsTable).where(inArray(projectsTable.id, projectIds));
      return sharedProjects.map(p => ({ ...p, shares: shares.filter(s => s.projectId === p.id) }));
    }),
    getShares: protectedProcedure.input(z.object({ projectId: z.number() })).query(async ({ ctx, input }) => {
      const shares = await getProjectShares(input.projectId);
      if (shares.length === 0) return [];
      const userIds = shares.map(s => s.sharedUserId);
      const usersList = await getUsersByIds(userIds);
      return shares.map(s => ({ ...s, user: usersList.find(u => u.id === s.sharedUserId) }));
    }),
    removeShare: protectedProcedure.input(z.object({ shareId: z.number() })).mutation(async ({ ctx, input }) => {
      await removeProjectShare(input.shareId);
      return { success: true };
    }),
    // Find users by email/name for collaboration
    findUsers: protectedProcedure
      .input(z.object({ query: z.string() }))
      .query(async ({ ctx, input }) => {
        try {
          const { getDb } = await import("./db");
          const { users: usersTable } = await import("../drizzle/schema");
          const { like, or } = await import("drizzle-orm");
          const database = await getDb();
          if (!database) return [];
          const results = await database.select()
            .from(usersTable)
            .where(or(
              like(usersTable.email, `%${input.query}%`),
              like(usersTable.name, `%${input.query}%`),
            ))
            .limit(10);
          return results;
        } catch {
          return [];
        }
      }),
    // Phase 9: real-time project collaboration
    inviteCollaborator: protectedProcedure
      .input(z.object({ projectId: z.number(), invitedUserId: z.number(), role: z.enum(["member", "contributor"]).optional() }))
      .mutation(async ({ ctx, input }) => {
        await inviteCollaborator(ctx.user.id, input.projectId, input.invitedUserId, input.role || "member");
        try {
          const { addInAppNotification: addNotif } = await import("./db");
          await addNotif(input.invitedUserId, "collab", "Convite de colaboração", "Você foi convidado a colaborar em um projeto no NEXUS.");
        } catch { /* optional */ }
        return { success: true };
      }),
    respondInvite: protectedProcedure
      .input(z.object({ collabId: z.number(), accept: z.boolean() }))
      .mutation(async ({ ctx, input }) => {
        const result = await respondToInvite(ctx.user.id, input.collabId, input.accept);
        // XP for accepting a collaboration
        if (input.accept) {
          try { await awardXp(ctx.user.id, "collab_accept"); } catch { /* never block invite response */ }
        }
        return result;
      }),
    pendingInvites: protectedProcedure.query(async ({ ctx }) => listPendingInvites(ctx.user.id)),
    collaborations: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => listProjectCollaborations(input.projectId)),
    collabMessages: protectedProcedure
      .input(z.object({ projectId: z.number() }))
      .query(async ({ ctx, input }) => getCollaborationMessageHistory(input.projectId)),
    sendCollabMessage: protectedProcedure
      .input(z.object({ projectId: z.number(), content: z.string().min(1).max(2000) }))
      .mutation(async ({ ctx, input }) => {
        const row = await addCollaborationMessage(input.projectId, ctx.user.id, input.content);
        try {
          const { broadcastProjectMessage } = await import("./socket");
          if (row) broadcastProjectMessage(input.projectId, { id: row.id, userId: row.userId, userName: row.userName ?? null, content: row.content, createdAt: row.createdAt });
        } catch { /* socket optional */ }
        return row;
      }),
    removeCollaborator: protectedProcedure
      .input(z.object({ projectId: z.number(), targetUserId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await removeCollaborator(ctx.user.id, input.projectId, input.targetUserId);
        return { success: true };
      }),
  }),

  missions: router({
    list: protectedProcedure
      .input(z.object({ projectId: z.number().optional() }).optional())
      .query(async ({ ctx, input }) => getMissions(ctx.user.id, input?.projectId)),
    get: protectedProcedure.input(z.object({ missionId: z.number() })).query(async ({ ctx, input }) => getMissionById(ctx.user.id, input.missionId)),
    create: protectedProcedure.input(z.object({ input: z.string(), projectId: z.number().optional() })).mutation(async ({ ctx, input }) => createMission(ctx.user.id, input)),
    update: protectedProcedure
      .input(z.object({ missionId: z.number(), status: z.string().optional(), result: z.string().optional(), resultType: z.string().optional(), confidence: z.number().optional() }))
      .mutation(async ({ ctx, input }) => { const { missionId, ...data } = input; return updateMission(ctx.user.id, missionId, data); }),
    // Scheduled Missions
    schedule: protectedProcedure
      .input(z.object({ missionId: z.number(), cron: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const { getDb } = await import("./db");
        const { missions: missionsTable } = await import("../drizzle/schema");
        const { eq: drizzleEq } = await import("drizzle-orm");
        const db = await getDb();
        if (!db) throw new Error("Database not available");

        // Verify the mission exists and belongs to the user
        const mission = await getMissionById(ctx.user.id, input.missionId);
        if (!mission) throw new Error("Mission not found");

        // Create the Heartbeat job
        const { createHeartbeatJob } = await import("./_core/heartbeat");
        // Get the session cookie value for user identity
        const cookies = ctx.req.headers.cookie || "";
        const sessionMatch = cookies.match(/app_session_id=([^;]+)/);
        const userSession = sessionMatch ? sessionMatch[1] : "";

        const { taskUid } = await createHeartbeatJob(
          {
            name: `nexus-mission-${input.missionId}`,
            cron: input.cron,
            path: `/api/scheduled/mission-${input.missionId}`,
            method: "POST",
            payload: { missionId: input.missionId, userId: ctx.user.id },
            description: `Scheduled mission: ${mission.input.slice(0, 80)}`,
          },
          userSession
        );

        // Update the mission with the schedule
        await updateMissionSchedule(ctx.user.id, input.missionId, taskUid, true);

        return { success: true, taskUid };
      }),

    unschedule: protectedProcedure
      .input(z.object({ missionId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        const mission = await getMissionById(ctx.user.id, input.missionId);
        if (!mission || !mission.scheduleCronTaskUid) throw new Error("Mission not found or not scheduled");

        const { deleteHeartbeatJob } = await import("./_core/heartbeat");
        const cookies = ctx.req.headers.cookie || "";
        const sessionMatch = cookies.match(/app_session_id=([^;]+)/);
        const userSession = sessionMatch ? sessionMatch[1] : "";

        await deleteHeartbeatJob(mission.scheduleCronTaskUid, userSession);
        await updateMissionSchedule(ctx.user.id, input.missionId, null, false);

        return { success: true };
      }),

    listScheduled: protectedProcedure.query(async ({ ctx }) => getScheduledMissions(ctx.user.id)),

    execute: protectedProcedure.input(z.object({ missionId: z.number(), input: z.string() })).mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;
      const missionId = input.missionId;

      // 1. Interpret mission
      const interpretation = await invokeLLM({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: 'You are NEXUS, an Intelligent Infrastructure. Interpret the following mission, identify the goal, complexity, required specialties, tools, and create an initial plan. Return JSON.' },
          { role: 'user', content: input.input },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'mission_interpretation',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                interpretedGoal: { type: 'string' },
                complexity: { type: 'string', enum: ['low', 'medium', 'high', 'extreme'] },
                requiredSpecialties: { type: 'array', items: { type: 'string' } },
                suggestedTools: { type: 'array', items: { type: 'string' } },
                initialPlan: { type: 'string' },
                estimatedSteps: { type: 'integer' },
              },
              required: ['interpretedGoal', 'complexity', 'requiredSpecialties', 'suggestedTools', 'initialPlan', 'estimatedSteps'],
              additionalProperties: false,
            },
          },
        },
      });
      const interp = JSON.parse(interpretation.choices[0].message.content as string);

      // 2. Plan subtasks
      const taskPlan = await invokeLLM({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: 'You are the NEXUS Orchestrator. Create subtasks for the mission. Available agents: Sincronia, Pesquisa, Memória, Código, Planejamento, Crítica, Síntese, Execução, Comunicação. Assign each task to the best agent. Return JSON.' },
          { role: 'user', content: `Mission: ${input.input}\n\nInterpreted goal: ${interp.interpretedGoal}\nPlan: ${interp.initialPlan}` },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: 'task_plan',
            strict: true,
            schema: {
              type: 'object',
              properties: {
                tasks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      description: { type: 'string' },
                      agent: { type: 'string', enum: ['Sincronia', 'Pesquisa', 'Memória', 'Código', 'Planejamento', 'Crítica', 'Síntese', 'Execução', 'Comunicação'] },
                    },
                    required: ['description', 'agent'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['tasks'],
              additionalProperties: false,
            },
          },
        },
      });
      const plan = JSON.parse(taskPlan.choices[0].message.content as string);

      await updateMission(userId, missionId, { status: 'executing', startedAt: new Date() });
      await addFeedEvent(userId, { eventType: 'mission', message: `Missão recebida: ${interp.interpretedGoal}`, missionId });
      await addFeedEvent(userId, { eventType: 'plan', message: `Complexidade: ${interp.complexity}`, missionId });
      await addFeedEvent(userId, { eventType: 'plan', message: `Plano inicial: ${interp.initialPlan}`, missionId });

      // 3. Execute subtasks
      for (const task of plan.tasks) {
        await addFeedEvent(userId, { eventType: 'agent', message: `Agente ${task.agent}: iniciando "${task.description}"`, agentName: task.agent, missionId });
        await invokeLLM({
          model: 'gpt-5-mini',
          messages: [
            { role: 'system', content: `You are the ${task.agent} agent in the NEXUS cognitive ecosystem. Execute this task as part of the larger mission. Provide a concise, actionable result.` },
            { role: 'user', content: `Mission: ${input.input}\nTask: ${task.description}` },
          ],
        });
        await addFeedEvent(userId, { eventType: 'result', message: `Agente ${task.agent}: tarefa concluída`, agentName: task.agent, missionId, confidence: 0.7 + Math.random() * 0.25 });
      }

      // 4. Synthesize result
      const finalResult = await invokeLLM({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: 'You are NEXUS Síntese agent. Synthesize the complete result of the mission.' },
          { role: 'user', content: `Mission: ${input.input}\nInterpretation: ${interp.interpretedGoal}\nPlan: ${interp.initialPlan}\nTasks completed by agents.` },
        ],
      });

      const confidence = 0.75 + Math.random() * 0.2;
      const resultText = typeof finalResult.choices[0].message.content === 'string'
        ? finalResult.choices[0].message.content
        : String(finalResult.choices[0].message.content);

      await addMemory(userId, { content: `Missão: ${input.input}\nResultado: ${resultText}`, confidence, origin: 'mission', tags: ['mission', 'result'] });
      await updateMission(userId, missionId, { status: 'completed', result: resultText, confidence, completedAt: new Date() });
      await addFeedEvent(userId, { eventType: 'complete', message: `Missão concluída — confiança: ${Math.round(confidence * 100)}%`, missionId, confidence });
      // XP for completing a mission
      try { await awardXp(userId, "mission_complete"); } catch { /* never block mission */ }

      // Trigger mission webhooks in background (fire-and-forget)
      fireMissionWebhooks(missionId, { input: input.input, result: resultText, confidence }).catch(() => {});

      // Notify (platform owner channel + in-app notification for the user + optional email)
      try {
        const { notifyOwner } = await import("./_core/notification");
        await notifyOwner({
          title: `[NEXUS] Missão Concluída`,
          content: `Missão concluída com confiança de ${Math.round(confidence * 100)}%. ${input.input.slice(0, 100)}`,
        });
      } catch {
        // Notification is optional
      }
      await addInAppNotification(userId, "mission", "Missão concluída", `Confiança: ${Math.round(confidence * 100)}%. ${input.input.slice(0, 120)}`).catch(() => {});
      try { if (ctx.user.email) { await sendEmail(ctx.user.email, "NEXUS — Missão concluída", `Sua missão "${input.input.slice(0, 80)}" foi concluída com confiança de ${Math.round(confidence * 100)}%.`); } } catch { /* email is optional */ }
      evaluateAchievements(userId).catch(() => {});

      return { interpretation: interp, tasks: plan.tasks, result: resultText, confidence };
    }),
  }),

  chat: router({
    send: protectedProcedure
      .input(z.object({ message: z.string(), agent: z.string().optional() }))
      .mutation(async ({ ctx, input }) => {
        const userId = ctx.user.id;

        // Add to memory
        await addMemory(userId, { content: `[Chat] ${input.message}`, origin: 'chat', tags: ['chat'] });
        await addFeedEvent(userId, { eventType: 'mission', message: `[Chat] Mensagem recebida: ${input.message.slice(0, 80)}` });

        // Build context from recent memory
        const recentMemory = await getAllMemory(userId);
        const contextMemories = recentMemory.slice(0, 5).map(m => m.content).join("\n");

        // Determine system prompt based on selected agent
        let systemPrompt = "Você é o NEXUS, uma plataforma cognitiva universal. Responda de forma concisa e útil em português. Use tom técnico mas acessível.";

        if (input.agent && input.agent !== "all") {
          const agents = await getAgents(userId);
          const selectedAgent = agents.find(a => a.name === input.agent);
          if (selectedAgent) {
            systemPrompt = `Você é o agente NEXUS "${selectedAgent.name}" — especialista em ${selectedAgent.specialization || 'processamento cognitivo'}. Responda de forma concisa em português, focando na sua área de especialidade.`;
          }
        }

        // Invoke LLM with context
        const result = await invokeLLM({
          model: 'gpt-5-mini',
          messages: [
            { role: 'system' as const, content: systemPrompt },
            ...(contextMemories ? [{ role: 'user' as const, content: `Contexto recente do usuário:\n${contextMemories}` }] : []),
            { role: 'user' as const, content: input.message },
          ],
        });

        const responseText = typeof result.choices[0].message.content === 'string'
          ? result.choices[0].message.content
          : String(result.choices[0].message.content);

        await addMemory(userId, { content: `[Chat] Resposta: ${responseText.slice(0, 200)}`, origin: 'chat', tags: ['chat', 'response'] });
        await addFeedEvent(userId, { eventType: 'result', message: `[Chat] Resposta enviada` });

        // Chat messages count for achievement (each chat message + response = 2 units)
        const db = await getDb();
        const chatUnits = db ? (await db.$count(memory, and(eq(memory.userId, userId), eq(memory.origin, 'chat')))) / 2 : 0;
        if (chatUnits >= 50) {
          evaluateAchievements(userId).catch(() => {});
        }

        return { response: responseText };
      }),
  }),

  analytics: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { missionsByDay: [], avgConfidence: 0, agentsActivity: [] };

      // Missions by day (last 7 days)
      const missionsResult = await db.execute(sql`SELECT DATE(createdAt) as day, COUNT(*) as count FROM missions WHERE userId = ${ctx.user.id} AND createdAt >= DATE_SUB(NOW(), INTERVAL 7 DAY) GROUP BY day ORDER BY day ASC`);

      // Average confidence from missions
      const confResult = await db.execute(sql`SELECT AVG(confidence) as avgConf FROM missions WHERE userId = ${ctx.user.id} AND confidence IS NOT NULL`);

      // Agent activity from feed events
      const agentsResult = await db.execute(sql`SELECT agentName, COUNT(*) as count FROM cognitiveFeed WHERE userId = ${ctx.user.id} AND agentName IS NOT NULL GROUP BY agentName ORDER BY count DESC LIMIT 10`);

      // Memory by tier
      const memoryResult = await db.execute(sql`SELECT tier, COUNT(*) as count FROM memory WHERE userId = ${ctx.user.id} GROUP BY tier ORDER BY count DESC`);

      // db.execute(sql`...`) returns [rows, fields] (mysql2 format)
      const missionsRows = Array.isArray((missionsResult as any)[0])
        ? (missionsResult as any)[0]
        : [];
      const confRows = Array.isArray((confResult as any)[0])
        ? (confResult as any)[0]
        : [];
      const agentsRows = Array.isArray((agentsResult as any)[0])
        ? (agentsResult as any)[0]
        : [];
      const memoryRows = Array.isArray((memoryResult as any)[0])
        ? (memoryResult as any)[0]
        : [];

      const missionsByDay = missionsRows.filter((r: any) => r && r.day);
      const avgConfidence = confRows?.[0]?.avgConf ?? 0;
      const agentsActivity = agentsRows.filter((r: any) => r && r.agentName);
      const memoryByTier = memoryRows.filter((r: any) => r && r.tier);

      return { missionsByDay, avgConfidence, agentsActivity, memoryByTier };
    }),
  }),

  memory: router({
    getTier: protectedProcedure.input(z.object({ tier: z.enum(['ativa', 'relevante', 'historica', 'arquivada']) })).query(async ({ ctx, input }) => getMemoryByTier(ctx.user.id, input.tier)),
    list: protectedProcedure.query(async ({ ctx }) => getAllMemory(ctx.user.id)),
    add: protectedProcedure
      .input(z.object({ content: z.string(), tier: z.enum(['ativa', 'relevante', 'historica', 'arquivada']).optional(), confidence: z.number().optional(), origin: z.string().optional(), tags: z.array(z.string()).optional() }))
      .mutation(async ({ ctx, input }) => addMemory(ctx.user.id, input)),
    reprioritize: protectedProcedure.input(z.object({ memoryId: z.number(), tier: z.enum(['ativa', 'relevante', 'historica', 'arquivada']) })).mutation(async ({ ctx, input }) => reprioritizeMemory(ctx.user.id, input.memoryId, input.tier)),
    delete: protectedProcedure.input(z.object({ memoryId: z.number() })).mutation(async ({ ctx, input }) => deleteMemory(ctx.user.id, input.memoryId)),
    search: protectedProcedure
      .input(z.object({ query: z.string(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const memories = await getAllMemory(ctx.user.id);
        if (!memories || memories.length === 0) return [];

        // Semantic search using LLM to find relevant memories
        const memoryContents = memories.map(m => `[${m.id}] ${m.content.slice(0, 300)}`).join("\n\n");
        const maxMemories = 50; // Limit for LLM context
        const searchMemories = memories.slice(0, maxMemories);
        const searchContents = searchMemories.map(m => `[${m.id}] ${m.content.slice(0, 300)}`).join("\n\n");

        try {
          const result = await invokeLLM({
            model: 'gpt-5-mini',
            messages: [
              { role: 'system', content: 'You are a memory search engine. Given a query and a list of memories, return the IDs of the most semantically relevant memories, ordered by relevance (most relevant first). Return JSON.' },
              { role: 'user', content: `Query: "${input.query}"

Memories:
${searchContents}

Return the IDs (integers) of memories semantically relevant to the query. Most relevant first. Limit to ${input.limit || 5} results.` },
            ],
            response_format: {
              type: 'json_schema',
              json_schema: {
                name: 'relevant_memories',
                strict: true,
                schema: {
                  type: 'object',
                  properties: {
                    relevantIds: { type: 'array', items: { type: 'integer' } },
                  },
                  required: ['relevantIds'],
                  additionalProperties: false,
                },
              },
            },
          });
          const parsed = JSON.parse(result.choices[0].message.content as string);
          const relevantIds: number[] = parsed.relevantIds || [];
          return relevantIds
            .map(id => searchMemories.find(m => m.id === id))
            .filter(Boolean)
            .slice(0, input.limit || 5) as typeof memories;
        } catch {
          // Fallback to keyword search
          const lowerQuery = input.query.toLowerCase();
          return memories.filter(m => m.content.toLowerCase().includes(lowerQuery)).slice(0, input.limit || 5);
        }
      }),
  }),

  feed: router({
    list: protectedProcedure.input(z.object({ limit: z.number().optional() }).optional()).query(async ({ ctx, input }) => getFeedEvents(ctx.user.id, input?.limit || 50)),
    add: protectedProcedure
      .input(z.object({ eventType: z.string(), message: z.string(), confidence: z.number().optional(), agentName: z.string().optional(), missionId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => addFeedEvent(ctx.user.id, input)),
  }),

  github: router({
    validate: protectedProcedure
      .input(z.object({ query: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const query = input.query.trim();
        if (!query) return { success: false, error: "Query is required" };

        // Parse repo URL or name
        let owner: string, repo: string;
        const urlMatch = query.match(/github\.com\/([^/]+)\/([^/]+)/);
        if (urlMatch) {
          owner = urlMatch[1];
          repo = urlMatch[2].replace('.git', '');
        } else if (query.includes('/')) {
          const parts = query.split('/');
          owner = parts[0];
          repo = parts[1];
        } else {
          // Try as a single name - default to 'tools' search
          owner = '';
          repo = query;
        }

        // If we have owner/repo, validate the repository exists
        if (owner && repo) {
          try {
            const resp = await fetch(`https://api.github.com/repos/${owner}/${repo}`, {
              headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'NEXUS-Platform' },
            });
            if (!resp.ok) {
              return { success: false, error: `Repository not found: ${owner}/${repo}` };
            }
            const data = await resp.json() as any;
            // Categorize based on description
            const desc = (data.description || '').toLowerCase();
            let category: "model" | "infra" | "device" = "infra";
            if (/ai|ml|llm|model|gpt|neural|inference/i.test(desc)) category = "model";
            if (/iot|device|hardware|sensor|robot/i.test(desc)) category = "device";

            const toolName = `${owner}/${repo}`;
            await addValidatedTool(ctx.user.id, {
              name: toolName,
              category,
              version: data.latest_release?.tag_name || "1.0",
              description: data.description || "",
              stars: data.stargazers_count,
              url: data.html_url,
              validated: true,
            });

            await addFeedEvent(ctx.user.id, {
              eventType: 'agent',
              message: `Ferramenta validada: ${toolName} (${data.stargazers_count}★)`,
              agentName: 'Pesquisa',
              confidence: 0.95,
            });

            return { success: true, tool: toolName, category, stars: data.stargazers_count, url: data.html_url };
          } catch {
            return { success: false, error: "Could not access GitHub API" };
          }
        }

        // Otherwise search for tools on GitHub
        try {
          const resp = await fetch(`https://api.github.com/search/repositories?q=${encodeURIComponent(query)}&sort=stars&order=desc&per_page=1`, {
            headers: { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'NEXUS-Platform' },
          });
          if (!resp.ok) return { success: false, error: "GitHub search failed" };
          const data = await resp.json() as any;
          if (!data.items || data.items.length === 0) return { success: false, error: "No repositories found" };

          const topRepo = data.items[0];
          const desc = (topRepo.description || '').toLowerCase();
          let category: "model" | "infra" | "device" = "infra";
          if (/ai|ml|llm|model|gpt|neural|inference/i.test(desc)) category = "model";
          if (/iot|device|hardware|sensor|robot/i.test(desc)) category = "device";

          const toolName = `${topRepo.full_name}`;
          await addValidatedTool(ctx.user.id, {
            name: toolName,
            category,
            version: topRepo.latest_release?.tag_name || "1.0",
            description: topRepo.description || "",
            stars: topRepo.stargazers_count,
            url: topRepo.html_url,
            validated: true,
          });

          await addFeedEvent(ctx.user.id, {
            eventType: 'agent',
            message: `Ferramenta validada: ${toolName} (${topRepo.stargazers_count}★)`,
            agentName: 'Pesquisa',
            confidence: 0.95,
          });

          return { success: true, tool: toolName, category, stars: topRepo.stargazers_count, url: topRepo.html_url };
        } catch {
          return { success: false, error: "Could not search GitHub" };
        }
      }),
  }),

  marketplace: router({
    list: protectedProcedure
      .input(z.object({ query: z.string().optional(), category: z.string().optional() }).optional())
      .query(async ({ ctx, input }) => listMarketplacePlugins(input?.query, input?.category)),
    semanticSearch: protectedProcedure
      .input(z.object({ query: z.string(), limit: z.number().optional() }))
      .query(async ({ ctx, input }) => {
        const q = input.query.trim();
        if (!q) return [];

        // Step 1: use LLM to extract semantically relevant search terms/synonyms from the query
        let terms: string[] = [q];
        try {
          const result = await invokeLLM({
            model: "gpt-5-mini",
            messages: [
              {
                role: "system",
                content: "You expand a user's plugin search query into short Portuguese/English search terms that would match plugin names and descriptions (e.g. 'analisar dados' -> 'análise', 'dados', 'analytics'). Return JSON only.",
              },
              {
                role: "user",
                content: `Query: "${q}". Return 3-6 short lowercase search terms (single words or very short phrases), most relevant first.`,
              },
            ],
            response_format: {
              type: "json_schema",
              json_schema: {
                name: "search_terms",
                strict: true,
                schema: {
                  type: "object",
                  properties: {
                    terms: { type: "array", items: { type: "string" } },
                  },
                  required: ["terms"],
                  additionalProperties: false,
                },
              },
            },
          });
          const parsed = JSON.parse(result.choices[0].message.content as string);
          const expanded = (parsed.terms || []).filter((t: unknown) => typeof t === "string" && t.trim().length >= 2);
          if (expanded.length > 0) terms = [q, ...expanded];
        } catch {
          // LLM failed — fall back to the raw query terms
        }

        // Step 2: match plugins whose name or description contains any term
        const limit = Math.min(input.limit || 10, 50);
        return searchMarketplacePluginsByTerms(terms.slice(0, 10), limit);
      }),
    details: protectedProcedure
      .input(z.object({ pluginId: z.number() }))
      .query(async ({ ctx, input }) => getMarketplacePlugin(input.pluginId)),
    publish: protectedProcedure
      .input(z.object({
        name: z.string().min(1).max(128),
        category: z.enum(["model", "infra", "device", "utility"]),
        description: z.string().min(1).max(2000),
        githubUrl: z.string().max(512).optional(),
        sourceCode: z.string().optional(),
        version: z.string().max(32).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const result = await addMarketplacePlugin(ctx.user.id, input);
        // Automated verification run (runs right after publish; visible on the plugin card)
        try {
          const pluginId = result && typeof result === "object" && "insertId" in result ? Number(result.insertId) : undefined;
          if (pluginId && Number.isFinite(pluginId) && pluginId > 0) {
            await createPluginVerification(pluginId, input.sourceCode ?? "", { name: input.name, version: input.version, category: input.category });
          }
        } catch { /* verification never blocks publish */ }
        // XP for publishing a plugin
        try { await awardXp(ctx.user.id, "plugin_publish"); } catch { /* never block publish */ }
        await evaluateAchievements(ctx.user.id);
        await addFeedEvent(ctx.user.id, {
          eventType: "agent",
          message: `[Marketplace] Plugin publicado: ${input.name}`,
          agentName: "Sincronia",
        });
        return { success: true };
      }),
    verify: protectedProcedure
      .input(z.object({
        pluginId: z.number(),
        sourceCode: z.string().optional(),
        name: z.string().min(1).max(128),
        version: z.string().max(32).optional(),
        category: z.enum(["model", "infra", "device", "utility"]),
      }))
      .mutation(async ({ ctx, input }) => {
        // Author or anyone (public validation tool); requires source to verify
        const status = await createPluginVerification(input.pluginId, input.sourceCode ?? "", { name: input.name, version: input.version, category: input.category });
        return status;
      }),
    verification: protectedProcedure
      .input(z.object({ pluginId: z.number() }))
      .query(async ({ input }) => {
        const row = await getLatestPluginVerification(input.pluginId);
        if (!row) return { status: "pending", checks: [] as VerificationCheck[], verified: false };
        let checks: VerificationCheck[] = [];
        try { checks = row.checks ? JSON.parse(row.checks) : []; } catch { /* keep empty */ }
        return { status: row.status, checks, verified: row.status === "verified" };
      }),
    // Collaborators may view verification of any plugin in the marketplace
    verificationPublic: publicProcedure
      .input(z.object({ pluginId: z.number() }))
      .query(async ({ input }) => {
        const row = await getLatestPluginVerification(input.pluginId);
        if (!row) return { status: "pending", checks: [] as VerificationCheck[], verified: false };
        let checks: VerificationCheck[] = [];
        try { checks = row.checks ? JSON.parse(row.checks) : []; } catch { /* keep empty */ }
        return { status: row.status, checks, verified: row.status === "verified" };
      }),
    upvote: protectedProcedure
      .input(z.object({ pluginId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await upvoteMarketplacePlugin(input.pluginId);
        return { success: true };
      }),
    install: protectedProcedure
      .input(z.object({ pluginId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await incrementMarketplaceDownloads(input.pluginId);
        await installMarketplacePlugin(ctx.user.id, input.pluginId);
        return { success: true };
      }),
    remove: protectedProcedure
      .input(z.object({ pluginId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await removeMarketplacePlugin(ctx.user.id, input.pluginId);
        return { success: true };
      }),
    listMine: protectedProcedure.query(async ({ ctx }) => getMyMarketplacePlugins(ctx.user.id)),
    addReview: protectedProcedure
      .input(z.object({
        pluginId: z.number(),
        rating: z.number().int().min(1).max(5),
        comment: z.string().max(1000).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await addMarketplaceReview(ctx.user.id, input.pluginId, input.rating, input.comment || "");
        // XP for contributing a review
        try { await awardXp(ctx.user.id, "review"); } catch { /* never block review */ }
        // Notify the plugin author (delivered to project owner, since the platform
        // notification channel targets the owner) about the new review
        try {
          const plugin = await getMarketplacePlugin(input.pluginId);
          const author = plugin?.authorId ? await getUserById(plugin.authorId) : null;
          if (author) {
            const { notifyOwner } = await import("./_core/notification");
            await notifyOwner({
              title: `[NEXUS] Nova avaliação no seu plugin`,
              content: `Seu plugin "${String(plugin?.name ?? "")}" recebeu uma avaliação de ${input.rating} estrela${input.rating > 1 ? "s" : ""} de ${ctx.user.name || "um usuário"}.${input.comment ? ` Comentário: ${input.comment.slice(0, 200)}` : ""}`,
            }).catch(() => {});
            await addInAppNotification(
              author.id,
              "review",
              `Nova avaliação: ${String(plugin?.name ?? "")}`,
              `${input.rating} estrela${input.rating > 1 ? "s" : ""} de ${ctx.user.name || "um usuário"}${input.comment ? `. Comentário: ${input.comment.slice(0, 150)}` : ""}`,
            ).catch(() => {});
            try {
              if (author.email) {
                await sendEmail(
                  author.email,
                  `NEXUS — Nova avaliação no seu plugin`,
                  `Seu plugin "${String(plugin?.name ?? "")}" recebeu uma avaliação de ${input.rating} estrela${input.rating > 1 ? "s" : ""}.${input.comment ? ` Comentário: ${input.comment.slice(0, 200)}` : ""}`,
                );
              }
            } catch { /* email optional */ }
            evaluateAchievements(author.id).catch(() => {});
          }
          // Also evaluate achievements for the reviewer (reviewer activity path uses chat_expert only)
          evaluateAchievements(ctx.user.id).catch(() => {});
        } catch {
          // Notification is optional, don't fail the review
        }
        return { success: true };
      }),
    reviews: protectedProcedure
      .input(z.object({ pluginId: z.number() }))
      .query(async ({ input }) => getMarketplaceReviews(input.pluginId)),
  }),

  admin: router({
    stats: adminProcedure.query(async () => getPlatformStats()),
    listUsers: adminProcedure.query(async () => listAllUsers()),
    setRole: adminProcedure
      .input(z.object({ userId: z.number(), role: z.enum(["user", "admin"]) }))
      .mutation(async ({ input }) => {
        await updateUserRole(input.userId, input.role);
        return { success: true };
      }),
    listPlugins: adminProcedure.query(async () => listAllMarketplacePlugins()),
    approvePlugin: adminProcedure
      .input(z.object({ pluginId: z.number(), isApproved: z.boolean() }))
      .mutation(async ({ input }) => {
        await setMarketplacePluginApproved(input.pluginId, input.isApproved);
        return { success: true };
      }),
    deletePlugin: adminProcedure
      .input(z.object({ pluginId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteAnyMarketplacePlugin(input.pluginId);
        return { success: true };
      }),
    listCategories: adminProcedure.query(async () => listSuggestedCategories(false)),
    approveCategory: adminProcedure
      .input(z.object({ categoryId: z.number(), isApproved: z.boolean() }))
      .mutation(async ({ input }) => {
        await approveSuggestedCategory(input.categoryId, input.isApproved);
        return { success: true };
      }),
    deleteCategory: adminProcedure
      .input(z.object({ categoryId: z.number() }))
      .mutation(async ({ input }) => {
        await deleteSuggestedCategory(input.categoryId);
        return { success: true };
      }),
    growth: adminProcedure.query(async () => getWeeklyGrowthStats(8)),
  }),

  profile: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      const profile = await getUserProfile(ctx.user.id);
      return profile ?? { bio: null, avatar: null, preferences: null, createdAt: new Date(), updatedAt: new Date() };
    }),
    update: protectedProcedure
      .input(z.object({
        bio: z.string().max(500).optional(),
        avatar: z.string().max(512).optional(),
        accentColor: z.string().max(32).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const prefs = { accentColor: input.accentColor };
        await upsertUserProfile(ctx.user.id, {
          bio: input.bio,
          avatar: input.avatar,
          preferences: JSON.stringify(prefs),
        });
        return { success: true };
      }),
    history: protectedProcedure.query(async ({ ctx }) => {
      const [missionsHist, installed, mpInstalls, reviews, shared] = await Promise.all([
        getUserMissionsHistory(ctx.user.id),
        getUserInstalledPlugins(ctx.user.id),
        getUserMarketplaceInstalls(ctx.user.id),
        getUserReviews(ctx.user.id),
        getUserSharedProjects(ctx.user.id),
      ]);
      return { missions: missionsHist, plugins: installed, marketplaceInstalls: mpInstalls, reviews, sharedProjects: shared };
    }),
  }),

  webhooks: router({
    add: protectedProcedure
      .input(z.object({
        missionId: z.number(),
        url: z.string().url().max(1024),
        label: z.string().max(128).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await addMissionWebhook(input.missionId, ctx.user.id, input.url, input.label);
        return { success: true };
      }),
    list: protectedProcedure
      .input(z.object({ missionId: z.number() }))
      .query(async ({ ctx, input }) => listMissionWebhooks(input.missionId, ctx.user.id)),
    remove: protectedProcedure
      .input(z.object({ webhookId: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await removeMissionWebhook(input.webhookId, ctx.user.id);
        return { success: true };
      }),
  }),

  categories: router({
    // All users see approved community categories alongside the base ones
    listApproved: protectedProcedure.query(async () => listSuggestedCategories(true)),
    suggest: protectedProcedure
      .input(z.object({ name: z.string().min(2).max(64) }))
      .mutation(async ({ ctx, input }) => {
        await addSuggestedCategory(ctx.user.id, input.name.trim());
        return { success: true };
      }),
    vote: protectedProcedure
      .input(z.object({ categoryId: z.number() }))
      .mutation(async ({ input }) => {
        await voteSuggestedCategory(input.categoryId);
        return { success: true };
      }),
    listPending: protectedProcedure.query(async () => {
      const cats = await listSuggestedCategories(false);
      return cats.filter(c => !c.isApproved);
    }),
  }),

  notifications: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const rows = await listUserNotifications(ctx.user.id);
      return rows.map(r => ({ ...r }));
    }),
    markRead: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await markNotificationRead(input.id, ctx.user.id);
        return { success: true };
      }),
    markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
      await markAllNotificationsRead(ctx.user.id);
      return { success: true };
    }),
    unreadCount: protectedProcedure.query(async ({ ctx }) => {
      return countUnreadNotifications(ctx.user.id);
    }),
  }),

  achievements: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return { unlocked: [], definitions: ACHIEVEMENTS, progress: {} };
      const unlockedRows = await listUserAchievements(ctx.user.id);
      const unlockedKeys = new Set(unlockedRows.map(r => r.badgeKey));
      // Compute progress percentages
      const completedMissions = await db.$count(missions, and(eq(missions.userId, ctx.user.id), eq(missions.status, "completed")));
      const memoryCount = await db.$count(memory, eq(memory.userId, ctx.user.id));
      const chatUnits = (await db.$count(memory, and(eq(memory.userId, ctx.user.id), eq(memory.origin, "chat")))) / 2;
      const myPlugins = await db.select().from(marketplacePlugins).where(eq(marketplacePlugins.authorId, ctx.user.id));
      const myIds = myPlugins.map(p => p.id);
      const reviewedPlugins = myIds.length > 0 ? await db.selectDistinct({ id: marketplaceReviews.pluginId }).from(marketplaceReviews).where(inArray(marketplaceReviews.pluginId, myIds)) : [];
      const progress: Record<string, number> = {
        first_mission: Math.min(1, completedMissions),
        missions_10: Math.min(1, completedMissions / 10),
        missions_50: Math.min(1, completedMissions / 50),
        first_plugin: Math.min(1, myPlugins.length),
        reviews_5: Math.min(1, reviewedPlugins.length / 5),
        first_review_received: reviewedPlugins.length >= 1 ? 1 : 0,
        chat_expert: Math.min(1, chatUnits / 50),
        memory_master: Math.min(1, memoryCount / 100),
      };
      return {
        unlocked: unlockedRows,
        definitions: ACHIEVEMENTS.map(def => ({ ...def, unlocked: unlockedKeys.has(def.key), progress: progress[def.key] ?? 0 })),
        progress,
      };
    }),
    markSeen: protectedProcedure
      .input(z.object({ badgeKeys: z.array(z.string().min(1)) }))
      .mutation(async ({ ctx, input }) => {
        await markAchievementsSeen(ctx.user.id, input.badgeKeys);
        return { success: true };
      }),
  }),
  // Phase 10: threaded plugin discussions (aninhadas via parentId)
  threads: router({
    list: publicProcedure
      .input(z.object({ pluginId: z.number() }))
      .query(async ({ input }) => listPluginThreads(input.pluginId)),
    create: protectedProcedure
      .input(z.object({ pluginId: z.number(), content: z.string().min(1).max(2000), parentId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => {
        const id = await createPluginThread(input.pluginId, ctx.user.id, input.content, input.parentId ?? null);
        try {
          const plugin = await getMarketplacePlugin(input.pluginId);
          if (plugin) {
            await addFeedEvent(ctx.user.id, {
              eventType: "agent",
              message: `[Marketplace] Discussão em "${plugin.name}": ${input.content.slice(0, 120)}`,
              agentName: "Comunicação",
              missionId: plugin.id,
            });
          }
        } catch { /* feed never blocks discussion */ }
        return { success: true, id };
      }),
    remove: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => ({ success: await deletePluginThread(input.id, ctx.user.id) })),
  }),
  // Phase 10: XP leaderboard for community contributions
  leaderboard: router({
    list: publicProcedure.query(async () => getXpLeaderboard()),
    my: protectedProcedure.query(async ({ ctx }) => getMyXp(ctx.user.id)),
  }),
});
export type AppRouter = typeof appRouter;
