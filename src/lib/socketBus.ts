import type { Server, Socket } from "socket.io";
import logger from "./logger";

let ioRef: Server | null = null;

export function setIo(io: Server) {
  ioRef = io;
}

export function getIo(): Server {
  if (!ioRef) throw new Error("Socket.IO server not set");
  return ioRef;
}

const USER_ROOM_PREFIX = "user:";

export function userRoom(userId: string) {
  return `${USER_ROOM_PREFIX}${userId}`;
}

export function registerUserSocket(userId: string, socket: Socket) {
  try {
    socket.join(userRoom(userId));
    (socket.data as any).userId = userId;
    logger.info("Socket identified to user room", {
      userId,
      socketId: socket.id,
    });
  } catch (err) {
    logger.error("Failed to register user socket", { err });
  }
}

export function unregisterUserSocket(socket: Socket) {
  try {
    const uid = (socket.data as any)?.userId;
    if (uid) socket.leave(userRoom(uid));
  } catch (err) {
    logger.error("Failed to unregister user socket", { err });
  }
}

export function kickUser(userId: string, message: string) {
  try {
    const io = getIo();
    io.to(userRoom(userId)).emit("auth:kick", { message });
    logger.info("Emitted kick to user room", { userId });
  } catch (err) {
    logger.error("Failed to emit kick", { err, userId });
  }
}

/**
 * Emit an event to a specific user's connected sockets
 * Used for task completion notifications, real-time updates, etc.
 */
export function emitToUser(userId: string, event: string, data: unknown) {
  try {
    const io = getIo();
    io.to(userRoom(userId)).emit(event, data);
    logger.debug("Emitted event to user", { userId, event });
  } catch (err) {
    logger.error("Failed to emit to user", { err, userId, event });
  }
}

/**
 * Emit an event to all connected sockets
 * Used for system-wide broadcasts
 */
export function emitToAll(event: string, data: unknown) {
  try {
    const io = getIo();
    io.emit(event, data);
    logger.debug("Emitted event to all", { event });
  } catch (err) {
    logger.error("Failed to emit to all", { err, event });
  }
}
