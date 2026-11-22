import { Server } from 'socket.io'
import { AuthenticatedSocket } from '../types/socket.types.js'
import { ESocketEvents } from '../constants/socket-events.js'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { conversationMembers } from '../db/schema/conversations.js'
import { eq } from 'drizzle-orm'
import logger from '../utils/logger.js'
import { mediasoupService } from '../services/mediasoup.service.js'
import { notifyCallLeave } from './mediasoup.handler.js'
import { handleDirectCallDisconnect } from './call.handler.js'
import { conversationRoom, userRoom } from './rooms.js'

/** Conversation rooms in a list of room names (presence goes to contacts only). */
const contactRooms = (rooms: Iterable<string>) => Array.from(rooms).filter((r) => r.startsWith('conversation:'))

export const handlePresenceOnConnect = async (io: Server, socket: AuthenticatedSocket) => {
  if (!socket.user) return
  const userId = socket.user.id

  try {
    // 1. Personal room + a room for every conversation the user belongs to
    socket.join(userRoom(userId))

    const userMemberships = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId))

    socket.join(userMemberships.map((m) => conversationRoom(m.conversationId)))

    // 2. Only the first tab/device of a user changes their presence.
    const sockets = await io.in(userRoom(userId)).fetchSockets()
    if (sockets.length === 1) {
      await db.update(users).set({ status: 'online', lastSeen: new Date() }).where(eq(users.id, userId))
      const rooms = contactRooms(socket.rooms)
      if (rooms.length > 0) socket.to(rooms).emit(ESocketEvents.USER_ONLINE, { userId, status: 'online' })
    }

    logger.info('USER_CONNECTED', {
      meta: { userId, socketId: socket.id, joinedRooms: userMemberships.length + 1, openSockets: sockets.length }
    })
  } catch (error: any) {
    logger.error('Error setting online status', { meta: { error: error.message } })
  }
}

export const handlePresenceOnDisconnect = async (io: Server, socket: AuthenticatedSocket) => {
  if (!socket.user) return
  const userId = socket.user.id

  try {
    // 1. Tear down any call this socket was part of and notify the other participants.
    await handleDirectCallDisconnect(io, socket)
    for (const result of mediasoupService.removeSocketFromAllRooms(socket.id)) {
      notifyCallLeave(io, result)
    }

    // 2. The user is offline only when their last tab/device disconnects.
    const remaining = await io.in(userRoom(userId)).fetchSockets()
    if (remaining.length === 0) {
      const lastSeen = new Date()
      await db.update(users).set({ status: 'offline', lastSeen }).where(eq(users.id, userId))
      const rooms = contactRooms((socket.data.roomsAtDisconnect as string[] | undefined) ?? [])
      if (rooms.length > 0) io.to(rooms).emit(ESocketEvents.USER_OFFLINE, { userId, status: 'offline', lastSeen })
    }

    logger.info('USER_DISCONNECTED', { meta: { userId, socketId: socket.id, openSockets: remaining.length } })
  } catch (error: any) {
    logger.error('Error setting offline status', { meta: { error: error.message } })
  }
}
