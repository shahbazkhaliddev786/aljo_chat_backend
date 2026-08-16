import { Router } from 'express'
import { search, getById, updateProfile, setPublicKey } from '../controllers/user.controller.js'
import { authMiddleware } from '../middlewares/auth.middleware.js'
import { uploadAvatar } from '../middlewares/multer.middleware.js'

export const userRouter = Router()

userRouter.use(authMiddleware)

userRouter.get('/search', search)
userRouter.get('/:id', getById)
userRouter.patch('/profile', uploadAvatar, updateProfile)
userRouter.patch('/public-key', setPublicKey)
