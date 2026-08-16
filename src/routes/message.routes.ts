import { Router } from 'express'
import { getMessages, sendMessageHttp } from '../controllers/message.controller.js'
import { authMiddleware } from '../middlewares/auth.middleware.js'
import { sendMessageValidation } from '../validations/message.validations.js'
import { validate } from '../middlewares/validation.middleware.js'
import { uploadSingleFile } from '../middlewares/multer.middleware.js'

export const messageRouter = Router()

messageRouter.use(authMiddleware)

messageRouter.get('/:conversationId', sendMessageValidation, validate, getMessages)
messageRouter.post('/:conversationId', uploadSingleFile, sendMessageValidation, validate, sendMessageHttp)
