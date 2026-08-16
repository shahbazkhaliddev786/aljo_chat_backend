import { createServer } from 'http'
import { createApp } from './app.js'
import loaders from './loaders/index.js'
import config from './config/config.js'
import logger from './utils/logger.js'

async function startServer() {
  const app = createApp()
  const httpServer = createServer(app)

  try {
    // Run loaders (Database, Express, Routes, Socket.io, Error Handler)
    await loaders({ app, httpServer })

    // Start HTTP & Socket server
    httpServer.listen(config.PORT, () => {
      logger.info('SERVER_STARTED', {
        meta: { PORT: config.PORT, SERVER_URL: config.SERVER_URL, ENV: config.ENV }
      })
    })
  } catch (err: any) {
    logger.error('APPLICATION_INIT_FAILED', { meta: { error: err.message, stack: err.stack } })
    process.exit(1)
  }
}

startServer()
