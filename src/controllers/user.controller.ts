import type { Request, Response } from 'express'
import { asyncHandler } from '../utils/async.handler.js'
import { apiResponse } from '../utils/api.response.js'
import { searchUsers, getUserById, updateUserProfile, updatePublicKey, getKeyBackup } from '../services/user.service.js'
import { uploadFile } from '../utils/storage.js'
import { getIO } from '../loaders/socket.js'
import { conversationRoom } from '../sockets/rooms.js'
import { db } from '../db/index.js'
import { conversationMembers } from '../db/schema/conversations.js'
import { eq } from 'drizzle-orm'
import logger from '../utils/logger.js'

export const search = asyncHandler(async (req: Request, res: Response) => {
  const query = req.query.q as string
  const currentUserId = req.user?.id as string
  const users = await searchUsers(query, currentUserId)
  return apiResponse(res, 200, 'success', 'Users found', { users })
})

export const getById = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.params.id as string
  const user = await getUserById(userId)
  return apiResponse(res, 200, 'success', 'User profile retrieved', { user })
})

export const updateProfile = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  let avatarUrl: string | undefined

  if (req.file) {
    avatarUrl = await uploadFile(req.file, 'aljo-chat/avatars')
  }

  const updatedUser = await updateUserProfile(userId, {
    name: req.body.name,
    bio: req.body.bio,
    avatarUrl
  })

  return apiResponse(res, 200, 'success', 'Profile updated successfully', { user: updatedUser })
})

export const setPublicKey = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const { publicKey, keyBackup } = req.body

  if (!publicKey || typeof publicKey !== 'string' || publicKey.length > 2048) {
    return apiResponse(res, 400, 'error', 'Valid publicKey string is required')
  }
  if (keyBackup !== undefined && (typeof keyBackup !== 'string' || keyBackup.length > 8192)) {
    return apiResponse(res, 400, 'error', 'keyBackup must be a string')
  }

  const user = await updatePublicKey(userId, publicKey, keyBackup)

  // Let contacts refresh this user's key, so chats switch to encrypted without a reload.
  try {
    const memberships = await db
      .select({ conversationId: conversationMembers.conversationId })
      .from(conversationMembers)
      .where(eq(conversationMembers.userId, userId))
    const rooms = memberships.map((m) => conversationRoom(m.conversationId))
    if (rooms.length > 0) getIO().to(rooms).emit('user_key_updated', { userId })
  } catch (err: any) {
    logger.error('USER_KEY_BROADCAST_FAILED', { meta: { error: err.message } })
  }

  return apiResponse(res, 200, 'success', 'Public key published successfully', { user })
})

export const getMyKeyBackup = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const keys = await getKeyBackup(userId)
  return apiResponse(res, 200, 'success', 'Key backup retrieved', keys)
})
