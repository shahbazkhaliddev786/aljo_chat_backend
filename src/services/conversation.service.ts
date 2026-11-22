import { db } from '../db/index.js'
import { conversations, conversationMembers } from '../db/schema/conversations.js'
import { users } from '../db/schema/users.js'
import { messages } from '../db/schema/messages.js'
import { eq, and, desc, inArray, sql } from 'drizzle-orm'
import { badRequest, forbidden, notFound } from '../utils/app-error.js'

/** Fields of a member returned with every conversation. */
const memberFields = {
  id: users.id,
  name: users.name,
  email: users.email,
  avatarUrl: users.avatarUrl,
  publicKey: users.publicKey,
  status: users.status,
  lastSeen: users.lastSeen,
  role: conversationMembers.role,
  lastReadMessageId: conversationMembers.lastReadMessageId
}

export const getOrCreateDirectConversation = async (userId: string, targetUserId: string) => {
  if (userId === targetUserId) {
    throw badRequest('Cannot start conversation with yourself')
  }

  const conversationId = await db.transaction(async (tx) => {
    // Serialize creation per user pair so two simultaneous requests cannot
    // create two direct conversations between the same people.
    const pairKey = [userId, targetUserId].sort().join(':')
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${pairKey}))`)

    const mine = tx
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId))

    const [existing] = await tx
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(
        and(
          inArray(conversationMembers.conversationId, mine),
          eq(conversationMembers.userId, targetUserId),
          eq(conversations.type, 'direct')
        )
      )
      .limit(1)
    if (existing) return existing.conversationId

    const [target] = await tx.select({ id: users.id }).from(users).where(eq(users.id, targetUserId)).limit(1)
    if (!target) throw notFound('User not found')

    const [newConversation] = await tx
      .insert(conversations)
      .values({ type: 'direct', createdBy: userId })
      .returning({ id: conversations.id })

    await tx.insert(conversationMembers).values([
      { conversationId: newConversation.id, userId, role: 'admin' },
      { conversationId: newConversation.id, userId: targetUserId, role: 'member' }
    ])
    return newConversation.id
  })

  return getConversationDetails(conversationId, userId)
}

export const createGroupConversation = async (
  userId: string,
  data: { title: string; memberIds: string[]; avatarUrl?: string }
) => {
  const otherMemberIds = Array.from(new Set(data.memberIds.filter((id) => id && id !== userId)))
  if (otherMemberIds.length < 2) {
    throw badRequest(
      'Group chats must contain at least 3 distinct members. For 2 users, please start a direct conversation.'
    )
  }

  const conversationId = await db.transaction(async (tx) => {
    const found = await tx.select({ id: users.id }).from(users).where(inArray(users.id, otherMemberIds))
    if (found.length !== otherMemberIds.length) throw badRequest('Some selected users do not exist')

    const [newConversation] = await tx
      .insert(conversations)
      .values({ type: 'group', title: data.title, avatarUrl: data.avatarUrl, createdBy: userId })
      .returning({ id: conversations.id })

    await tx
      .insert(conversationMembers)
      .values([
        { conversationId: newConversation.id, userId, role: 'admin' as const },
        ...otherMemberIds.map((id) => ({ conversationId: newConversation.id, userId: id, role: 'member' as const }))
      ])
    return newConversation.id
  })

  return getConversationDetails(conversationId, userId)
}

export const getUserConversations = async (userId: string) => {
  const mine = db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId))

  const conversationList = await db
    .select({
      id: conversations.id,
      type: conversations.type,
      title: conversations.title,
      avatarUrl: conversations.avatarUrl,
      createdBy: conversations.createdBy,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt
    })
    .from(conversations)
    .where(inArray(conversations.id, mine))
    .orderBy(desc(conversations.lastMessageAt))

  if (conversationList.length === 0) return []
  const ids = conversationList.map((c) => c.id)

  // Two batched queries instead of two queries per conversation.
  const [memberRows, latestMessages, unreadRows] = await Promise.all([
    db
      .select({ conversationId: conversationMembers.conversationId, ...memberFields })
      .from(conversationMembers)
      .innerJoin(users, eq(users.id, conversationMembers.userId))
      .where(inArray(conversationMembers.conversationId, ids)),
    db
      .selectDistinctOn([messages.conversationId], {
        conversationId: messages.conversationId,
        id: messages.id,
        content: messages.content,
        type: messages.type,
        isEncrypted: messages.isEncrypted,
        isDeleted: messages.isDeleted,
        senderId: messages.senderId,
        createdAt: messages.createdAt
      })
      .from(messages)
      .where(inArray(messages.conversationId, ids))
      .orderBy(messages.conversationId, desc(messages.createdAt)),
    // Unread = messages from others newer than the user's read marker (capped for display).
    db.execute<{ conversation_id: string; unread: number }>(sql`
      select m.conversation_id, least(count(*), 100)::int as unread
      from ${messages} m
      join ${conversationMembers} cm on cm.conversation_id = m.conversation_id and cm.user_id = ${userId}
      left join ${messages} lr on lr.id = cm.last_read_message_id
      where m.conversation_id in ${ids}
        and m.sender_id <> ${userId}
        and m.is_deleted = false
        and (lr.id is null or m.created_at > lr.created_at)
      group by m.conversation_id
    `)
  ])

  const membersByConversation = new Map<string, typeof memberRows>()
  for (const row of memberRows) {
    const list = membersByConversation.get(row.conversationId) ?? []
    list.push(row)
    membersByConversation.set(row.conversationId, list)
  }
  const latestByConversation = new Map(latestMessages.map((m) => [m.conversationId, m]))
  const unreadByConversation = new Map(
    Array.from(unreadRows as Iterable<{ conversation_id: string; unread: number }>).map((r) => [
      r.conversation_id,
      Number(r.unread)
    ])
  )

  return conversationList.map((conv) => {
    const latest = latestByConversation.get(conv.id)
    return {
      ...conv,
      unreadCount: unreadByConversation.get(conv.id) ?? 0,
      members: (membersByConversation.get(conv.id) ?? []).map(({ conversationId: _c, ...member }) => member),
      latestMessage: latest
        ? {
            id: latest.id,
            content: latest.content,
            type: latest.type,
            isEncrypted: latest.isEncrypted,
            isDeleted: latest.isDeleted,
            senderId: latest.senderId,
            createdAt: latest.createdAt
          }
        : null
    }
  })
}

export const getConversationDetails = async (conversationId: string, userId: string) => {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1)

  if (!conv) {
    throw notFound('Conversation not found')
  }

  const members = await db
    .select(memberFields)
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, conversationId))

  const isMember = members.some((m) => m.id === userId)
  if (!isMember) {
    throw forbidden('Access denied: Not a member of this conversation')
  }

  return {
    ...conv,
    members
  }
}

export const leaveGroupConversation = async (conversationId: string, userId: string) => {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.type, 'group')))
    .limit(1)

  if (!conv) {
    throw notFound('Group conversation not found')
  }

  const [memberRecord] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1)

  if (!memberRecord) {
    throw forbidden('Not a member of this group')
  }

  // Remove the member, then either delete the empty group or make sure an admin remains — atomically.
  return db.transaction(async (tx) => {
    await tx
      .delete(conversationMembers)
      .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))

    const remainingMembers = await tx
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId))
      .orderBy(conversationMembers.joinedAt)

    if (remainingMembers.length === 0) {
      await tx.delete(conversations).where(eq(conversations.id, conversationId))
      return { conversationId, leftUserId: userId, remainingMemberCount: 0, remainingUserIds: [], deleted: true }
    }

    // If the last admin left, promote the longest-standing member.
    if (!remainingMembers.some((m) => m.role === 'admin')) {
      await tx
        .update(conversationMembers)
        .set({ role: 'admin' })
        .where(eq(conversationMembers.id, remainingMembers[0].id))
    }

    return {
      conversationId,
      leftUserId: userId,
      remainingMemberCount: remainingMembers.length,
      remainingUserIds: remainingMembers.map((m) => m.userId),
      deleted: false
    }
  })
}

export const deleteGroupConversation = async (conversationId: string, userId: string) => {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.type, 'group')))
    .limit(1)

  if (!conv) {
    throw notFound('Group conversation not found')
  }

  const [membership] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1)

  if (!membership || (conv.createdBy !== userId && membership.role !== 'admin')) {
    throw forbidden('Permission denied: Only group admin or creator can delete the group')
  }

  // Get member IDs before deletion for socket broadcast
  const memberRecords = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))

  // Delete conversation (cascade deletes members, messages, reactions)
  await db.delete(conversations).where(eq(conversations.id, conversationId))

  return {
    conversationId,
    memberUserIds: memberRecords.map((m) => m.userId)
  }
}

export const deleteDirectConversation = async (conversationId: string, userId: string) => {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.type, 'direct')))
    .limit(1)

  if (!conv) {
    throw notFound('Direct conversation not found')
  }

  const [membership] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1)

  if (!membership) {
    throw forbidden('Access denied: Not a member of this conversation')
  }

  // Get member IDs before deletion
  const memberRecords = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))

  // Delete conversation (cascade deletes members and messages)
  await db.delete(conversations).where(eq(conversations.id, conversationId))

  return {
    conversationId,
    memberUserIds: memberRecords.map((m) => m.userId)
  }
}

export const addGroupMembers = async (conversationId: string, adminUserId: string, newMemberIds: string[]) => {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.type, 'group')))
    .limit(1)

  if (!conv) {
    throw notFound('Group conversation not found')
  }

  const [adminMembership] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, adminUserId)))
    .limit(1)

  if (!adminMembership || (conv.createdBy !== adminUserId && adminMembership.role !== 'admin')) {
    throw forbidden('Permission denied: Only group admin can add members')
  }

  const existingMembers = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))

  const existingSet = new Set(existingMembers.map((m) => m.userId))
  const usersToInsert = newMemberIds.filter((id) => !existingSet.has(id))

  if (usersToInsert.length > 0) {
    await db.insert(conversationMembers).values(
      usersToInsert.map((id) => ({
        conversationId,
        userId: id,
        role: 'member' as const
      }))
    )
  }

  const updatedConversation = await getConversationDetails(conversationId, adminUserId)

  return {
    conversation: updatedConversation,
    addedUserIds: usersToInsert,
    allMemberUserIds: updatedConversation.members.map((m) => m.id)
  }
}

export const removeGroupMember = async (conversationId: string, adminUserId: string, targetUserId: string) => {
  if (adminUserId === targetUserId) {
    throw badRequest('Use leave group to remove yourself')
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.type, 'group')))
    .limit(1)

  if (!conv) {
    throw notFound('Group conversation not found')
  }

  const [adminMembership] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, adminUserId)))
    .limit(1)

  if (!adminMembership || (conv.createdBy !== adminUserId && adminMembership.role !== 'admin')) {
    throw forbidden('Permission denied: Only group admin can remove members')
  }

  // Remove target membership
  await db
    .delete(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, targetUserId)))

  const remainingMembers = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))

  return {
    conversationId,
    removedUserId: targetUserId,
    remainingUserIds: remainingMembers.map((m) => m.userId)
  }
}
