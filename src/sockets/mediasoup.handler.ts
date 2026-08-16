import { Server } from 'socket.io'
import { AuthenticatedSocket } from '../types/socket.types.js'
import { mediasoupService } from '../services/mediasoup.service.js'
import { ESocketEvents } from '../constants/socket-events.js'
import { db } from '../db/index.js'
import { conversationMembers } from '../db/schema/conversations.js'
import { eq } from 'drizzle-orm'
import logger from '../utils/logger.js'

export const registerMediasoupHandlers = (io: Server, socket: AuthenticatedSocket) => {
  const currentUserId = socket.user?.id
  const currentUserName = socket.user?.name || 'User'

  // Get Mediasoup Router RTP Capabilities
  socket.on('sfu:get-router-rtp-capabilities', async ({ conversationId }, callback) => {
    try {
      const room = await mediasoupService.getOrCreateRoom(conversationId)
      callback({ rtpCapabilities: room.router.rtpCapabilities })
    } catch (err: any) {
      callback({ error: err.message })
    }
  })

  // Create WebRtcTransport
  socket.on('sfu:create-transport', async ({ conversationId }, callback) => {
    try {
      const transportParams = await mediasoupService.createWebRtcTransport(conversationId)
      callback({ transportParams })
    } catch (err: any) {
      callback({ error: err.message })
    }
  })

  // Connect WebRtcTransport
  socket.on('sfu:connect-transport', async ({ conversationId, transportId, dtlsParameters }, callback) => {
    try {
      await mediasoupService.connectTransport(conversationId, transportId, dtlsParameters)
      callback({ connected: true })
    } catch (err: any) {
      callback({ error: err.message })
    }
  })

  // Produce Media Stream (Publish Audio/Video)
  socket.on('sfu:produce', async ({ conversationId, transportId, kind, rtpParameters }, callback) => {
    try {
      if (!currentUserId) throw new Error('Unauthorized')

      const { id: producerId } = await mediasoupService.produce(
        conversationId,
        transportId,
        kind,
        rtpParameters,
        socket.id,
        currentUserId,
        currentUserName
      )

      // Notify other group call participants of new producer
      socket.to(`conversation:${conversationId}`).emit('sfu:new-producer', {
        producerId,
        kind,
        userId: currentUserId,
        userName: currentUserName,
        socketId: socket.id,
      })

      callback({ id: producerId })
    } catch (err: any) {
      callback({ error: err.message })
    }
  })

  // Consume Media Stream (Receive Audio/Video from another user)
  socket.on('sfu:consume', async ({ conversationId, transportId, producerId, rtpCapabilities }, callback) => {
    try {
      if (!currentUserId) throw new Error('Unauthorized')

      const consumerData = await mediasoupService.consume(
        conversationId,
        transportId,
        producerId,
        rtpCapabilities,
        socket.id,
        currentUserId
      )

      callback({ consumerData })
    } catch (err: any) {
      callback({ error: err.message })
    }
  })

  // Get all existing producers in a room
  socket.on('sfu:get-producers', async ({ conversationId }, callback) => {
    try {
      const producers = mediasoupService.getRoomProducers(conversationId)
      callback({ producers })
    } catch (err: any) {
      callback({ error: err.message })
    }
  })

  // Initiate Group SFU Room — Notify other members (Ringing)
  socket.on('sfu:initiate-call', async ({ conversationId, callType }: { conversationId: string; callType?: string }) => {
    if (!currentUserId) return

    const callNotification = {
      conversationId,
      callType: callType || 'audio',
      callerUserId: currentUserId,
      callerName: currentUserName,
      callerAvatar: socket.user?.avatarUrl || null,
    }

    // Broadcast to conversation room (standard approach)
    socket.to(`conversation:${conversationId}`).emit(ESocketEvents.GROUP_CALL_STARTED, callNotification)

    // Also broadcast to each member's personal user room for reliable delivery
    try {
      const members = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, conversationId))

      for (const member of members) {
        if (member.userId !== currentUserId) {
          io.to(`user:${member.userId}`).emit(ESocketEvents.GROUP_CALL_STARTED, callNotification)
        }
      }

      logger.info('GROUP_CALL_STARTED', {
        meta: { conversationId, callerUserId: currentUserId, notifiedMembers: members.length - 1 }
      })
    } catch (err: any) {
      logger.error('Failed to broadcast group call notification', { error: err.message })
    }
  })

  // Join Group SFU Room silently (When accepting a call)
  socket.on('sfu:join-room', async ({ conversationId, callType }: { conversationId: string; callType?: string }) => {
    // We no longer broadcast GROUP_CALL_STARTED here to avoid infinite ringing
    logger.info('User joined group call silently', {
      meta: { conversationId, userId: currentUserId }
    })
  })

  // Leave Group SFU Call
  socket.on('sfu:leave-room', async ({ conversationId }: { conversationId: string }) => {
    mediasoupService.removeSocketFromRoom(conversationId, socket.id, currentUserId)

    const leaveData = {
      socketId: socket.id,
      userId: currentUserId,
    }

    // Broadcast to conversation room (standard approach)
    socket.to(`conversation:${conversationId}`).emit('sfu:user-left', leaveData)

    // Broadcast to each member's personal user room for 100% reliable delivery
    try {
      const members = await db
        .select({ userId: conversationMembers.userId })
        .from(conversationMembers)
        .where(eq(conversationMembers.conversationId, conversationId))

      for (const member of members) {
        if (member.userId !== currentUserId) {
          io.to(`user:${member.userId}`).emit('sfu:user-left', leaveData)
        }
      }
    } catch (err: any) {
      logger.error('Failed to broadcast user-left notification', { error: err.message })
    }

    // Check if room is now empty — if so, broadcast call ended
    const remainingProducers = mediasoupService.getRoomProducers(conversationId)
    if (remainingProducers.length === 0) {
      socket.to(`conversation:${conversationId}`).emit(ESocketEvents.GROUP_CALL_ENDED, {
        conversationId,
      })
    }
  })
}
