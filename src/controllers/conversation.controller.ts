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

export const getDirect = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const { targetUserId } = req.body
  const conversation = await getOrCreateDirectConversation(userId, targetUserId)
  return apiResponse(res, 200, 'success', 'Direct conversation ready', { conversation })
})

export const createGroup = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const { title, memberIds, avatarUrl } = req.body
  const conversation = await createGroupConversation(userId, { title, memberIds, avatarUrl })
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

  try {
    const io = getIO()
    io.to(`conversation:${conversationId}`).emit('user_left_group', result)
    if (result.remainingUserIds) {
      for (const mId of result.remainingUserIds) {
        io.to(`user:${mId}`).emit('user_left_group', result)
      }
    }
  } catch {
    // Non-blocking socket fallback
  }

  return apiResponse(res, 200, 'success', 'Left group successfully', result)
})

export const deleteGroup = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const conversationId = req.params.id as string
  const result = await deleteGroupConversation(conversationId, userId)

  try {
    const io = getIO()
    io.to(`conversation:${conversationId}`).emit('group_deleted', { conversationId })
    for (const memberId of result.memberUserIds) {
      io.to(`user:${memberId}`).emit('group_deleted', { conversationId })
    }
  } catch {
    // Non-blocking socket fallback
  }

  return apiResponse(res, 200, 'success', 'Group deleted successfully', result)
})

export const deleteDirect = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const conversationId = req.params.id as string
  const result = await deleteDirectConversation(conversationId, userId)

  try {
    const io = getIO()
    io.to(`conversation:${conversationId}`).emit('conversation_deleted', { conversationId })
    for (const memberId of result.memberUserIds) {
      io.to(`user:${memberId}`).emit('conversation_deleted', { conversationId })
    }
  } catch {
    // Non-blocking socket fallback
  }

  return apiResponse(res, 200, 'success', 'Direct conversation deleted successfully', result)
})

export const addMembers = asyncHandler(async (req: Request, res: Response) => {
  const adminUserId = req.user?.id as string
  const conversationId = req.params.id as string
  const { memberIds } = req.body

  if (!Array.isArray(memberIds) || memberIds.length === 0) {
    return apiResponse(res, 400, 'error', 'memberIds array is required')
  }

  const result = await addGroupMembers(conversationId, adminUserId, memberIds)

  try {
    const io = getIO()
    io.to(`conversation:${conversationId}`).emit('group_members_updated', result)
    for (const mId of result.allMemberUserIds) {
      io.to(`user:${mId}`).emit('group_members_updated', result)
    }
  } catch {
    // Non-blocking socket fallback
  }

  return apiResponse(res, 200, 'success', 'Members added successfully', result)
})

export const removeMember = asyncHandler(async (req: Request, res: Response) => {
  const adminUserId = req.user?.id as string
  const conversationId = req.params.id as string
  const targetUserId = req.params.targetUserId as string

  const result = await removeGroupMember(conversationId, adminUserId, targetUserId)

  try {
    const io = getIO()
    io.to(`conversation:${conversationId}`).emit('member_removed_from_group', result)
    io.to(`user:${targetUserId}`).emit('member_removed_from_group', result)
    for (const mId of result.remainingUserIds) {
      io.to(`user:${mId}`).emit('member_removed_from_group', result)
    }
  } catch {
    // Non-blocking socket fallback
  }

  return apiResponse(res, 200, 'success', 'Member removed successfully', result)
})
