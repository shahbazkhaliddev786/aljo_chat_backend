import { db } from '../db/index.js'
import { messages, messageReactions } from '../db/schema/messages.js'
import { conversations, conversationMembers } from '../db/schema/conversations.js'
import { users } from '../db/schema/users.js'
import { eq, and, desc, lt, or } from 'drizzle-orm'
import { isUuid } from './membership.service.js'
import { badRequest, conflict, forbidden } from '../utils/app-error.js'

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
  senderPublicKey?: string
  recipientPublicKey?: string
  clientMessageId?: string
}

export const createMessage = async (params: ISendMessageParams) => {
  // Check membership
  const members = await db
    .select({ userId: conversationMembers.userId })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, params.conversationId))

  const isMember = members.some((m) => m.userId === params.senderId)
  if (!isMember) {
    throw forbidden('Access denied: Not a member of this conversation')
  }

  // An encrypted message must carry its ciphertext and must never also carry plaintext.
  const isEncrypted = params.isEncrypted === true
  if (isEncrypted && (!params.ciphertext || !params.iv)) {
    throw badRequest('Encrypted messages require ciphertext and iv')
  }

  const clientMessageId = isUuid(params.clientMessageId) ? params.clientMessageId : null

  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId: params.conversationId,
      senderId: params.senderId,
      content: isEncrypted ? null : params.content,
      type: params.type || 'text',
      mediaUrl: params.mediaUrl,
      replyToId: params.replyToId,
      isEncrypted,
      ciphertext: isEncrypted ? params.ciphertext : null,
      iv: isEncrypted ? params.iv : null,
      senderPublicKey: isEncrypted ? params.senderPublicKey : null,
      recipientPublicKey: isEncrypted ? params.recipientPublicKey : null,
      clientMessageId
    })
    .onConflictDoNothing({ target: [messages.senderId, messages.clientMessageId] })
    .returning()

  let newMessage = inserted
  if (!newMessage) {
    // Retry of a message that was already stored: return the original.
    const [existing] = await db
      .select()
      .from(messages)
      .where(and(eq(messages.senderId, params.senderId), eq(messages.clientMessageId, clientMessageId!)))
      .limit(1)
    if (!existing || existing.conversationId !== params.conversationId) {
      throw conflict('Duplicate message id')
    }
    newMessage = existing
  } else {
    // Update conversation lastMessageAt
    await db
      .update(conversations)
      .set({
        lastMessageAt: newMessage.createdAt,
        updatedAt: new Date()
      })
      .where(eq(conversations.id, params.conversationId))
  }

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

/**
 * A page of messages, oldest first. `before` is the id of the oldest message
 * the client already has; the page contains messages older than it.
 */
export const getConversationMessages = async (conversationId: string, userId: string, limit = 50, before?: string) => {
  // Check membership
  const [membership] = await db
    .select()
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1)

  if (!membership) {
    throw forbidden('Access denied: Not a member of this conversation')
  }

  const pageSize = Math.min(Math.max(Math.trunc(limit) || 50, 1), 100)

  let cursor: { createdAt: Date; id: string } | null = null
  if (before) {
    const [row] = await db
      .select({ createdAt: messages.createdAt, id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, before), eq(messages.conversationId, conversationId)))
      .limit(1)
    if (!row) throw badRequest('Unknown message cursor')
    cursor = row
  }
  // Strictly older than the cursor; ties on createdAt are broken by id.
  const olderThan = (c: { createdAt: Date; id: string }) =>
    or(lt(messages.createdAt, c.createdAt), and(eq(messages.createdAt, c.createdAt), lt(messages.id, c.id)))

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
      senderPublicKey: messages.senderPublicKey,
      recipientPublicKey: messages.recipientPublicKey,
      clientMessageId: messages.clientMessageId,
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
    .where(and(eq(messages.conversationId, conversationId), cursor ? olderThan(cursor) : undefined))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(pageSize + 1)

  const hasMore = messageList.length > pageSize
  return { messages: messageList.slice(0, pageSize).reverse(), hasMore }
}

/**
 * Move a member's read marker forward to `messageId`. Returns null (and changes
 * nothing) if the message is not in the conversation or is older than the
 * current marker, so read receipts can never go backwards.
 */
export const markMessageAsRead = async (conversationId: string, userId: string, messageId: string) => {
  const [target] = await db
    .select({ id: messages.id, createdAt: messages.createdAt })
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .limit(1)
  if (!target) return null

  const [member] = await db
    .select({ lastReadMessageId: conversationMembers.lastReadMessageId })
    .from(conversationMembers)
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))
    .limit(1)
  if (!member) return null

  if (member.lastReadMessageId) {
    if (member.lastReadMessageId === messageId) return null
    const [current] = await db
      .select({ createdAt: messages.createdAt })
      .from(messages)
      .where(eq(messages.id, member.lastReadMessageId))
      .limit(1)
    if (current && current.createdAt >= target.createdAt) return null
  }

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
