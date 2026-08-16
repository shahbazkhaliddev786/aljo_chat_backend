import type { Express } from 'express'
import { Server as HttpServer } from 'http'
import dbLoader from './db.js'
import expressLoader from './express.js'
import routesLoader from './routes.js'
import socketLoader from './socket.js'
import globalErrorHandler from '../middlewares/global-error.handler.js'
import logger from '../utils/logger.js'

export default async function loaders({ app, httpServer }: { app: Express; httpServer: HttpServer }) {
  // 1. Check DB connection
  await dbLoader()

  // 2. Load Express middlewares
  await expressLoader(app)
  logger.info('Express loader initialized')

  // 3. Load REST routes
  await routesLoader(app)
  logger.info('Routes loader initialized')

  // 4. Attach Global Error Handler (must be registered AFTER routes)
  app.use(globalErrorHandler)

  // 5. Load Socket.io real-time engine
  await socketLoader(httpServer)
  logger.info('Socket loader initialized')
}
