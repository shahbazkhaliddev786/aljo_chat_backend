import { Server } from 'socket.io'
import { AuthenticatedSocket } from '../types/socket.types.js'
import { handlePresenceOnConnect, handlePresenceOnDisconnect } from './presence.handler.js'
import { registerTypingHandlers } from './typing.handler.js'
import { registerChatHandlers } from './chat.handler.js'
import { registerCallHandlers } from './call.handler.js'
import { registerMediasoupHandlers } from './mediasoup.handler.js'
import { registerSessionHandlers } from './session.handler.js'
import { applySocketRateLimit } from './rate-limit.js'

export const initializeSocketHandlers = (io: Server) => {
  io.on('connection', (socket: AuthenticatedSocket) => {
    // 0. Abuse protection and token-expiry handling
    applySocketRateLimit(socket)
    registerSessionHandlers(io, socket)

    // 1. Presence setup on connect
    handlePresenceOnConnect(io, socket)

    // 2. Chat & message event listeners
    registerChatHandlers(io, socket)

    // 3. Typing event listeners
    registerTypingHandlers(io, socket)

    // 4. 1-on-1 Call signaling handlers
    registerCallHandlers(io, socket)

    // 5. Group Mediasoup SFU handlers
    registerMediasoupHandlers(io, socket)

    // 6. Disconnect listeners. Rooms are captured while still joined, because
    //    they are already left by the time 'disconnect' fires.
    socket.on('disconnecting', () => {
      socket.data.roomsAtDisconnect = Array.from(socket.rooms)
    })
    socket.on('disconnect', () => {
      handlePresenceOnDisconnect(io, socket)
    })
  })
}
