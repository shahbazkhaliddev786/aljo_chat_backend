import jwt from 'jsonwebtoken'
import { Server } from 'socket.io'
import config from '../config/config.js'
import { AuthenticatedSocket } from '../types/socket.types.js'
import logger from '../utils/logger.js'

/** How long a client has to renew after its access token expired. */
const RENEW_GRACE_MS = 60_000
const MAX_TIMEOUT_MS = 2_147_483_647

/**
 * Socket sessions outlive access tokens (calls can last longer than a token).
 * When the token expires the client is asked to renew it in-band with
 * `auth:renew`; only if it does not do so in time is the socket disconnected.
 * This keeps ongoing calls alive while still enforcing token expiry.
 */
export const registerSessionHandlers = (_io: Server, socket: AuthenticatedSocket) => {
  let expiryTimer: NodeJS.Timeout | null = null
  let graceTimer: NodeJS.Timeout | null = null

  const clearTimers = () => {
    if (expiryTimer) clearTimeout(expiryTimer)
    if (graceTimer) clearTimeout(graceTimer)
    expiryTimer = graceTimer = null
  }

  const schedule = () => {
    clearTimers()
    const exp = socket.data.tokenExp as number | undefined
    if (!exp) return
    const ms = Math.min(Math.max(exp * 1000 - Date.now(), 0), MAX_TIMEOUT_MS)
    expiryTimer = setTimeout(() => {
      socket.emit('auth:expired')
      graceTimer = setTimeout(() => {
        logger.info('SOCKET_SESSION_EXPIRED', { meta: { userId: socket.user?.id } })
        socket.disconnect(true)
      }, RENEW_GRACE_MS)
    }, ms)
  }

  socket.on('auth:renew', (payload: { token?: string }, callback: unknown) => {
    const ack = typeof callback === 'function' ? callback : () => {}
    try {
      const decoded = jwt.verify(String(payload?.token), config.JWT_SECRET) as { userId: string; exp?: number }
      if (decoded.userId !== socket.user?.id) throw new Error('Token belongs to another user')
      socket.data.tokenExp = decoded.exp
      schedule()
      ack({ ok: true })
    } catch {
      ack({ error: 'Invalid token' })
    }
  })

  socket.on('disconnect', clearTimers)
  schedule()
}
