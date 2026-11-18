import { randomUUID } from 'crypto'
import { Server } from 'socket.io'
import { AuthenticatedSocket } from '../types/socket.types.js'
import { assertMembership, getMemberUserIds } from '../services/membership.service.js'
import { userRoom } from './rooms.js'
import logger from '../utils/logger.js'
import { badRequest, conflict, notFound, publicErrorMessage, unauthorized } from '../utils/app-error.js'

/**
 * 1-on-1 call signaling.
 *
 * The server owns the call state: a call is created by `call:invite`, bound to
 * the two participating sockets on `call:accept`, and every signaling message
 * (offer/answer/ICE/end) is relayed only between those two sockets. Clients
 * never address a socket id directly, so they cannot inject signaling into
 * calls they are not part of.
 */

type Ack = (response: Record<string, unknown>) => void
const safeAck = (callback: unknown): Ack => (typeof callback === 'function' ? (callback as Ack) : () => {})

const RING_TIMEOUT_MS = 45_000

interface DirectCall {
  callId: string
  conversationId: string
  callType: 'audio' | 'video'
  callerUserId: string
  callerSocketId: string
  calleeUserId: string
  calleeSocketId: string | null
  ringTimer: NodeJS.Timeout | null
}

const calls = new Map<string, DirectCall>()

const findCallBySocket = (socketId: string) => {
  for (const call of calls.values()) {
    if (call.callerSocketId === socketId || call.calleeSocketId === socketId) return call
  }
  return undefined
}

const isUserInCall = (userId: string) => {
  for (const call of calls.values()) {
    if (call.callerUserId === userId || call.calleeUserId === userId) return true
  }
  return false
}

const removeCall = (call: DirectCall) => {
  if (call.ringTimer) clearTimeout(call.ringTimer)
  calls.delete(call.callId)
}

/** The socket on the other side of the call, or the callee's user room while ringing. */
const otherParty = (call: DirectCall, socketId: string): string | null => {
  if (socketId === call.callerSocketId) return call.calleeSocketId ?? userRoom(call.calleeUserId)
  if (socketId === call.calleeSocketId) return call.callerSocketId
  return null
}

/** End a call and notify the other side. */
const endCall = (io: Server, call: DirectCall, endedBySocketId: string | null, reason: string) => {
  removeCall(call)
  const payload = { callId: call.callId, conversationId: call.conversationId, reason }

  if (endedBySocketId) {
    const target = otherParty(call, endedBySocketId)
    if (target) io.to(target).emit('call:ended', payload)
  } else {
    // Ended by the server (e.g. timeout): notify both sides.
    io.to(call.callerSocketId).emit('call:ended', payload)
    io.to(call.calleeSocketId ?? userRoom(call.calleeUserId)).emit('call:ended', payload)
  }
}

/** End any 1-on-1 call this socket is part of. Called on disconnect. */
export const handleDirectCallDisconnect = async (io: Server, socket: AuthenticatedSocket) => {
  const call = findCallBySocket(socket.id)
  if (call) endCall(io, call, socket.id, 'disconnected')

  // A call ringing for this user cannot be answered once their last socket is gone.
  const userId = socket.user?.id
  if (!userId) return
  const ringing = Array.from(calls.values()).filter((c) => c.calleeUserId === userId && !c.calleeSocketId)
  if (ringing.length === 0) return
  const remainingSockets = await io.in(userRoom(userId)).fetchSockets()
  if (remainingSockets.length > 0) return
  for (const c of ringing) {
    if (calls.has(c.callId)) endCall(io, c, null, 'unavailable')
  }
}

