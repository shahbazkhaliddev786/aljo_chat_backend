import { db } from '../db/index.js'
import { messages, messageReactions } from '../db/schema/messages.js'
import { conversations, conversationMembers } from '../db/schema/conversations.js'
import { users } from '../db/schema/users.js'
import { eq, and, desc } from 'drizzle-orm'

export interface ISendMessageParams {
  conversationId: string
  senderId: string
  content?: string
  type?: 'text' | 'image' | 'file' | 'audio' | 'system'
  mediaUrl?: string
  replyToId?: string
  isEncrypted?: boolean
  ciphertext?: string
  iv?: string
}

export const createMessage = async (params: ISendMessageParams) => {
  // Check membership
  const members = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, params.conversationId))

  const isMember = members.some((m) => m.userId === params.senderId)
  if (!isMember) {
    throw new Error('Access denied: Not a member of this conversation')
  }

  const [newMessage] = await db
    .insert(messages)
    .values({
      conversationId: params.conversationId,
      senderId: params.senderId,
      content: params.content,
      type: params.type || 'text',
      mediaUrl: params.mediaUrl,
      replyToId: params.replyToId,
      isEncrypted: params.isEncrypted || false,
      ciphertext: params.ciphertext,
      iv: params.iv
    })
    .returning()

  // Update conversation lastMessageAt
  await db
    .update(conversations)
    .set({
      lastMessageAt: newMessage.createdAt,
      updatedAt: new Date()
    })
    .where(eq(conversations.id, params.conversationId))

  // Populate sender info
  const [sender] = await db
    .select({
      id: users.id,
      name: users.name,
      avatarUrl: users.avatarUrl,
      publicKey: users.publicKey
    })
    .from(users)
    .where(eq(users.id, params.senderId))
    .limit(1)

  return {
    ...newMessage,
    sender,
    memberUserIds: members.map((m) => m.userId),
    reactions: []
  }
}

export const getConversationMessages = async (conversationId: string, userId: string, limit = 50, _before?: string) => {
  // Check membership
  const [membership] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1)

  if (!membership) {
    throw new Error('Access denied: Not a member of this conversation')
  }

  const messageList = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      senderId: messages.senderId,
      content: messages.content,
      type: messages.type,
      mediaUrl: messages.mediaUrl,
      replyToId: messages.replyToId,
      isEncrypted: messages.isEncrypted,
      ciphertext: messages.ciphertext,
      iv: messages.iv,
      isEdited: messages.isEdited,
      isDeleted: messages.isDeleted,
      createdAt: messages.createdAt,
      updatedAt: messages.updatedAt,
      sender: {
        id: users.id,
        name: users.name,
        avatarUrl: users.avatarUrl,
        publicKey: users.publicKey
      }
    })
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.conversationId, conversationId))
    .orderBy(desc(messages.createdAt))
    .limit(limit)

  return messageList.reverse()
}

export const markMessageAsRead = async (conversationId: string, userId: string, messageId: string) => {
  await db
    .update(conversationMembers)
    .set({ lastReadMessageId: messageId })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))

  return { conversationId, userId, messageId }
}

export const addMessageReaction = async (messageId: string, userId: string, emoji: string) => {
  const [reaction] = await db.insert(messageReactions).values({ messageId, userId, emoji }).returning()

  return reaction
}
