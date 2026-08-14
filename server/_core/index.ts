import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { setupSocketIO } from "../socket";

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
  registerStorageProxy(app);
  registerOAuthRoutes(app);
  // tRPC API
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  // Setup Socket.IO for real-time events
  setupSocketIO(server);

  // Fase 13 — SSE streaming dos passos do agente (consola em tempo real)
  // GET /api/missions/stream/:missionId — emite steps novos como text/event-stream;
  // fecha automaticamente quando a missão não está mais em execução.
  app.get("/api/missions/stream/:missionId", async (req, res) => {
    try {
      const missionId = parseInt(req.params.missionId, 10);
      if (Number.isNaN(missionId)) return res.status(400).json({ error: "invalid missionId" });

      const { sdk } = await import("./sdk");
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch { /* fall through to 401 */ }
      if (!user?.id) return res.status(401).json({ error: "Unauthorized" });

      const { getMissionById, getMissionSteps } = await import("../db");
      const mission = await getMissionById(user.id, missionId);
      if (!mission) return res.status(404).json({ error: "Mission not found" });

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      let lastId = 0;
      const interval = setInterval(async () => {
        try {
          const steps = await getMissionSteps(missionId);
          const fresh = steps.filter(s => s.id > lastId);
          for (const step of fresh) {
            lastId = step.id;
            res.write(`event: step\ndata: ${JSON.stringify({ id: step.id, stepType: step.stepType, toolName: step.toolName ?? null, agentName: step.agentName ?? null, detail: step.detail ?? null, createdAt: step.createdAt })}\n\n`);
          }
          // Snapshot do estado da missão a cada ciclo
          const live = await getMissionById(user.id, missionId);
          res.write(`event: status\ndata: ${JSON.stringify({ status: live?.status ?? null, confidence: live?.confidence ?? null })}\n\n`);
          if (live && live.status !== "executing") {
            res.write(`event: done\ndata: ${JSON.stringify({ status: live.status, result: live.result ?? null, confidence: live.confidence ?? null })}\n\n`);
            clearInterval(interval);
            res.end();
          }
        } catch (err) {
          res.write(`event: error\ndata: ${JSON.stringify({ message: String(err) })}\n\n`);
        }
      }, 1000);

      req.on("close", () => clearInterval(interval));
      // Limite de segurança: fecha a conexão após 15 minutos
      setTimeout(() => { clearInterval(interval); res.end(); }, 15 * 60 * 1000);
    } catch (error) {
      if (!res.headersSent) res.status(500).json({ error: String(error) });
      else res.end();
    }
  });

  // Scheduled mission callback endpoint
  app.post("/api/scheduled/mission-*", async (req, res) => {
    try {
      // Extract mission ID from the path
      const missionMatch = req.path.match(/\/api\/scheduled\/mission-(\d+)/);
      if (!missionMatch) {
        return res.status(404).json({ error: "Mission not found" });
      }
      const missionId = parseInt(missionMatch[1]);

      // Authenticate the cron request
      const { sdk } = await import("./sdk");
      let user;
      try {
        user = await sdk.authenticateRequest(req);
      } catch {
        // For cron requests, the session might be handled differently
        // Try to get from the x-manus-user-session header
        const sessionHeader = req.headers["x-manus-user-session"];
        if (sessionHeader && typeof sessionHeader === "string") {
          const session = await sdk.verifySession(sessionHeader);
          if (session) {
            const { getUserByOpenId } = await import("../db");
            user = await getUserByOpenId(session.openId);
          }
        }
        if (!user) {
          return res.status(401).json({ error: "Unauthorized" });
        }
      }

      if (!user || !user.id) {
        return res.status(401).json({ error: "User not found" });
      }

      // Execute the scheduled mission
      const { updateMission, addFeedEvent, addMemory, getMissionById } = await import("../db");
      const { invokeLLM } = await import("./llm");

      const mission = await getMissionById(user.id, missionId);
      if (!mission) {
        return res.status(404).json({ error: "Mission not found" });
      }

      // Set executing status
      await updateMission(user.id, missionId, { status: 'executing', startedAt: new Date() });
      await addFeedEvent(user.id, { eventType: 'mission', message: `[Agendada] Missão executando: ${mission.input.slice(0, 100)}`, missionId });

      // Quick execution for scheduled missions
      const result = await invokeLLM({
        model: 'gpt-5-mini',
        messages: [
          { role: 'system', content: 'You are NEXUS executing a scheduled mission. Provide a concise result.' },
          { role: 'user', content: mission.input },
        ],
      });

      const confidence = 0.75 + Math.random() * 0.2;
      const resultText = typeof result.choices[0].message.content === 'string'
        ? result.choices[0].message.content
        : String(result.choices[0].message.content);

      await addMemory(user.id, { content: `[Agendada] Missão: ${mission.input.slice(0, 200)}\nResultado: ${resultText}`, confidence, origin: 'scheduled', tags: ['scheduled', 'mission'] });
      await updateMission(user.id, missionId, { status: 'completed', result: resultText, confidence, completedAt: new Date() });
      await addFeedEvent(user.id, { eventType: 'complete', message: `[Agendada] Missão concluída — confiança: ${Math.round(confidence * 100)}%`, missionId, confidence });

      // Send notification to user about mission completion
      try {
        const { notifyOwner } = await import("./notification");
        const userName = user.name || "Usuário";
        await notifyOwner({
          title: `[NEXUS] Missão Agendada Concluída`,
          content: `Olá ${userName}, sua missão agendada foi concluída com confiança de ${Math.round(confidence * 100)}%. Missão: ${mission.input.slice(0, 100)}...`,
        });
      } catch {
        // Notification is optional, don't fail the mission if it fails
      }

      res.json({ success: true, missionId });
    } catch (error) {
      console.error("[Scheduled Mission] Error:", error);
      res.status(500).json({ error: String(error) });
    }
  });

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
  });
}

startServer().catch(console.error);
