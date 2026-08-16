import type { Request, Response } from 'express'
import { asyncHandler } from '../utils/async.handler.js'
import { apiResponse } from '../utils/api.response.js'
import { searchUsers, getUserById, updateUserProfile, updatePublicKey } from '../services/user.service.js'
import { uploadToCloudinary } from '../utils/cloudinary.js'

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
    avatarUrl = await uploadToCloudinary(req.file, 'aljo-chat/avatars')
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
  const { publicKey } = req.body

  if (!publicKey || typeof publicKey !== 'string') {
    return apiResponse(res, 400, 'error', 'Valid publicKey string is required')
  }

  const user = await updatePublicKey(userId, publicKey)
  return apiResponse(res, 200, 'success', 'Public key published successfully', { user })
})
