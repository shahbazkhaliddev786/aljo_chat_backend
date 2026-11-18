import jwt from 'jsonwebtoken'
import config from '../config/config.js'
import { AuthenticatedSocket } from '../types/socket.types.js'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { eq } from 'drizzle-orm'
import logger from '../utils/logger.js'

export const socketAuthMiddleware = async (socket: AuthenticatedSocket, next: (err?: Error) => void) => {
  try {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '')

    if (!token) {
      return next(new Error('Authentication failed: No token provided'))
    }

    const payload = jwt.verify(token, config.JWT_SECRET) as { userId: string; exp?: number }

    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatarUrl: users.avatarUrl
      })
      .from(users)
      .where(eq(users.id, payload.userId))
      .limit(1)

    if (!user) {
      return next(new Error('Authentication failed: User not found'))
    }

    socket.user = user
    // Used by the session handler to ask the client to renew before the token expires.
    socket.data.tokenExp = payload.exp
    next()
  } catch (error: any) {
    logger.warn('Socket Authentication Error', { error: error.message })
    return next(new Error('Authentication failed: Invalid or expired token'))
  }
}
