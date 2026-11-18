import type { Request, Response } from 'express'
import { createHmac } from 'crypto'
import { asyncHandler } from '../utils/async.handler.js'
import { apiResponse } from '../utils/api.response.js'
import config from '../config/config.js'

/**
 * ICE servers for WebRTC (used by both 1-on-1 P2P calls and the SFU).
 *
 * With coturn's `use-auth-secret`, credentials are minted per user and expire
 * (TURN REST API: username = "<expiry>:<userId>", credential = HMAC-SHA1).
 */
export const getIceServers = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const { STUN_URLS, TURN_URLS, TURN_STATIC_AUTH_SECRET, TURN_USERNAME, TURN_CREDENTIAL, TURN_TTL_SECONDS } =
    config.ICE

  const iceServers: Array<{ urls: string[]; username?: string; credential?: string }> = []
  if (STUN_URLS.length > 0) iceServers.push({ urls: STUN_URLS })

  if (TURN_URLS.length > 0) {
    if (TURN_STATIC_AUTH_SECRET) {
      const username = `${Math.floor(Date.now() / 1000) + TURN_TTL_SECONDS}:${userId}`
      const credential = createHmac('sha1', TURN_STATIC_AUTH_SECRET).update(username).digest('base64')
      iceServers.push({ urls: TURN_URLS, username, credential })
    } else if (TURN_USERNAME && TURN_CREDENTIAL) {
      iceServers.push({ urls: TURN_URLS, username: TURN_USERNAME, credential: TURN_CREDENTIAL })
    }
  }

  return apiResponse(res, 200, 'success', 'ICE servers retrieved', { iceServers, ttlSeconds: TURN_TTL_SECONDS })
})
