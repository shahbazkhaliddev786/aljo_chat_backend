import dotenvFlow from 'dotenv-flow'

dotenvFlow.config()

const ENV = process.env.NODE_ENV || 'development'

/**
 * Reads a required secret. The server refuses to start without it, so a
 * missing variable can never silently fall back to a guessable default.
 */
function requireSecret(name: string, minLength = 32): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`)
  }
  if (ENV === 'production' && value.length < minLength) {
    throw new Error(`${name} must be at least ${minLength} characters in production`)
  }
  return value
}

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing required environment variable: ${name}`)
  return value
}

const csv = (value?: string) =>
  (value || '')
    .split(',')
    .map((v) => v.trim())
    .filter(Boolean)

export const config = {
  PORT: process.env.PORT || 5000,
  ENV,
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:5000',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',

  // Database
  DATABASE_URL: requireEnv('DATABASE_URL'),

  // JWT
  JWT_SECRET: requireSecret('JWT_SECRET'),
  // Short-lived: the frontend renews it with the refresh token.
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '15m',
  REFRESH_TOKEN_SECRET: requireSecret('REFRESH_TOKEN_SECRET'),
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',

  // Mediasoup SFU (group calls)
  MEDIASOUP: {
    // Interface the SFU binds to. 0.0.0.0 listens on all interfaces.
    LISTEN_IP: process.env.MEDIASOUP_LISTEN_IP || '0.0.0.0',
    // Public IP/hostname clients must reach. Required whenever LISTEN_IP is 0.0.0.0 or a private IP.
    ANNOUNCED_ADDRESS: process.env.MEDIASOUP_ANNOUNCED_IP || undefined,
    RTC_MIN_PORT: Number(process.env.MEDIASOUP_RTC_MIN_PORT) || 40000,
    RTC_MAX_PORT: Number(process.env.MEDIASOUP_RTC_MAX_PORT) || 40100
  },

  // ICE servers handed to browsers for both P2P and SFU calls
  ICE: {
    STUN_URLS: csv(process.env.STUN_URLS || 'stun:stun.l.google.com:19302,stun:stun1.l.google.com:19302'),
    TURN_URLS: csv(process.env.TURN_URLS),
    // coturn "use-auth-secret" shared secret → short-lived HMAC credentials (preferred)
    TURN_STATIC_AUTH_SECRET: process.env.TURN_STATIC_AUTH_SECRET || '',
    // Static long-term credentials (fallback, e.g. managed TURN providers)
    TURN_USERNAME: process.env.TURN_USERNAME || '',
    TURN_CREDENTIAL: process.env.TURN_CREDENTIAL || '',
    TURN_TTL_SECONDS: Number(process.env.TURN_TTL_SECONDS) || 24 * 60 * 60
  },

  // Arcjet
  ARCJET_KEY: process.env.ARCJET_KEY || '',

  // Cloudinary
  CLOUDINARY: {
    CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    API_KEY: process.env.CLOUDINARY_API_KEY || '',
    API_SECRET: process.env.CLOUDINARY_API_SECRET || ''
  },

  // SMTP
  SMTP: {
    HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    PORT: Number(process.env.SMTP_PORT) || 587,
    USER: process.env.SMTP_USER || '',
    PASS: process.env.SMTP_PASS || '',
    FROM: process.env.EMAIL_FROM || '"aljo chat" <no-reply@aljochat.com>'
  }
}

export default config
