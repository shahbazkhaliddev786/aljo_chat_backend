import { createServer } from 'http'
import { createApp } from './app.js'
import loaders from './loaders/index.js'
import config from './config/config.js'
import logger from './utils/logger.js'
import { getIO } from './loaders/socket.js'
import { mediasoupService } from './services/mediasoup.service.js'

const SHUTDOWN_TIMEOUT_MS = 10_000

/**
 * Graceful shutdown on SIGTERM/SIGINT (deploys, docker stop). Without this,
 * mediasoup's own signal listener kept the process serving after SIGTERM and
 * it then exited with an error code. Sockets are closed right away so clients
 * reconnect to the new instance.
 */
function registerShutdown(httpServer: ReturnType<typeof createServer>) {
  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info('SHUTDOWN_STARTED', { meta: { signal } })
    setTimeout(() => process.exit(1), SHUTDOWN_TIMEOUT_MS).unref()

    mediasoupService.close()
    try {
      getIO().close() // disconnects every socket and closes the HTTP server
    } catch {
      httpServer.close()
    }
    httpServer.close(() => {
      logger.info('SHUTDOWN_COMPLETE')
      process.exit(0)
    })
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

async function startServer() {
  const app = createApp()
  const httpServer = createServer(app)
  registerShutdown(httpServer)

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
