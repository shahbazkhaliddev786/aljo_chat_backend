import { body } from 'express-validator'

export const directConversationValidation = [
  body('targetUserId').isUUID().withMessage('Valid targetUserId UUID is required')
]

const MAX_GROUP_MEMBERS = 100

export const groupConversationValidation = [
  body('title')
    .trim()
    .notEmpty()
    .withMessage('Group title is required')
    .isLength({ max: 150 })
    .withMessage('Group title must be at most 150 characters'),
  body('memberIds.*').isUUID().withMessage('memberIds must contain valid user ids'),
  body('memberIds')
    .isArray({ min: 2, max: MAX_GROUP_MEMBERS })
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

export const addMembersValidation = [
  body('memberIds')
    .isArray({ min: 1, max: MAX_GROUP_MEMBERS })
    .withMessage(`memberIds must be an array of 1-${MAX_GROUP_MEMBERS} user ids`),
  body('memberIds.*').isUUID().withMessage('memberIds must contain valid user ids')
]
