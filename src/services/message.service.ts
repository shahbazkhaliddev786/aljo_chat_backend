import { db } from '../db/index.js'
import { messages, messageReactions } from '../db/schema/messages.js'
import { conversations, conversationMembers } from '../db/schema/conversations.js'
import { users } from '../db/schema/users.js'
import { eq, and, desc, inArray, sql } from 'drizzle-orm'
import { isUuid } from './membership.service.js'
import { badRequest, conflict, forbidden, notFound } from '../utils/app-error.js'

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
  /** Group E2EE: JSON map { [memberUserId]: { key, iv } } of the wrapped message key. */
  keyEnvelopes?: string
  clientMessageId?: string
}

const MAX_ENVELOPES_LENGTH = 64 * 1024

/**
 * Validate the per-member key envelopes of a group message: one envelope for
 * every current member (including the sender), and nothing else.
 */
const validateKeyEnvelopes = (raw: unknown, memberIds: string[]): string => {
  if (typeof raw !== 'string' || raw.length > MAX_ENVELOPES_LENGTH) throw badRequest('Invalid key envelopes')
  let parsed: Record<string, { key?: unknown; iv?: unknown }>
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw badRequest('Invalid key envelopes')
  }
  const ids = Object.keys(parsed ?? {})
  const expected = new Set(memberIds)
  if (ids.length !== expected.size || ids.some((id) => !expected.has(id))) {
    throw badRequest('Encrypted group messages must include a key for every member', 'members-changed')
  }
  for (const id of ids) {
    const env = parsed[id]
    if (typeof env?.key !== 'string' || typeof env?.iv !== 'string') throw badRequest('Invalid key envelopes')
  }
  return raw
}

/** Shape shared by every message payload sent to clients. */
const messageFields = {
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
  keyEnvelopes: messages.keyEnvelopes,
  clientMessageId: messages.clientMessageId,
  isEdited: messages.isEdited,
  editedAt: messages.editedAt,
  isDeleted: messages.isDeleted,
  createdAt: messages.createdAt,
  updatedAt: messages.updatedAt,
  sender: {
    id: users.id,
    name: users.name,
    avatarUrl: users.avatarUrl,
    publicKey: users.publicKey
  }
}

export interface ReactionSummary {
  emoji: string
  userIds: string[]
}

/** Reactions grouped by emoji for each message id. */
const getReactions = async (messageIds: string[]): Promise<Map<string, ReactionSummary[]>> => {
  const result = new Map<string, ReactionSummary[]>()
  if (messageIds.length === 0) return result
  const rows = await db
    .select({ messageId: messageReactions.messageId, emoji: messageReactions.emoji, userId: messageReactions.userId })
    .from(messageReactions)
    .where(inArray(messageReactions.messageId, messageIds))
    .orderBy(messageReactions.createdAt)
  for (const row of rows) {
    const list = result.get(row.messageId) ?? []
    const entry = list.find((r) => r.emoji === row.emoji)
    if (entry) entry.userIds.push(row.userId)
    else list.push({ emoji: row.emoji, userIds: [row.userId] })
    result.set(row.messageId, list)
  }
  return result
}

/** Load one message in the client payload shape (with reactions). */
export const getMessageForClient = async (messageId: string) => {
  const [message] = await db
    .select(messageFields)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(eq(messages.id, messageId))
    .limit(1)
  if (!message) throw notFound('Message not found')
  const reactions = await getReactions([messageId])
  return { ...message, reactions: reactions.get(messageId) ?? [] }
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

  // Group messages carry the message key wrapped for each member.
  const [conversation] = await db
    .select({ type: conversations.type })
    .from(conversations)
    .where(eq(conversations.id, params.conversationId))
    .limit(1)
  const keyEnvelopes =
    isEncrypted && conversation?.type === 'group'
      ? validateKeyEnvelopes(
          params.keyEnvelopes,
          members.map((m) => m.userId)
        )
      : null

  // A reply must point at a message of the same conversation.
  if (params.replyToId) {
    const [original] = isUuid(params.replyToId)
      ? await db
          .select({ id: messages.id })
          .from(messages)
          .where(and(eq(messages.id, params.replyToId), eq(messages.conversationId, params.conversationId)))
          .limit(1)
      : []
    if (!original) throw badRequest('The message you replied to does not exist')
  }

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
      recipientPublicKey: isEncrypted && !keyEnvelopes ? params.recipientPublicKey : null,
      keyEnvelopes,
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

  if (before) {
    const [row] = await db
      .select({ id: messages.id })
      .from(messages)
      .where(and(eq(messages.id, before), eq(messages.conversationId, conversationId)))
      .limit(1)
    if (!row) throw badRequest('Unknown message cursor')
  }
  // Strictly older than the cursor, compared inside Postgres: JS Dates only keep
  // milliseconds, so comparing against a Date read back from the DB could skip
  // messages created within the same millisecond. Ties are broken by id.
  const olderThanCursor = (cursorId: string) =>
    sql`(${messages.createdAt}, ${messages.id}) < (select c.created_at, c.id from messages c where c.id = ${cursorId})`

  const messageList = await db
    .select(messageFields)
    .from(messages)
    .innerJoin(users, eq(users.id, messages.senderId))
    .where(and(eq(messages.conversationId, conversationId), before ? olderThanCursor(before) : undefined))
    .orderBy(desc(messages.createdAt), desc(messages.id))
    .limit(pageSize + 1)

  const hasMore = messageList.length > pageSize
  const page = messageList.slice(0, pageSize).reverse()
  const reactions = await getReactions(page.map((m) => m.id))
  return { messages: page.map((m) => ({ ...m, reactions: reactions.get(m.id) ?? [] })), hasMore }
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
    // Compare (created_at, id) in Postgres at full precision (JS Dates drop microseconds).
    const rows = await db.execute<{ newer: boolean }>(sql`
      select (t.created_at, t.id) > (c.created_at, c.id) as newer
      from messages t, messages c
      where t.id = ${messageId} and c.id = ${member.lastReadMessageId}
    `)
    const [row] = Array.from(rows as Iterable<{ newer: boolean }>)
    if (row && !row.newer) return null
  }

  await db
    .update(conversationMembers)
    .set({ lastReadMessageId: messageId })
    .where(and(eq(conversationMembers.conversationId, conversationId), eq(conversationMembers.userId, userId)))

  return { conversationId, userId, messageId }
}

