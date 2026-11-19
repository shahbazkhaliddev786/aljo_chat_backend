import bcrypt from 'bcryptjs'
import { createHash, randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import config from '../config/config.js'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { refreshTokens, emailVerificationTokens } from '../db/schema/tokens.js'
import { sendEmail } from '../utils/email.js'
import logger from '../utils/logger.js'
import { randomBytes } from 'crypto'
import { eq, and, inArray, lt, gt } from 'drizzle-orm'
import { badRequest, conflict, notFound, tooManyRequests, unauthorized } from '../utils/app-error.js'

export interface IRegisterData {
  name: string
  email: string
  password: string
  avatarUrl?: string
  bio?: string
}

export interface ILoginData {
  email: string
  password: string
}

export const generateTokens = (userId: string) => {
  // A unique jti keeps every token distinct, even when issued in the same second.
  const accessToken = jwt.sign({ userId }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as any,
    jwtid: randomUUID()
  })

  const refreshToken = jwt.sign({ userId }, config.REFRESH_TOKEN_SECRET, {
    expiresIn: config.REFRESH_TOKEN_EXPIRES_IN as any,
    jwtid: randomUUID()
  })

  return { accessToken, refreshToken }
}

/** Refresh tokens are stored hashed, so a database leak does not leak usable sessions. */
const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

/** Issue an access + refresh token pair and persist the (hashed) refresh token. */
const issueSession = async (userId: string) => {
  const { accessToken, refreshToken } = generateTokens(userId)
  const { exp } = jwt.decode(refreshToken) as { exp: number }

  // Opportunistically drop this user's expired sessions.
  await db.delete(refreshTokens).where(and(eq(refreshTokens.userId, userId), lt(refreshTokens.expiresAt, new Date())))
  await db.insert(refreshTokens).values({ userId, token: hashToken(refreshToken), expiresAt: new Date(exp * 1000) })

  return { accessToken, refreshToken }
}

export const isEmailTaken = async (email: string) => {
  const [existing] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, String(email).toLowerCase()))
    .limit(1)
  return !!existing
}

export const registerUser = async (data: IRegisterData) => {
  // Check if user exists
  const [existingUser] = await db.select().from(users).where(eq(users.email, data.email.toLowerCase())).limit(1)

  if (existingUser) {
    throw conflict('User with this email already exists')
  }

  const hashedPassword = await bcrypt.hash(data.password, 10)

  const [newUser] = await db
    .insert(users)
    .values({
      name: data.name,
      email: data.email.toLowerCase(),
      password: hashedPassword,
      avatarUrl: data.avatarUrl,
      bio: data.bio
    })
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      isVerified: users.isVerified,
      createdAt: users.createdAt
    })

  const { accessToken, refreshToken } = await issueSession(newUser.id)

  return { user: newUser, accessToken, refreshToken }
}

export const loginUser = async (data: ILoginData) => {
  const [user] = await db.select().from(users).where(eq(users.email, data.email.toLowerCase())).limit(1)

  if (!user) {
    throw unauthorized('Invalid credentials')
  }

  const isPasswordMatch = await bcrypt.compare(data.password, user.password)
  if (!isPasswordMatch) {
    throw unauthorized('Invalid credentials')
  }

  const { accessToken, refreshToken } = await issueSession(user.id)

  const safeUser: Partial<typeof user> = { ...user }
  delete safeUser.password
  delete safeUser.keyBackup
  return { user: safeUser, accessToken, refreshToken }
}

export const refreshAccessToken = async (token: string) => {
  let payload: { userId: string }
  try {
    payload = jwt.verify(token, config.REFRESH_TOKEN_SECRET) as { userId: string }
  } catch {
    throw unauthorized('Invalid or expired refresh token')
  }

  // Consume the token atomically: a refresh token can be used exactly once.
  // (Tokens issued before hashing was introduced are accepted once and rotated.)
  const [storedToken] = await db
    .delete(refreshTokens)
    .where(
      and(
        inArray(refreshTokens.token, [hashToken(token), token]),
        eq(refreshTokens.userId, payload.userId),
        gt(refreshTokens.expiresAt, new Date())
      )
    )
    .returning({ id: refreshTokens.id })

  if (!storedToken) {
    throw unauthorized('Refresh token revoked or not found')
  }

  return issueSession(payload.userId)
}

export const logoutUser = async (userId: string, token?: string) => {
  if (token) {
    await db
      .delete(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), inArray(refreshTokens.token, [hashToken(token), token])))
  } else {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
  }
}

// ---------------------------------------------------------------------------
// Email verification
// ---------------------------------------------------------------------------

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const RESEND_COOLDOWN_MS = 60 * 1000

/** Create a single-use verification link (stored hashed) and email it. */
export const sendVerificationEmail = async (userId: string, email: string, name: string) => {
  const token = randomBytes(32).toString('hex')
  await db.delete(emailVerificationTokens).where(eq(emailVerificationTokens.userId, userId))
  await db.insert(emailVerificationTokens).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS)
  })

  const link = `${config.CLIENT_URL}/verify-email?token=${token}`
  await sendEmail({
    to: email,
    subject: 'Confirm your aljo chat email address',
    text: `Hi ${name}, confirm your email address by opening this link (valid for 24 hours): ${link}`,
    html: `<p>Hi ${escapeHtml(name)},</p><p>Confirm your email address for aljo chat:</p><p><a href="${link}">Confirm email</a></p><p>The link is valid for 24 hours. If you did not create an account, ignore this email.</p>`
  })
}

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')

/** Fire-and-forget variant used at registration: email problems never fail sign-up. */
export const sendVerificationEmailSafely = (userId: string, email: string, name: string) => {
  sendVerificationEmail(userId, email, name).catch((err) =>
    logger.error('VERIFICATION_EMAIL_FAILED', { meta: { userId, error: err.message } })
  )
}

export const verifyEmail = async (token: unknown) => {
  if (typeof token !== 'string' || token.length < 32) throw badRequest('Invalid verification link')
  const [row] = await db
    .delete(emailVerificationTokens)
    .where(
      and(eq(emailVerificationTokens.tokenHash, hashToken(token)), gt(emailVerificationTokens.expiresAt, new Date()))
    )
    .returning({ userId: emailVerificationTokens.userId })
  if (!row) throw badRequest('This verification link is invalid or has expired')

  await db.update(users).set({ isVerified: true, updatedAt: new Date() }).where(eq(users.id, row.userId))
  return { userId: row.userId, isVerified: true }
}

export const resendVerificationEmail = async (userId: string) => {
  const [user] = await db
    .select({ email: users.email, name: users.name, isVerified: users.isVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)
  if (!user) throw notFound('User not found')
  if (user.isVerified) throw badRequest('Your email is already verified')

  const [recent] = await db
    .select({ createdAt: emailVerificationTokens.createdAt })
    .from(emailVerificationTokens)
    .where(eq(emailVerificationTokens.userId, userId))
    .limit(1)
  if (recent && Date.now() - recent.createdAt.getTime() < RESEND_COOLDOWN_MS) {
    throw tooManyRequests('Please wait a minute before requesting another email')
  }
  await sendVerificationEmail(userId, user.email, user.name)
}