export const registerCallHandlers = (io: Server, socket: AuthenticatedSocket) => {
  const currentUserId = socket.user?.id

  const on = (event: string, handler: (payload: any, ack: Ack, userId: string) => Promise<void> | void) => {
    socket.on(event, async (payload: any, callback: unknown) => {
      const ack = safeAck(callback)
      try {
        if (!currentUserId) throw unauthorized()
        await handler(payload || {}, ack, currentUserId)
      } catch (err: any) {
        logger.warn('CALL_EVENT_FAILED', { meta: { event, userId: currentUserId, error: err.message } })
        ack({ error: publicErrorMessage(err) })
      }
    })
  }

  /** Look up a call and check this socket is one of its two bound participants. */
  const getOwnCall = (callId: unknown): DirectCall => {
    const call = typeof callId === 'string' ? calls.get(callId) : undefined
    if (!call || (call.callerSocketId !== socket.id && call.calleeSocketId !== socket.id)) {
      throw notFound('Call not found')
    }
    return call
  }

  // Caller starts a call. Ack: { callId } or { error, code }.
  on('call:invite', async ({ conversationId, callType }, ack, userId) => {
    await assertMembership(conversationId, userId, 'direct')

    const calleeUserId = (await getMemberUserIds(conversationId)).find((id) => id !== userId)
    if (!calleeUserId) throw badRequest('No one to call in this conversation')

    if (findCallBySocket(socket.id) || isUserInCall(userId)) {
      return ack({ error: 'You are already in a call', code: 'self-busy' })
    }
    if (isUserInCall(calleeUserId)) {
      return ack({ error: 'User is busy on another call', code: 'busy' })
    }
    const calleeSockets = await io.in(userRoom(calleeUserId)).fetchSockets()
    if (calleeSockets.length === 0) {
      return ack({ error: 'User is offline', code: 'offline' })
    }

    const call: DirectCall = {
      callId: randomUUID(),
      conversationId,
      callType: callType === 'video' ? 'video' : 'audio',
      callerUserId: userId,
      callerSocketId: socket.id,
      calleeUserId,
      calleeSocketId: null,
      ringTimer: null
    }
    call.ringTimer = setTimeout(() => {
      if (calls.get(call.callId) && !call.calleeSocketId) endCall(io, call, null, 'no-answer')
    }, RING_TIMEOUT_MS)
    calls.set(call.callId, call)

    io.to(userRoom(calleeUserId)).emit('call:incoming', {
      callId: call.callId,
      conversationId,
      callType: call.callType,
      callerUserId: userId,
      callerName: socket.user?.name || 'User',
      callerAvatar: socket.user?.avatarUrl || null
    })

    ack({ callId: call.callId })
  })

  // Callee accepts on this socket; other tabs of the callee stop ringing.
  on('call:accept', ({ callId }, ack, userId) => {
    const call = typeof callId === 'string' ? calls.get(callId) : undefined
    if (!call || call.calleeUserId !== userId) throw notFound('Call not found')
    if (call.calleeSocketId) throw conflict('Call already answered')

    call.calleeSocketId = socket.id
    if (call.ringTimer) clearTimeout(call.ringTimer)
    call.ringTimer = null

    socket.to(userRoom(userId)).emit('call:ended', {
      callId,
      conversationId: call.conversationId,
      reason: 'answered-elsewhere'
    })
    io.to(call.callerSocketId).emit('call:accepted', { callId })
    ack({ ok: true })
  })

  // Callee declines (or is busy) before answering.
  on('call:reject', ({ callId, reason }, ack, userId) => {
    const call = typeof callId === 'string' ? calls.get(callId) : undefined
    if (!call || call.calleeUserId !== userId || call.calleeSocketId) throw notFound('Call not found')

    removeCall(call)
    const safeReason = reason === 'busy' ? 'busy' : 'declined'
    io.to(call.callerSocketId).emit('call:rejected', { callId, reason: safeReason })
    socket.to(userRoom(userId)).emit('call:ended', {
      callId,
      conversationId: call.conversationId,
      reason: safeReason
    })
    ack({ ok: true })
  })

  // SDP / ICE relay — only between the two bound sockets of an answered call.
  const relay = (event: string, field: 'sdp' | 'candidate') =>
    on(event, (payload, ack) => {
      const call = getOwnCall(payload.callId)
      if (!call.calleeSocketId) throw badRequest('Call not answered yet')
      const target = otherParty(call, socket.id)
      if (target) io.to(target).emit(event, { callId: call.callId, [field]: payload[field] })
      ack({ ok: true })
    })

  // Mic / camera on-off indicator for the other side.
  on('call:media-state', ({ callId, audio, video }, ack) => {
    const call = getOwnCall(callId)
    const target = otherParty(call, socket.id)
    if (target) io.to(target).emit('call:media-state', { callId, audio: audio !== false, video: video !== false })
    ack({ ok: true })
  })

  relay('call:offer', 'sdp')
  relay('call:answer', 'sdp')
  relay('ice:candidate', 'candidate')

  // Either side hangs up (the caller may also cancel while ringing).
  on('call:end', ({ callId }, ack) => {
    const call = getOwnCall(callId)
    endCall(io, call, socket.id, 'ended')
    ack({ ok: true })
  })
}
