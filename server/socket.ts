import { Server as HTTPServer } from "http";
import { Server } from "socket.io";

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

export { userSockets };
