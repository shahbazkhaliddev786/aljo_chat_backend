import { db } from '../db/index.js'
import { users } from '../db/schema/users.js'
import { eq, ilike, or, ne, and } from 'drizzle-orm'

export const searchUsers = async (query: string, currentUserId: string) => {
  if (!query || query.trim().length === 0) return []

  const searchPattern = `%${query.trim()}%`

  return db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      bio: users.bio,
      publicKey: users.publicKey,
      status: users.status,
      lastSeen: users.lastSeen
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
    throw new Error('User not found')
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

export const updatePublicKey = async (userId: string, publicKey: string) => {
  const [updatedUser] = await db
    .update(users)
    .set({
      publicKey,
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
