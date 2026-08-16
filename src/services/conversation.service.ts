import { db } from '../db/index.js'
import { conversations, conversationMembers } from '../db/schema/conversations.js'
import { users } from '../db/schema/users.js'
import { messages } from '../db/schema/messages.js'
import { eq, and, desc, inArray } from 'drizzle-orm'

export const getOrCreateDirectConversation = async (userId: string, targetUserId: string) => {
  if (userId === targetUserId) {
    throw new Error('Cannot start conversation with yourself')
  }

  // Find existing direct conversation between these 2 users
  const user1Conversations = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId))

  const conversationIds = user1Conversations.map((c) => c.conversationId)

  if (conversationIds.length > 0) {
    const existingDirect = await db
      .select({
        conversationId: conversationMembers.conversationId
      })
      .from(conversationMembers)
      .innerJoin(conversations, eq(conversations.id, conversationMembers.conversationId))
      .where(
        and(
          inArray(conversationMembers.conversationId, conversationIds),
          eq(conversationMembers.userId, targetUserId),
          eq(conversations.type, 'direct')
        )
      )
      .limit(1)

    if (existingDirect.length > 0) {
      return getConversationDetails(existingDirect[0].conversationId, userId)
    }
  }

  // Create new direct conversation
  const [newConversation] = await db
    .insert(conversations)
    .values({
      type: 'direct',
      createdBy: userId
    })
    .returning()

  // Add members
  await db.insert(conversationMembers).values([
    { conversationId: newConversation.id, userId, role: 'admin' },
    { conversationId: newConversation.id, userId: targetUserId, role: 'member' }
  ])

  return getConversationDetails(newConversation.id, userId)
}

export const createGroupConversation = async (
  userId: string,
  data: { title: string; memberIds: string[]; avatarUrl?: string }
) => {
  const uniqueMembers = new Set([userId, ...data.memberIds].filter(Boolean))
  if (uniqueMembers.size < 3) {
    throw new Error(
      'Group chats must contain at least 3 distinct members. For 2 users, please start a direct conversation.'
    )
  }
  const [newConversation] = await db
    .insert(conversations)
    .values({
      type: 'group',
      title: data.title,
      avatarUrl: data.avatarUrl,
      createdBy: userId
    })
    .returning()

  const membersToInsert = [
    { conversationId: newConversation.id, userId, role: 'admin' as const },
    ...data.memberIds
      .filter((id) => id !== userId)
      .map((id) => ({
        conversationId: newConversation.id,
        userId: id,
        role: 'member' as const
      }))
  ]

  await db.insert(conversationMembers).values(membersToInsert)

  return getConversationDetails(newConversation.id, userId)
}

export const getUserConversations = async (userId: string) => {
  const userMemberships = await db
    .select({ conversationId: conversationMembers.conversationId })
    .from(conversationMembers)
    .where(eq(conversationMembers.userId, userId))

  const conversationIds = userMemberships.map((m) => m.conversationId)
  if (conversationIds.length === 0) return []

  const conversationList = await db
    .select({
      id: conversations.id,
      type: conversations.type,
      title: conversations.title,
      avatarUrl: conversations.avatarUrl,
      lastMessageAt: conversations.lastMessageAt,
      createdAt: conversations.createdAt
    })
    .from(conversations)
    .where(inArray(conversations.id, conversationIds))
    .orderBy(desc(conversations.lastMessageAt))

  // Populate conversation members & latest message
  const result = await Promise.all(
    conversationList.map(async (conv) => {
      const members = await db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          avatarUrl: users.avatarUrl,
          status: users.status,
          lastSeen: users.lastSeen,
          role: conversationMembers.role
        })
        .from(conversationMembers)
        .innerJoin(users, eq(users.id, conversationMembers.userId))
        .where(eq(conversationMembers.conversationId, conv.id))

      const [latestMessage] = await db
        .select({
          id: messages.id,
          content: messages.content,
          type: messages.type,
          senderId: messages.senderId,
          createdAt: messages.createdAt
        })
        .from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1)

      return {
        ...conv,
        members,
        latestMessage: latestMessage || null
      }
    })
  )

  return result
}

export const getConversationDetails = async (conversationId: string, userId: string) => {
  const [conv] = await db.select().from(conversations).where(eq(conversations.id, conversationId)).limit(1)

  if (!conv) {
    throw new Error('Conversation not found')
  }

  const members = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      avatarUrl: users.avatarUrl,
      status: users.status,
      lastSeen: users.lastSeen,
      role: conversationMembers.role
    })
    .from(conversationMembers)
    .innerJoin(users, eq(users.id, conversationMembers.userId))
    .where(eq(conversationMembers.conversationId, conversationId))

  const isMember = members.some((m) => m.id === userId)
  if (!isMember) {
    throw new Error('Access denied: Not a member of this conversation')
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
    throw new Error('Group conversation not found')
  }

  const [memberRecord] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1)

  if (!memberRecord) {
    throw new Error('Not a member of this group')
  }

  // Remove membership
  await db
    .delete(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))

  // Check remaining members
  const remainingMembers = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId))

  if (remainingMembers.length === 0) {
    // Delete conversation if 0 members remain
    await db.delete(conversations).where(eq(conversations.id, conversationId))
    return { conversationId, leftUserId: userId, remainingMemberCount: 0, deleted: true }
  }

  // If leaving member was admin, promote next oldest member to admin
  if (memberRecord.role === 'admin') {
    const hasAdmin = remainingMembers.some((m) => m.role === 'admin')
    if (!hasAdmin) {
      await db
        .update(conversationMembers)
        .set({ role: 'admin' })
        .where(eq(conversationMembers.id, remainingMembers[0].id))
    }
  }

  return {
    conversationId,
    leftUserId: userId,
    remainingMemberCount: remainingMembers.length,
    remainingUserIds: remainingMembers.map((m) => m.userId),
    deleted: false
  }
}

export const deleteGroupConversation = async (conversationId: string, userId: string) => {
  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.type, 'group')))
    .limit(1)

  if (!conv) {
    throw new Error('Group conversation not found')
  }

  const [membership] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1)

  if (!membership || (conv.createdBy !== userId && membership.role !== 'admin')) {
    throw new Error('Permission denied: Only group admin or creator can delete the group')
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
    throw new Error('Direct conversation not found')
  }

  const [membership] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1)

  if (!membership) {
    throw new Error('Access denied: Not a member of this conversation')
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
    throw new Error('Group conversation not found')
  }

  const [adminMembership] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, adminUserId)))
    .limit(1)

  if (!adminMembership || (conv.createdBy !== adminUserId && adminMembership.role !== 'admin')) {
    throw new Error('Permission denied: Only group admin can add members')
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
    throw new Error('Use leave group to remove yourself')
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.type, 'group')))
    .limit(1)

  if (!conv) {
    throw new Error('Group conversation not found')
  }

  const [adminMembership] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, adminUserId)))
    .limit(1)

  if (!adminMembership || (conv.createdBy !== adminUserId && adminMembership.role !== 'admin')) {
    throw new Error('Permission denied: Only group admin can remove members')
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
