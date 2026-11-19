import type { Request, Response } from 'express'
import { asyncHandler } from '../utils/async.handler.js'
import { apiResponse } from '../utils/api.response.js'
import {
  registerUser,
  loginUser,
  refreshAccessToken,
  logoutUser,
  isEmailTaken,
  sendVerificationEmailSafely,
  verifyEmail,
  resendVerificationEmail
} from '../services/auth.service.js'
import { conflict } from '../utils/app-error.js'
import { uploadFile } from '../utils/storage.js'

export const register = asyncHandler(async (req: Request, res: Response) => {
  // Check before uploading so a failed registration does not leave an orphaned avatar.
  if (await isEmailTaken(req.body.email)) throw conflict('User with this email already exists')

  let avatarUrl: string | undefined
  if (req.file) {
    avatarUrl = await uploadFile(req.file, 'aljo-chat/avatars')
  }

  const result = await registerUser({
    ...req.body,
    avatarUrl
  })

  sendVerificationEmailSafely(result.user.id, result.user.email, result.user.name)
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

export const verifyEmailController = asyncHandler(async (req: Request, res: Response) => {
  const result = await verifyEmail(req.body.token)
  return apiResponse(res, 200, 'success', 'Email verified', result)
})

export const resendVerification = asyncHandler(async (req: Request, res: Response) => {
  await resendVerificationEmail(req.user?.id as string)
  return apiResponse(res, 200, 'success', 'Verification email sent')
})
