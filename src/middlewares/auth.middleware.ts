import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import config from '../config/config.js'
import { apiResponse } from '../utils/api.response.js'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { eq } from 'drizzle-orm'
import logger from '../utils/logger.js'

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return apiResponse(res, 401, 'error', 'Access denied. No token provided.')
    }

    const token = authHeader.split(' ')[1]
    if (!token) {
      return apiResponse(res, 401, 'error', 'Invalid token format')
    }

    const payload = jwt.verify(token, config.JWT_SECRET) as { userId: string }

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
      return apiResponse(res, 401, 'error', 'Invalid token — user not found')
    }

    req.user = user
    next()
  } catch (error: any) {
    logger.warn('Auth Verification Failed', { error: error.message })

    if (error.name === 'TokenExpiredError') {
      return apiResponse(res, 401, 'error', 'Token expired')
    }

    return apiResponse(res, 401, 'error', 'Authentication failed')
  }
}
