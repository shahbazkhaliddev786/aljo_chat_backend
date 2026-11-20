import { Router } from 'express'
import {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  verifyEmailController,
  resendVerification
} from '../controllers/auth.controller.js'
import { registerValidation, loginValidation, refreshTokenValidation } from '../validations/auth.validations.js'
import { validate } from '../middlewares/validation.middleware.js'
import { authMiddleware } from '../middlewares/auth.middleware.js'
import { uploadAvatar } from '../middlewares/multer.middleware.js'

export const authRouter = Router()

authRouter.post('/register', uploadAvatar, registerValidation, validate, register)
authRouter.post('/login', loginValidation, validate, login)
authRouter.post('/refresh-token', refreshTokenValidation, validate, refreshToken)
authRouter.post('/logout', authMiddleware, logout)
authRouter.get('/me', authMiddleware, getProfile)
authRouter.post('/verify-email', verifyEmailController)
authRouter.post('/resend-verification', authMiddleware, resendVerification)
