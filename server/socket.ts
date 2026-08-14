import { Server as HTTPServer } from "http";
import { Server } from "socket.io";
import { getDb } from "./db";

// In-memory map: userId -> socket ids
const userSockets = new Map<string, Set<string>>();
let _io: Server | null = null;

export function setupSocketIO(httpServer: HTTPServer) {
  const io = new Server(httpServer, {
    cors: { origin: "*", methods: ["GET", "POST"] },
    path: "/socket.io/",
  });

  io.on("connection", (socket) => {
    // userId comes from handshake query — in production this should be validated
    // against the session cookie/JWT. For now we use it as-is for real-time UX.
    const userId = socket.handshake.query.userId as string;
    if (userId) {
      socket.join(`user:${userId}`);
      if (!userSockets.has(userId)) {
        userSockets.set(userId, new Set());
      }
      userSockets.get(userId)!.add(socket.id);

      socket.on("disconnect", () => {
        const sockets = userSockets.get(userId);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) userSockets.delete(userId);
        }
      });

      // Join a shared project room (validated against the collaboration table)
      socket.on("project:join", async (payload: { projectId: number }) => {
        try {
          const projectId = Number(payload?.projectId);
          if (!Number.isFinite(projectId) || projectId <= 0) return;
          const db = await getDb();
          if (!db) return;
          const { projectCollaborations } = await import("../drizzle/schema");
          const { eq: drzEq } = await import("drizzle-orm");
          const rows = await db.select()
            .from(projectCollaborations)
            .where(drzEq(projectCollaborations.projectId, projectId));
          const isCollaborator = rows.some(r => String(r.invitedUserId) === String(userId) && (r.status === "accepted" || r.status === "pending"));
          const project = await db.select()
            .from((await import("../drizzle/schema")).projects)
            .where(drzEq((await import("../drizzle/schema")).projects.id, projectId))
            .limit(1);
          const isOwner = project.length > 0 && String(project[0].userId) === String(userId);
          if (isOwner || isCollaborator) {
            socket.join(`project:${projectId}`);
          }
        } catch {
          // Validation failure — do not join
        }
      });

      socket.on("project:leave", (payload: { projectId: number }) => {
        const projectId = Number(payload?.projectId);
        if (Number.isFinite(projectId) && projectId > 0) {
          socket.leave(`project:${projectId}`);
        }
      });
    }
  });

  _io = io;
  return io;
}

export function getIO(): Server | null {
  return _io;
}

export function broadcastCognitiveEvent(userId: string, eventType: string, message: string, meta?: Record<string, unknown>) {
  if (_io) {
    _io.to(`user:${userId}`).emit("cognitive:feed", {
      eventType,
      message,
      timestamp: Date.now(),
      ...meta,
    });
  }
}

export function broadcastMissionUpdate(userId: string, missionId: number, status: string, data?: Record<string, unknown>) {
  if (_io) {
    _io.to(`user:${userId}`).emit("mission:update", { missionId, status, ...data });
  }
}

// Join a socket to one or more project rooms (shared collaboration feed)
export function joinProjectRooms(socketId: string, userId: string, projectIds: (string | number)[]) {
  if (!_io) return;
  const ns = _io.sockets.sockets.get(socketId);
  if (!ns) return;
  for (const pid of projectIds) {
    ns.join(`project:${pid}`);
  }
}

export function leaveProjectRooms(socketId: string, projectIds: (string | number)[]) {
  if (!_io) return;
  const ns = _io.sockets.sockets.get(socketId);
  if (!ns) return;
  for (const pid of projectIds) {
    ns.leave(`project:${pid}`);
  }
}

export function broadcastProjectMessage(projectId: number, payload: {
  id?: number; userId: number; userName: string | null; content: string; createdAt: Date;
}) {
  if (_io) {
    _io.to(`project:${projectId}`).emit("project:message", { projectId, ...payload, timestamp: Date.now() });
  }
}

export function broadcastProjectMissionUpdate(projectId: number, missionId: number, status: string, data?: Record<string, unknown>) {
  if (_io) {
    _io.to(`project:${projectId}`).emit("project:missionUpdate", { projectId, missionId, status, ...data, timestamp: Date.now() });
  }
}

export { userSockets };
