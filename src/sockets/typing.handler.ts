import { Server } from 'socket.io'
import { AuthenticatedSocket, ITypingPayload } from '../types/socket.types.js'
import { ESocketEvents } from '../constants/socket-events.js'

export const registerTypingHandlers = (io: Server, socket: AuthenticatedSocket) => {
  socket.on(ESocketEvents.TYPING_START, ({ conversationId }: ITypingPayload) => {
    if (!socket.user || !conversationId) return

    socket.to(`conversation:${conversationId}`).emit(ESocketEvents.TYPING_START, {
      conversationId,
      userId: socket.user.id,
      userName: socket.user.name
    })
  })

  socket.on(ESocketEvents.TYPING_STOP, ({ conversationId }: ITypingPayload) => {
    if (!socket.user || !conversationId) return

    socket.to(`conversation:${conversationId}`).emit(ESocketEvents.TYPING_STOP, {
      conversationId,
      userId: socket.user.id,
      userName: socket.user.name
    })
  })
}
