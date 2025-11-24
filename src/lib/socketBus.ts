import type { Server, Socket } from 'socket.io'
import logger from './logger'

let ioRef: Server | null = null

export function setIo(io: Server) {
  ioRef = io
}

export function getIo(): Server {
  if (!ioRef) throw new Error('Socket.IO server not set')
  return ioRef
}

const USER_ROOM_PREFIX = 'user:'

export function userRoom(userId: string) {
  return `${USER_ROOM_PREFIX}${userId}`
}

export function registerUserSocket(userId: string, socket: Socket) {
  try {
    socket.join(userRoom(userId));
    (socket.data as any).userId = userId
    logger.info('Socket identified to user room', { userId, socketId: socket.id })
  } catch (err) {
    logger.error('Failed to register user socket', { err })
  }
}

export function unregisterUserSocket(socket: Socket) {
  try {
    const uid = (socket.data as any)?.userId
    if (uid) socket.leave(userRoom(uid))
  } catch (err) {
    logger.error('Failed to unregister user socket', { err })
  }
}

export function kickUser(userId: string, message: string) {
  try {
    const io = getIo()
    io.to(userRoom(userId)).emit('auth:kick', { message })
    logger.info('Emitted kick to user room', { userId })
  } catch (err) {
    logger.error('Failed to emit kick', { err, userId })
  }
}
