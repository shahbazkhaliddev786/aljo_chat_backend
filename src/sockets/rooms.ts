import { Server } from 'socket.io'

/**
 * Socket.IO room naming + membership sync.
 *
 * - `user:<id>`          every socket of a user (joined on connect)
 * - `conversation:<id>`  every socket of every *current* member of a conversation
 *
 * Conversation rooms are an authorization boundary: whatever is emitted to them
 * reaches only current members. Membership changes MUST be mirrored here.
 */
export const userRoom = (userId: string) => `user:${userId}`
export const conversationRoom = (conversationId: string) => `conversation:${conversationId}`

export const userRooms = (userIds: string[]) => userIds.map(userRoom)

/** Add all sockets of the given users to a conversation room. */
export const joinUsersToConversation = (io: Server, conversationId: string, userIds: string[]) => {
  if (userIds.length === 0) return
  io.in(userRooms(userIds)).socketsJoin(conversationRoom(conversationId))
}

/** Remove all sockets of the given users from a conversation room. */
export const removeUsersFromConversation = (io: Server, conversationId: string, userIds: string[]) => {
  if (userIds.length === 0) return
  io.in(userRooms(userIds)).socketsLeave(conversationRoom(conversationId))
}

/** Remove every socket from a conversation room (conversation deleted). */
export const closeConversationRoom = (io: Server, conversationId: string) => {
  io.in(conversationRoom(conversationId)).socketsLeave(conversationRoom(conversationId))
}
