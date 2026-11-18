import { and, eq } from 'drizzle-orm'
import { db } from '../db/index.js'
import { conversations, conversationMembers } from '../db/schema/conversations.js'
import { badRequest, forbidden } from '../utils/app-error.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export const isUuid = (value: unknown): value is string => typeof value === 'string' && UUID_RE.test(value)

export interface Membership {
  conversationId: string
  conversationType: 'direct' | 'group'
  role: 'admin' | 'member'
}

/** Returns the user's membership in a conversation, or null if they are not a member. */
export const getMembership = async (conversationId: unknown, userId: string): Promise<Membership | null> => {
  if (!isUuid(conversationId)) return null

  const [row] = await db
    .select({
      conversationId: conversationMembers.conversationId,
      conversationType: conversations.type,
      role: conversationMembers.role
    })
    .from(conversationMembers)
    .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1)

  return row || null
}

/** Throws unless the user is a member. Optionally restricts the conversation type. */
export const assertMembership = async (
  conversationId: unknown,
  userId: string,
  type?: 'direct' | 'group'
): Promise<Membership> => {
  const membership = await getMembership(conversationId, userId)
  if (!membership) throw forbidden('Access denied: Not a member of this conversation')
  if (type && membership.conversationType !== type) throw badRequest(`This action requires a ${type} conversation`)
  return membership
}

export const getMemberUserIds = async (conversationId: string): Promise<string[]> => {
  const rows = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))
  return rows.map((r) => r.userId)
}
