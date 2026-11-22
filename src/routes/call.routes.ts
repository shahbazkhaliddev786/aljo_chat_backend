import { Router } from 'express'
import { getIceServers } from '../controllers/call.controller.js'
import { authMiddleware } from '../middlewares/auth.middleware.js'

export const callRouter = Router()

callRouter.use(authMiddleware)

callRouter.get('/ice-servers', getIceServers)
