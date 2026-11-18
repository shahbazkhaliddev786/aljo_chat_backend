import { Server } from 'socket.io'
import { AuthenticatedSocket } from '../types/socket.types.js'
import { mediasoupService, LeaveResult } from '../services/mediasoup.service.js'
import { ESocketEvents } from '../constants/socket-events.js'
import { assertMembership, getMemberUserIds } from '../services/membership.service.js'
import { conversationRoom, userRooms } from './rooms.js'
import logger from '../utils/logger.js'

type Ack = (response: Record<string, unknown>) => void

const safeAck = (callback: unknown): Ack => (typeof callback === 'function' ? (callback as Ack) : () => {})

/**
 * Tell the remaining participants that a socket left, and if the call is now
 * empty tell every member of the conversation so any ringing UI is dismissed.
 */
export const notifyCallLeave = (io: Server, result: LeaveResult) => {
  const remaining = mediasoupService.getPeerSocketIds(result.conversationId)
  if (remaining.length > 0) {
    io.to(remaining).emit('sfu:user-left', {
      conversationId: result.conversationId,
      socketId: result.socketId,
      userId: result.userId
    })
  }

  if (result.roomClosed) {
    io.to(conversationRoom(result.conversationId)).emit(ESocketEvents.GROUP_CALL_ENDED, {
      conversationId: result.conversationId
    })
  }
}

export const registerMediasoupHandlers = (io: Server, socket: AuthenticatedSocket) => {
  const currentUserId = socket.user?.id
  const currentUserName = socket.user?.name || 'User'

  /**
   * Wraps a handler with: auth check, ack safety and uniform error reporting.
   * Every SFU operation after `sfu:join-room` is additionally scoped to the
   * socket's own peer inside mediasoupService (throws if not in the call).
   */
  const on = (event: string, handler: (payload: any, ack: Ack, userId: string) => Promise<void>) => {
    socket.on(event, async (payload: any, callback: unknown) => {
      const ack = safeAck(callback)
      try {
        if (!currentUserId) throw new Error('Unauthorized')
        await handler(payload || {}, ack, currentUserId)
      } catch (err: any) {
        logger.warn('SFU_EVENT_FAILED', { meta: { event, userId: currentUserId, error: err.message } })
        ack({ error: err.message })
      }
    })
  }

  // Join the call: membership-checked entry point. Returns router capabilities.
  on('sfu:join-room', async ({ conversationId }, ack, userId) => {
    await assertMembership(conversationId, userId, 'group')
    const { rtpCapabilities } = await mediasoupService.joinRoom(conversationId, socket.id, userId, currentUserName)
    ack({ rtpCapabilities })
  })

  on('sfu:create-transport', async ({ conversationId }, ack) => {
    const transportParams = await mediasoupService.createWebRtcTransport(conversationId, socket.id)
    ack({ transportParams })
  })

  on('sfu:connect-transport', async ({ conversationId, transportId, dtlsParameters }, ack) => {
    await mediasoupService.connectTransport(conversationId, socket.id, transportId, dtlsParameters)
    ack({ connected: true })
  })

  on('sfu:produce', async ({ conversationId, transportId, kind, rtpParameters }, ack, userId) => {
    const { id: producerId } = await mediasoupService.produce(
      conversationId,
      socket.id,
      transportId,
      kind,
      rtpParameters
    )

    // Only participants of the call need to know about new media.
    const others = mediasoupService.getPeerSocketIds(conversationId, socket.id)
    if (others.length > 0) {
      io.to(others).emit('sfu:new-producer', {
        conversationId,
        producerId,
        kind,
        userId,
        userName: currentUserName,
        socketId: socket.id
      })
    }

    ack({ id: producerId })
  })

  on('sfu:consume', async ({ conversationId, transportId, producerId, rtpCapabilities }, ack) => {
    const consumerData = await mediasoupService.consume(
      conversationId,
      socket.id,
      transportId,
      producerId,
      rtpCapabilities
    )
    ack({ consumerData })
  })

  on('sfu:get-producers', async ({ conversationId }, ack) => {
    if (!mediasoupService.isInRoom(conversationId, socket.id)) throw new Error('You are not in this call')
    ack({ producers: mediasoupService.getOtherProducers(conversationId, socket.id) })
  })

  // Ring the other members of the group.
  on('sfu:initiate-call', async ({ conversationId, callType }, ack, userId) => {
    await assertMembership(conversationId, userId, 'group')

    const callNotification = {
      conversationId,
      callType: callType === 'video' ? 'video' : 'audio',
      callerUserId: userId,
      callerName: currentUserName,
      callerAvatar: socket.user?.avatarUrl || null
    }

    const memberIds = (await getMemberUserIds(conversationId)).filter((id) => id !== userId)
    if (memberIds.length > 0) {
      // One emit to several rooms: each socket receives the event exactly once.
      io.to(userRooms(memberIds)).emit(ESocketEvents.GROUP_CALL_STARTED, callNotification)
    }

    logger.info('GROUP_CALL_STARTED', {
      meta: { conversationId, callerUserId: userId, notifiedMembers: memberIds.length }
    })
    ack({ ok: true })
  })

  on('sfu:leave-room', async ({ conversationId }, ack) => {
    const result = mediasoupService.leaveRoom(conversationId, socket.id)
    if (result) notifyCallLeave(io, result)
    ack({ ok: true })
  })
}
