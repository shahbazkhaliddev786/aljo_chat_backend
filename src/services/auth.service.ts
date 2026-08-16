import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import config from '../config/config.js'
import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { refreshTokens } from '../db/schema/tokens.js'
import { eq, and } from 'drizzle-orm'

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
  const accessToken = jwt.sign({ userId }, config.JWT_SECRET, {
    expiresIn: config.JWT_EXPIRES_IN as any
  })

  const refreshToken = jwt.sign({ userId }, config.REFRESH_TOKEN_SECRET, {
    expiresIn: config.REFRESH_TOKEN_EXPIRES_IN as any
  })

  return { accessToken, refreshToken }
}

export const registerUser = async (data: IRegisterData) => {
  // Check if user exists
  const [existingUser] = await db.select().from(users).where(eq(users.email, data.email.toLowerCase())).limit(1)

  if (existingUser) {
    throw new Error('User with this email already exists')
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

  const { accessToken, refreshToken } = generateTokens(newUser.id)

  // Save refresh token
  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30) // 30 days

  await db.insert(refreshTokens).values({
    userId: newUser.id,
    token: refreshToken,
    expiresAt
  })

  return { user: newUser, accessToken, refreshToken }
}

export const loginUser = async (data: ILoginData) => {
  const [user] = await db.select().from(users).where(eq(users.email, data.email.toLowerCase())).limit(1)

  if (!user) {
    throw new Error('Invalid credentials')
  }

  const isPasswordMatch = await bcrypt.compare(data.password, user.password)
  if (!isPasswordMatch) {
    throw new Error('Invalid credentials')
  }

  const { accessToken, refreshToken } = generateTokens(user.id)

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)

  await db.insert(refreshTokens).values({
    userId: user.id,
    token: refreshToken,
    expiresAt
  })

  delete (user as any).password
  return { user, accessToken, refreshToken }
}

export const refreshAccessToken = async (token: string) => {
  let payload: { userId: string }
  try {
    payload = jwt.verify(token, config.REFRESH_TOKEN_SECRET) as { userId: string }
  } catch {
    throw new Error('Invalid or expired refresh token')
  }

  const [storedToken] = await db
    .select()
    .from(refreshTokens)
    .where(and(eq(refreshTokens.token, token), eq(refreshTokens.userId, payload.userId)))
    .limit(1)

  if (!storedToken) {
    throw new Error('Refresh token revoked or not found')
  }

  const { accessToken, refreshToken: newRefreshToken } = generateTokens(payload.userId)

  // Rotate refresh token
  await db.delete(refreshTokens).where(eq(refreshTokens.id, storedToken.id))

  const expiresAt = new Date()
  expiresAt.setDate(expiresAt.getDate() + 30)
  await db.insert(refreshTokens).values({
    userId: payload.userId,
    token: newRefreshToken,
    expiresAt
  })

  return { accessToken, refreshToken: newRefreshToken }
}

export const logoutUser = async (userId: string, token?: string) => {
  if (token) {
    await db.delete(refreshTokens).where(and(eq(refreshTokens.userId, userId), eq(refreshTokens.token, token)))
  } else {
    await db.delete(refreshTokens).where(eq(refreshTokens.userId, userId))
  }
}
