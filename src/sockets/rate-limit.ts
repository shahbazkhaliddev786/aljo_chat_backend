import { AuthenticatedSocket } from '../types/socket.types.js'
import logger from '../utils/logger.js'

/**
 * Per-socket token buckets. Each event category has a burst size and a
 * sustained rate; events over the limit are dropped and, if the client asked
 * for an acknowledgement, answered with a "rate-limited" error.
 */
interface BucketConfig {
  burst: number
  perSecond: number
}

const LIMITS: Record<string, BucketConfig> = {
  message: { burst: 20, perSecond: 5 },
  typing: { burst: 10, perSecond: 3 },
  ice: { burst: 150, perSecond: 50 }, // ICE candidates arrive in bursts at call setup
  call: { burst: 60, perSecond: 20 },
  default: { burst: 30, perSecond: 10 }
}

const categoryOf = (event: string): string => {
  if (event === 'send_message') return 'message'
  if (event === 'typing_start' || event === 'typing_stop') return 'typing'
  if (event === 'ice:candidate') return 'ice'
  if (event.startsWith('call:') || event.startsWith('sfu:')) return 'call'
  return 'default'
}

export const applySocketRateLimit = (socket: AuthenticatedSocket) => {
  const buckets = new Map<string, { tokens: number; updatedAt: number }>()

  const take = (category: string): boolean => {
    const { burst, perSecond } = LIMITS[category]
    const now = Date.now()
    const bucket = buckets.get(category) ?? { tokens: burst, updatedAt: now }
    bucket.tokens = Math.min(burst, bucket.tokens + ((now - bucket.updatedAt) / 1000) * perSecond)
    bucket.updatedAt = now
    const allowed = bucket.tokens >= 1
    if (allowed) bucket.tokens -= 1
    buckets.set(category, bucket)
    return allowed
  }

  socket.use((packet, next) => {
    const [event] = packet
    const category = categoryOf(String(event))
    if (take(category)) return next()

    logger.warn('SOCKET_RATE_LIMITED', { meta: { userId: socket.user?.id, event, category } })
    const ack = packet[packet.length - 1]
    if (typeof ack === 'function') ack({ error: 'Too many requests. Please slow down.', code: 'rate-limited' })
    // Dropped: next() is intentionally not called.
  })
}
