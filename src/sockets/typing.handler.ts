import { Server } from 'socket.io'
import { AuthenticatedSocket, ITypingPayload } from '../types/socket.types.js'
import { ESocketEvents } from '../constants/socket-events.js'
import { conversationRoom } from './rooms.js'

export const registerTypingHandlers = (io: Server, socket: AuthenticatedSocket) => {
  socket.on(ESocketEvents.TYPING_START, ({ conversationId }: ITypingPayload) => {
    // Only members (whose sockets are in the conversation room) may emit typing events.
    if (!socket.user || !conversationId || !socket.rooms.has(conversationRoom(conversationId))) return

    socket.to(conversationRoom(conversationId)).emit(ESocketEvents.TYPING_START, {
      conversationId,
      userId: socket.user.id,
      userName: socket.user.name
    })
  })

  socket.on(ESocketEvents.TYPING_STOP, ({ conversationId }: ITypingPayload) => {
    // Only members (whose sockets are in the conversation room) may emit typing events.
    if (!socket.user || !conversationId || !socket.rooms.has(conversationRoom(conversationId))) return

    socket.to(conversationRoom(conversationId)).emit(ESocketEvents.TYPING_STOP, {
      conversationId,
      userId: socket.user.id,
      userName: socket.user.name
    })
  })
}
