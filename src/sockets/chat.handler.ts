import { Server } from 'socket.io'
import { AuthenticatedSocket, ISendMessagePayload, IReadReceiptPayload } from '../types/socket.types.js'
import { ESocketEvents } from '../constants/socket-events.js'
import {
  createMessage,
  markMessageAsRead,
  editMessage,
  deleteMessage,
  toggleReaction
} from '../services/message.service.js'
import { getMembership, isUuid } from '../services/membership.service.js'
import { conversationRoom, userRooms } from './rooms.js'
import logger from '../utils/logger.js'
import { publicErrorMessage } from '../utils/app-error.js'

type Ack = (response: Record<string, unknown>) => void
const safeAck = (callback: unknown): Ack => (typeof callback === 'function' ? (callback as Ack) : () => {})

export const registerChatHandlers = (io: Server, socket: AuthenticatedSocket) => {
  /**
   * Conversation rooms are joined automatically on connect and kept in sync
   * with membership changes, so clients never need to call this. It remains
   * for backwards compatibility and only ever (re)joins a conversation the
   * user is actually a member of.
   */
  socket.on(ESocketEvents.JOIN_CONVERSATION, async (payload: { conversationId?: string }, callback: unknown) => {
    const ack = safeAck(callback)
    const conversationId = payload?.conversationId
    if (!socket.user || !conversationId) return ack({ error: 'conversationId is required' })

    try {
      const membership = await getMembership(conversationId, socket.user.id)
      if (!membership) {
        logger.warn('SOCKET_JOIN_ROOM_DENIED', { meta: { userId: socket.user.id, conversationId } })
        return ack({ error: 'Access denied: Not a member of this conversation' })
      }
      socket.join(conversationRoom(conversationId))
      ack({ ok: true })
    } catch (error: any) {
      logger.error('SOCKET_JOIN_ROOM_ERROR', { error: error.message })
      ack({ error: 'Failed to join conversation' })
    }
  })

  // Intentionally a no-op: leaving the room would stop real-time delivery
  // (messages, calls, typing) for a conversation the user is still a member of.
  socket.on(ESocketEvents.LEAVE_CONVERSATION, () => {})

  // Send real-time chat message. Ack: { message } or { error }.
  socket.on(
    ESocketEvents.SEND_MESSAGE,
    async (payload: ISendMessagePayload & Record<string, any>, callback: unknown) => {
      const ack = safeAck(callback)
      if (!socket.user || !isUuid(payload?.conversationId)) return ack({ error: 'Valid conversationId is required' })

      try {
        const message = await createMessage({
          conversationId: payload.conversationId,
          senderId: socket.user.id,
          content: payload.content,
          type: payload.type,
          mediaUrl: payload.mediaUrl,
          replyToId: payload.replyToId,
          isEncrypted: payload.isEncrypted === true,
          ciphertext: payload.ciphertext,
          iv: payload.iv,
          senderPublicKey: payload.senderPublicKey,
          recipientPublicKey: payload.recipientPublicKey,
          keyEnvelopes: payload.keyEnvelopes,
          clientMessageId: payload.clientMessageId
        })

        // One emit to every member's personal room: each socket receives it exactly once.
        io.to(userRooms(message.memberUserIds)).emit(ESocketEvents.RECEIVE_MESSAGE, message)
        ack({ message })
      } catch (error: any) {
        logger.error('SOCKET_SEND_MESSAGE_ERROR', { error: error.message })
        ack({ error: publicErrorMessage(error) })
      }
    }
  )

  // Read receipt event (only for conversations this socket is a member of)
  socket.on(ESocketEvents.MESSAGE_READ, async ({ conversationId, messageId }: IReadReceiptPayload) => {
    if (!socket.user || !isUuid(conversationId) || !isUuid(messageId)) return
    if (!socket.rooms.has(conversationRoom(conversationId))) return

    try {
      const receipt = await markMessageAsRead(conversationId, socket.user.id, messageId)
      // Everyone in the conversation (including the reader's other tabs) updates their view.
      if (receipt) io.to(conversationRoom(conversationId)).emit(ESocketEvents.MESSAGE_READ, receipt)
    } catch (error: any) {
      logger.error('SOCKET_READ_RECEIPT_ERROR', { error: error.message })
    }
  })

  /** Shared wrapper for message actions: auth, ack and safe errors. */
  const action = (event: string, handler: (payload: any, userId: string) => Promise<Record<string, unknown>>) => {
    socket.on(event, async (payload: any, callback: unknown) => {
      const ack = safeAck(callback)
      if (!socket.user) return ack({ error: 'Unauthorized' })
      try {
        ack(await handler(payload || {}, socket.user.id))
      } catch (error: any) {
        logger.warn('SOCKET_MESSAGE_ACTION_FAILED', { meta: { event, error: error.message } })
        ack({ error: publicErrorMessage(error) })
      }
    })
  }

  // Edit your own message (encrypted messages arrive re-encrypted from the client).
  action('edit_message', async (payload, userId) => {
    const { message, memberIds } = await editMessage({ ...payload, userId })
    io.to(userRooms(memberIds)).emit('message_updated', message)
    return { message }
  })

  // Delete your own message for everyone.
  action('delete_message', async ({ messageId }, userId) => {
    const { message, memberIds } = await deleteMessage(messageId, userId)
    io.to(userRooms(memberIds)).emit('message_updated', message)
    return { message }
  })

  // Toggle an emoji reaction.
  action('toggle_reaction', async ({ messageId, emoji }, userId) => {
    const { memberIds, ...result } = await toggleReaction(messageId, userId, emoji)
    io.to(userRooms(memberIds)).emit('message_reactions', result)
    return result
  })
}