/** Load a message and check that `userId` may act on it (member of its conversation). */
const getOwnedContext = async (messageId: unknown, userId: string) => {
  if (!isUuid(messageId)) throw badRequest('Valid messageId is required')
  const [row] = await db
    .select({
      id: messages.id,
      conversationId: messages.conversationId,
      senderId: messages.senderId,
      type: messages.type,
      isEncrypted: messages.isEncrypted,
      isDeleted: messages.isDeleted,
      conversationType: conversations.type
    })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .where(eq(messages.id, messageId))
    .limit(1)
  if (!row) throw notFound('Message not found')

  const memberIds = (
    await db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, row.conversationId))
  ).map((m) => m.userId)
  if (!memberIds.includes(userId)) throw forbidden('Access denied: Not a member of this conversation')
  return { message: row, memberIds }
}

export interface IEditMessageParams {
  messageId: string
  userId: string
  content?: string
  ciphertext?: string
  iv?: string
  senderPublicKey?: string
  recipientPublicKey?: string
  keyEnvelopes?: string
}

/** Edit the text of your own message. Encrypted messages stay encrypted (re-encrypted by the client). */
export const editMessage = async (params: IEditMessageParams) => {
  const { message, memberIds } = await getOwnedContext(params.messageId, params.userId)
  if (message.senderId !== params.userId) throw forbidden('You can only edit your own messages')
  if (message.isDeleted) throw badRequest('This message was deleted')
  if (message.type !== 'text') throw badRequest('Only text messages can be edited')

  const update = message.isEncrypted
    ? (() => {
        if (!params.ciphertext || !params.iv) throw badRequest('Encrypted messages require ciphertext and iv')
        const isGroup = message.conversationType === 'group'
        return {
          ciphertext: params.ciphertext,
          iv: params.iv,
          senderPublicKey: params.senderPublicKey ?? null,
          recipientPublicKey: isGroup ? null : (params.recipientPublicKey ?? null),
          keyEnvelopes: isGroup ? validateKeyEnvelopes(params.keyEnvelopes, memberIds) : null
        }
      })()
    : (() => {
        const content = typeof params.content === 'string' ? params.content.trim() : ''
        if (!content) throw badRequest('Message cannot be empty')
        if (content.length > 10_000) throw badRequest('Message is too long')
        return { content }
      })()

  const now = new Date()
  await db
    .update(messages)
    .set({ ...update, isEdited: true, editedAt: now, updatedAt: now })
    .where(eq(messages.id, message.id))

  return { message: await getMessageForClient(message.id), memberIds }
}

/** Delete your own message for everyone. Content, ciphertext and attachments are wiped. */
export const deleteMessage = async (messageId: string, userId: string) => {
  const { message, memberIds } = await getOwnedContext(messageId, userId)
  if (message.senderId !== userId) throw forbidden('You can only delete your own messages')

  if (!message.isDeleted) {
    await db
      .update(messages)
      .set({
        isDeleted: true,
        content: null,
        ciphertext: null,
        iv: null,
        keyEnvelopes: null,
        mediaUrl: null,
        updatedAt: new Date()
      })
      .where(eq(messages.id, message.id))
    await db.delete(messageReactions).where(eq(messageReactions.messageId, message.id))
  }

  return { message: await getMessageForClient(message.id), memberIds }
}

/** Add the reaction if the user has not reacted with this emoji yet, otherwise remove it. */
export const toggleReaction = async (messageId: string, userId: string, emoji: unknown) => {
  if (typeof emoji !== 'string' || emoji.trim().length === 0 || [...emoji].length > 8 || /\s/.test(emoji)) {
    throw badRequest('Invalid reaction')
  }
  const { message, memberIds } = await getOwnedContext(messageId, userId)
  if (message.isDeleted) throw badRequest('This message was deleted')

  const removed = await db
    .delete(messageReactions)
    .where(
      and(
        eq(messageReactions.messageId, message.id),
        eq(messageReactions.userId, userId),
        eq(messageReactions.emoji, emoji)
      )
    )
    .returning({ id: messageReactions.id })
  if (removed.length === 0) {
    await db.insert(messageReactions).values({ messageId: message.id, userId, emoji }).onConflictDoNothing()
  }

  const reactions = (await getReactions([message.id])).get(message.id) ?? []
  return { conversationId: message.conversationId, messageId: message.id, reactions, memberIds }
}
