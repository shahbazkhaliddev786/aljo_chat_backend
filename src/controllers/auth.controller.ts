import type { Request, Response } from 'express'
import { asyncHandler } from '../utils/async.handler.js'
import { apiResponse } from '../utils/api.response.js'
import { registerUser, loginUser, refreshAccessToken, logoutUser } from '../services/auth.service.js'
import { uploadToCloudinary } from '../utils/cloudinary.js'

export const register = asyncHandler(async (req: Request, res: Response) => {
  let avatarUrl: string | undefined
  if (req.file) {
    avatarUrl = await uploadToCloudinary(req.file, 'aljo-chat/avatars')
  }

  const result = await registerUser({
    ...req.body,
    avatarUrl
  })

  return apiResponse(res, 201, 'success', 'User registered successfully', result)
})

export const login = asyncHandler(async (req: Request, res: Response) => {
  const result = await loginUser(req.body)
  return apiResponse(res, 200, 'success', 'Logged in successfully', result)
})

export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  const { refreshToken: token } = req.body
  const result = await refreshAccessToken(token)
  return apiResponse(res, 200, 'success', 'Token refreshed successfully', result)
})

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.id as string
  const { refreshToken: token } = req.body
  await logoutUser(userId, token)
  return apiResponse(res, 200, 'success', 'Logged out successfully')
})

export const getProfile = asyncHandler(async (req: Request, res: Response) => {
  return apiResponse(res, 200, 'success', 'Profile retrieved', { user: req.user })
})
