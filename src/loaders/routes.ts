import type { Express } from 'express'
import { authRouter, userRouter, conversationRouter, messageRouter } from '../routes/index.js'

export default async function routesLoader(app: Express) {
  // Health & Root Status
  app.get('/', (_, res) => {
    res.status(200).json({
      status: 'success',
      message: 'Welcome to aljo chat API! Real-time backend is live.'
    })
  })

  app.get('/api/v1/health', (_, res) => {
    res.status(200).json({
      status: 'success',
      message: 'Health check OK',
      timestamp: new Date().toISOString()
    })
  })

  // Versioned API routes
  app.use('/api/v1/auth', authRouter)
  app.use('/api/v1/users', userRouter)
  app.use('/api/v1/conversations', conversationRouter)
  app.use('/api/v1/messages', messageRouter)

  // Unmatched route catch-all (404)
  app.use((req, res) => {
    res.status(404).json({
      status: 'error',
      message: 'Route not found'
    })
  })
}
