import { param, query, body } from 'express-validator'

export const sendMessageValidation = [
  param('conversationId').isUUID().withMessage('Valid conversationId UUID is required')
]

export const getMessagesValidation = [
  param('conversationId').isUUID().withMessage('Valid conversationId UUID is required'),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100').toInt(),
  query('before').optional().isUUID().withMessage('before must be a message id')
]

const MAX_TEXT_LENGTH = 10_000

export const sendMessageBodyValidation = [
  body('content').optional().isString().isLength({ max: MAX_TEXT_LENGTH }).withMessage('Message is too long'),
  body('ciphertext')
    .optional()
    .isString()
    .isLength({ max: MAX_TEXT_LENGTH * 2 })
    .withMessage('Message is too long'),
  body('clientMessageId').optional().isUUID().withMessage('clientMessageId must be a UUID')
]
