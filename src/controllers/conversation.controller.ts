import type { Request, Response } from 'express'
import { asyncHandler } from '../utils/async.handler.js'
import { apiResponse } from '../utils/api.response.js'
import {
  getOrCreateDirectConversation,
  createGroupConversation,
  getUserConversations,
  getConversationDetails,
  leaveGroupConversation,
  deleteGroupConversation,
  deleteDirectConversation,
  addGroupMembers,
  removeGroupMember
} from '../services/conversation.service.js'
import { getIO } from '../loaders/socket.js'
import { mediasoupService } from '../services/mediasoup.service.js'
import { notifyCallLeave } from '../sockets/mediasoup.handler.js'
import {
  conversationRoom,
  userRooms,
  joinUsersToConversation,
  removeUsersFromConversation,
  closeConversationRoom
} from '../sockets/rooms.js'
import logger from '../utils/logger.js'

/**
 * Socket side effects of membership changes. Socket rooms are the access
 * boundary for real-time events, so they must always mirror the database.
 * Failures here never fail the HTTP request (the DB change already happened).
 */
const withSocket = (action: string, fn: (io: ReturnType<typeof getIO>) => void) => {
  try {
    fn(getIO())
  } catch (err: any) {
    logger.error('SOCKET_SYNC_FAILED', { meta: { action, error: err.message } })
  }
}

/** Drop a user out of an ongoing group call in this conversation, if any. */
const removeUserFromCall = (io: ReturnType<typeof getIO>, conversationId: string, userId: string) => {
  for (const result of mediasoupService.removeUserFromRoom(conversationId, userId)) notifyCallLeave(io, result)
}

/** End an ongoing group call in this conversation for everyone. */
const endCallForEveryone = (io: ReturnType<typeof getIO>, conversationId: string) => {
  for (const socketId of mediasoupService.getPeerSocketIds(conversationId)) {
    const result = mediasoupService.leaveRoom(conversationId, socketId)
    if (result) notifyCallLeave(io, result)
  }
}

export const getDirect = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const { targetUserId } = req.body
  const conversation = await getOrCreateDirectConversation(userId, targetUserId)
  withSocket('direct-created', (io) =>
    joinUsersToConversation(
      io,
      conversation.id,
      conversation.members.map((m) => m.id)
    )
  )
  return apiResponse(res, 200, 'success', 'Direct conversation ready', { conversation })
})

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const { title, memberIds, avatarUrl } = req.body
  const conversation = await createGroupConversation(userId, { title, memberIds, avatarUrl })
  withSocket('group-created', (io) => {
    const memberIds = conversation.members.map((m) => m.id)
    joinUsersToConversation(io, conversation.id, memberIds)
    io.to(userRooms(memberIds)).emit('group_members_updated', { conversationId: conversation.id })
  })
  return apiResponse(res, 201, 'success', 'Group conversation created', { conversation })
})

export const listConversations = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const conversations = await getUserConversations(userId)
  return apiResponse(res, 200, 'success', 'Conversations retrieved', { conversations })
})

export const getDetails = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const conversationId = req.params.id as string
  const conversation = await getConversationDetails(conversationId, userId)
  return apiResponse(res, 200, 'success', 'Conversation details retrieved', { conversation })
})

export const leaveGroup = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const conversationId = req.params.id as string
  const result = await leaveGroupConversation(conversationId, userId)

  withSocket('left-group', (io) => {
    removeUserFromCall(io, conversationId, userId)
    removeUsersFromConversation(io, conversationId, [userId])
    // Never call io.to() with an empty list: socket.io treats "no rooms" as "everyone".
    if (result.remainingUserIds?.length) {
      io.to(userRooms(result.remainingUserIds)).emit('user_left_group', result)
    }
    if (result.deleted) closeConversationRoom(io, conversationId)
  })

  return apiResponse(res, 200, 'success', 'Left group successfully', result)
})

export const deleteGroup = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const conversationId = req.params.id as string
  const result = await deleteGroupConversation(conversationId, userId)

  withSocket('group-deleted', (io) => {
    endCallForEveryone(io, conversationId)
    io.to(userRooms(result.memberUserIds)).emit('group_deleted', { conversationId })
    closeConversationRoom(io, conversationId)
  })

  return apiResponse(res, 200, 'success', 'Group deleted successfully', result)
})

export const deleteDirect = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const conversationId = req.params.id as string
  const result = await deleteDirectConversation(conversationId, userId)

  withSocket('direct-deleted', (io) => {
    io.to(userRooms(result.memberUserIds)).emit('conversation_deleted', { conversationId })
    closeConversationRoom(io, conversationId)
  })

  return apiResponse(res, 200, 'success', 'Direct conversation deleted successfully', result)
})

export const addMembers = asyncHandler(async (req: Request, res: Response) => {
  const adminUserId = req.user?.id as string
  const conversationId = req.params.id as string
  const { memberIds } = req.body

  const result = await addGroupMembers(conversationId, adminUserId, memberIds)

  withSocket('members-added', (io) => {
    joinUsersToConversation(io, conversationId, result.addedUserIds)
    io.to(conversationRoom(conversationId)).emit('group_members_updated', result)
  })

  return apiResponse(res, 200, 'success', 'Members added successfully', result)
})

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  const adminUserId = req.user?.id as string
  const conversationId = req.params.id as string
  const targetUserId = req.params.targetUserId as string

  const result = await removeGroupMember(conversationId, adminUserId, targetUserId)

  withSocket('member-removed', (io) => {
    removeUserFromCall(io, conversationId, targetUserId)
    io.to(userRooms([...result.remainingUserIds, targetUserId])).emit('member_removed_from_group', result)
    removeUsersFromConversation(io, conversationId, [targetUserId])
  })

  return apiResponse(res, 200, 'success', 'Member removed successfully', result)
})
