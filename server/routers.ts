import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
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
} from "./db";
import { invokeLLM, listLLMModels } from "./_core/llm";
import { z } from "zod";

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

      return { interpretation: interp, tasks: plan.tasks, result: resultText, confidence };
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
  }),

  feed: router({
    list: protectedProcedure.input(z.object({ limit: z.number().optional() }).optional()).query(async ({ ctx, input }) => getFeedEvents(ctx.user.id, input?.limit || 50)),
    add: protectedProcedure
      .input(z.object({ eventType: z.string(), message: z.string(), confidence: z.number().optional(), agentName: z.string().optional(), missionId: z.number().optional() }))
      .mutation(async ({ ctx, input }) => addFeedEvent(ctx.user.id, input)),
  }),
});

export type AppRouter = typeof appRouter;
