import type { Request, Response, NextFunction } from 'express'
import arcjet, { fixedWindow, shield, detectBot } from '@arcjet/node'
import config from '../config/config.js'
import { apiResponse } from '../utils/api.response.js'
import logger from '../utils/logger.js'
import { EApplicationEnvironment } from '../constants/application.js'

// Initialize Arcjet client
const aj = config.ARCJET_KEY
  ? arcjet({
      key: config.ARCJET_KEY,
      rules: [
        shield({ mode: 'LIVE' }),
        detectBot({ mode: 'LIVE', allow: [] }),
        fixedWindow({
          mode: 'LIVE',
          window: '60s',
          max: 100 // 100 requests per minute
        })
      ]
    })
  : null

export const arcjetMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  // Skip Arcjet in development if ARCJET_KEY is not configured
  if (!aj || config.ENV === EApplicationEnvironment.DEVELOPMENT) {
    return next()
  }

  try {
    const decision = await aj.protect(req)

    if (decision.isDenied()) {
      if (decision.reason.isRateLimit()) {
        logger.warn('Arcjet Rate Limit Exceeded', { ip: req.ip, path: req.path })
        return apiResponse(res, 429, 'error', 'Too many requests. Please try again later.')
      }

      if (decision.reason.isBot()) {
        logger.warn('Arcjet Bot Detected', { ip: req.ip, path: req.path })
        return apiResponse(res, 403, 'error', 'Bot traffic is not permitted.')
      }

      if (decision.reason.isShield()) {
        logger.warn('Arcjet Shield Triggered', { ip: req.ip, path: req.path })
        return apiResponse(res, 403, 'error', 'Suspicious activity detected.')
      }

      return apiResponse(res, 403, 'error', 'Access denied by security policies.')
    }

    next()
  } catch (error: any) {
    logger.error('Arcjet Middleware Failure', { error: error.message })
    // Fail open in case of Arcjet service degradation
    next()
  }
}
