import { body } from 'express-validator'

export const directConversationValidation = [
  body('targetUserId').isUUID().withMessage('Valid targetUserId UUID is required')
]

export const groupConversationValidation = [
  body('title').trim().notEmpty().withMessage('Group title is required'),
  body('memberIds')
    .isArray({ min: 2 })
    .withMessage('At least 2 other memberIds are required (minimum 3 total users for a group chat)')
    .custom((memberIds: string[], { req }) => {
      const creatorId = req.user?.id
      const uniqueMembers = new Set([creatorId, ...memberIds].filter(Boolean))
      if (uniqueMembers.size < 3) {
        throw new Error('Group chats must contain at least 3 distinct members. For 2 users, use a direct conversation.')
      }
      return true
    })
]
