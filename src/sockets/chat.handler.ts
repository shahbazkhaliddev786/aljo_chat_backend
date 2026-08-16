import { Server } from 'socket.io'
import { AuthenticatedSocket, ISendMessagePayload, IReadReceiptPayload } from '../types/socket.types.js'
import { ESocketEvents } from '../constants/socket-events.js'
import { createMessage, markMessageAsRead } from '../services/message.service.js'
import logger from '../utils/logger.js'

export const registerChatHandlers = (io: Server, socket: AuthenticatedSocket) => {
  // Join conversation room explicitly
  socket.on(ESocketEvents.JOIN_CONVERSATION, ({ conversationId }: { conversationId: string }) => {
    if (!conversationId) return
    const roomName = `conversation:${conversationId}`
    socket.join(roomName)
    logger.info('SOCKET_JOIN_ROOM', { meta: { userId: socket.user?.id, room: roomName } })
  })

  // Leave conversation room
  socket.on(ESocketEvents.LEAVE_CONVERSATION, ({ conversationId }: { conversationId: string }) => {
    if (!conversationId) return
    const roomName = `conversation:${conversationId}`
    socket.leave(roomName)
    logger.info('SOCKET_LEAVE_ROOM', { meta: { userId: socket.user?.id, room: roomName } })
  })

  // Send real-time chat message
  socket.on(ESocketEvents.SEND_MESSAGE, async (payload: ISendMessagePayload) => {
    if (!socket.user || !payload.conversationId) return

    try {
      const message = await createMessage({
        conversationId: payload.conversationId,
        senderId: socket.user.id,
        content: payload.content,
        type: payload.type,
        mediaUrl: payload.mediaUrl,
        replyToId: payload.replyToId,
        isEncrypted: payload.isEncrypted,
        ciphertext: payload.ciphertext,
        iv: payload.iv
      })

      // Broadcast message to conversation room and all member personal user rooms
      io.to(`conversation:${payload.conversationId}`).emit(ESocketEvents.RECEIVE_MESSAGE, message)

      if (message.memberUserIds && Array.isArray(message.memberUserIds)) {
        for (const memberId of message.memberUserIds) {
          io.to(`user:${memberId}`).emit(ESocketEvents.RECEIVE_MESSAGE, message)
        }
      }
    } catch (error: any) {
      logger.error('SOCKET_SEND_MESSAGE_ERROR', { error: error.message })
      socket.emit('error', { message: error.message })
    }
  })

  // Read receipt event
  socket.on(ESocketEvents.MESSAGE_READ, async ({ conversationId, messageId }: IReadReceiptPayload) => {
    if (!socket.user || !conversationId || !messageId) return

    try {
      await markMessageAsRead(conversationId, socket.user.id, messageId)

      socket.to(`conversation:${conversationId}`).emit(ESocketEvents.MESSAGE_READ, {
        conversationId,
        userId: socket.user.id,
        messageId
      })
    } catch (error: any) {
      logger.error('SOCKET_READ_RECEIPT_ERROR', { error: error.message })
    }
  })
}
