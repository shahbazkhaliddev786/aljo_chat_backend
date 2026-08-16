import { Server } from 'socket.io'
import { AuthenticatedSocket } from '../types/socket.types.js'
import { ESocketEvents } from '../constants/socket-events.js'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { conversationMembers } from '../db/schema/conversations.js'
import { eq } from 'drizzle-orm'
import logger from '../utils/logger.js'

export const handlePresenceOnConnect = async (io: Server, socket: AuthenticatedSocket) => {
  if (!socket.user) return

  try {
    // 1. Join personal user room
    const userRoom = `user:${socket.user.id}`
    socket.join(userRoom)

    // 2. Join all conversation rooms where user is a member
    const userMemberships = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, socket.user.id))

    for (const membership of userMemberships) {
      socket.join(`conversation:${membership.conversationId}`)
    }

    // 3. Update status to online in database
    await db
      .update(users)
      .set({ status: 'online', lastSeen: new Date(), updatedAt: new Date() })
      .where(eq(users.id, socket.user.id))

    // 4. Broadcast presence update
    io.emit(ESocketEvents.USER_ONLINE, {
      userId: socket.user.id,
      status: 'online'
    })

    logger.info('USER_CONNECTED', {
      meta: {
        userId: socket.user.id,
        socketId: socket.id,
        joinedRooms: userMemberships.length + 1
      }
    })
  } catch (error: any) {
    logger.error('Error setting online status', { error: error.message })
  }
}

import { mediasoupService } from '../services/mediasoup.service.js'

export const handlePresenceOnDisconnect = async (io: Server, socket: AuthenticatedSocket) => {
  if (!socket.user) return

  try {
    // 1. Clean up SFU ghost streams using both socket.id and user.id
    const affectedRooms = mediasoupService.removeSocketFromAllRooms(socket.id, socket.user.id)
    for (const conversationId of affectedRooms) {
      const leaveData = {
        socketId: socket.id,
        userId: socket.user.id,
      }

      socket.to(`conversation:${conversationId}`).emit('sfu:user-left', leaveData)

      try {
        const members = await db
          .select({ userId: conversationMembers.userId })
          .from(conversationMembers)
          .where(eq(conversationMembers.conversationId, conversationId))

        for (const member of members) {
          if (member.userId !== socket.user.id) {
            io.to(`user:${member.userId}`).emit('sfu:user-left', leaveData)
          }
        }
      } catch (err: any) {
        logger.error('Failed to broadcast user-left notification on disconnect', { error: err.message })
      }
    }

    const lastSeen = new Date()
    await db
      .update(users)
      .set({ status: 'offline', lastSeen, updatedAt: new Date() })
      .where(eq(users.id, socket.user.id))

    io.emit(ESocketEvents.USER_OFFLINE, {
      userId: socket.user.id,
      status: 'offline',
      lastSeen
    })

    logger.info('USER_DISCONNECTED', { meta: { userId: socket.user.id, socketId: socket.id } })
  } catch (error: any) {
    logger.error('Error setting offline status', { error: error.message })
  }
}
