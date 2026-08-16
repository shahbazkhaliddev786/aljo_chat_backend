import { param } from 'express-validator'

export const sendMessageValidation = [
  param('conversationId').isUUID().withMessage('Valid conversationId UUID is required')
]
