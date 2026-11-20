import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { eq, ilike, or, ne, and } from 'drizzle-orm'
import { notFound } from '../utils/app-error.js'

export const searchUsers = async (query: string, currentUserId: string) => {
  const term = (query || '').trim()
  // Short queries would let anyone page through every account.
  if (term.length < 2 || term.length > 100) return []

  // Escape LIKE wildcards so users cannot match everything with "%" or "_".
  const searchPattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      publicKey: users.publicKey
    })
    .from(users)
    .where(and(ne(users.id, currentUserId), or(ilike(users.name, searchPattern), ilike(users.email, searchPattern))))
    .limit(20)
}

export const getUserById = async (userId: string) => {
  const [user] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      publicKey: users.publicKey,
      status: users.status,
      lastSeen: users.lastSeen,
      createdAt: users.createdAt
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user) {
    throw notFound('User not found')
  }

  return user
}

export const updateUserProfile = async (userId: string, data: { name?: string; bio?: string; avatarUrl?: string }) => {
  const [updatedUser] = await db
    .update(users)
    .set({
      ...data,
      updatedAt: new Date()
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      publicKey: users.publicKey,
      status: users.status,
      updatedAt: users.updatedAt
    })

  return updatedUser
}

export const updatePublicKey = async (userId: string, publicKey: string, keyBackup?: string) => {
  const [updatedUser] = await db
    .update(users)
    .set({
      publicKey,
      ...(keyBackup !== undefined ? { keyBackup } : {}),
      updatedAt: new Date()
    })
    .where(eq(users.id, userId))
    .returning({
      id: users.id,
      name: users.name,
      publicKey: users.publicKey,
      updatedAt: users.updatedAt
    })

  return updatedUser
}

export const getKeyBackup = async (userId: string) => {
  const [row] = await db
    .select({ publicKey: users.publicKey, keyBackup: users.keyBackup })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  return { publicKey: row?.publicKey || null, keyBackup: row?.keyBackup || null }
}
