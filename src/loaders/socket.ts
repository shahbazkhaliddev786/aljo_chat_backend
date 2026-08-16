import { Server as HttpServer } from 'http'
import { Server as SocketServer } from 'socket.io'
import config from '../config/config.js'
import { socketAuthMiddleware } from '../middlewares/socket-auth.middleware.js'
import { initializeSocketHandlers } from '../sockets/index.js'
import logger from '../utils/logger.js'

let ioInstance: SocketServer | null = null

export const getIO = (): SocketServer => {
  if (!ioInstance) {
    throw new Error('Socket.io is not initialized')
  }
  return ioInstance
}

export default async function socketLoader(httpServer: HttpServer): Promise<SocketServer> {
  const io = new SocketServer(httpServer, {
    cors: {
      origin: config.CLIENT_URL || true,
      credentials: true,
      methods: ['GET', 'POST']
    },
    pingTimeout: 60000,
    pingInterval: 25000
  })

  ioInstance = io

  // Attach JWT Authentication Middleware for WebSockets
  io.use((socket, next) => socketAuthMiddleware(socket as any, next))

  // Attach Socket Event Handlers (Presence, Messaging, Typing)
  initializeSocketHandlers(io)

  logger.info('SOCKET_INITIALIZED', { meta: { status: 'Socket.io server listening for real-time events' } })

  return io
}
