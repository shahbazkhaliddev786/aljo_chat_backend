import bcrypt from 'bcryptjs'
import { createHash, randomUUID } from 'crypto'
import jwt from 'jsonwebtoken'
import config from '../config/config.js'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { refreshTokens } from '../db/schema/tokens.js'
import { eq, and, inArray, lt, gt } from 'drizzle-orm'
import { conflict, unauthorized } from '../utils/app-error.js'

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
