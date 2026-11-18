import { Router } from 'express'
import { search, getById, updateProfile, setPublicKey, getMyKeyBackup } from '../controllers/user.controller.js'
import { authMiddleware } from '../middlewares/auth.middleware.js'
import { uploadAvatar } from '../middlewares/multer.middleware.js'
import { validate } from '../middlewares/validation.middleware.js'
import { uuidParam } from '../validations/common.validations.js'
import { updateProfileValidation } from '../validations/auth.validations.js'

export const userRouter = Router()

userRouter.use(authMiddleware)

userRouter.get('/search', search)
userRouter.get('/me/key-backup', getMyKeyBackup)
userRouter.get('/:id', uuidParam('id'), validate, getById)
userRouter.patch('/profile', uploadAvatar, updateProfileValidation, validate, updateProfile)
userRouter.patch('/public-key', setPublicKey)
