import { Router } from 'express'
import {
  getDirect,
  createGroup,
  listConversations,
  getDetails,
  leaveGroup,
  deleteGroup,
  deleteDirect,
  addMembers,
  removeMember
} from '../controllers/conversation.controller.js'
import { authMiddleware } from '../middlewares/auth.middleware.js'
import {
  directConversationValidation,
  groupConversationValidation,
  addMembersValidation
} from '../validations/conversation.validations.js'
import { uuidParam } from '../validations/common.validations.js'
import { validate } from '../middlewares/validation.middleware.js'

export const conversationRouter = Router()

conversationRouter.use(authMiddleware)

conversationRouter.get('/', listConversations)
conversationRouter.post('/direct', directConversationValidation, validate, getDirect)
conversationRouter.post('/group', groupConversationValidation, validate, createGroup)
conversationRouter.get('/:id', uuidParam('id'), validate, getDetails)

conversationRouter.delete('/:id/leave', uuidParam('id'), validate, leaveGroup)
conversationRouter.delete('/:id/group', uuidParam('id'), validate, deleteGroup)
conversationRouter.delete('/:id/direct', uuidParam('id'), validate, deleteDirect)

conversationRouter.post('/:id/members', uuidParam('id'), addMembersValidation, validate, addMembers)
conversationRouter.delete(
  '/:id/members/:targetUserId',
  uuidParam('id'),
  uuidParam('targetUserId'),
  validate,
  removeMember
)
