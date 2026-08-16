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
import { directConversationValidation, groupConversationValidation } from '../validations/conversation.validations.js'
import { validate } from '../middlewares/validation.middleware.js'

export const conversationRouter = Router()

conversationRouter.use(authMiddleware)

conversationRouter.get('/', listConversations)
conversationRouter.post('/direct', directConversationValidation, validate, getDirect)
conversationRouter.post('/group', groupConversationValidation, validate, createGroup)
conversationRouter.get('/:id', getDetails)

conversationRouter.delete('/:id/leave', leaveGroup)
conversationRouter.delete('/:id/group', deleteGroup)
conversationRouter.delete('/:id/direct', deleteDirect)

conversationRouter.post('/:id/members', addMembers)
conversationRouter.delete('/:id/members/:targetUserId', removeMember)
