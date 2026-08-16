import express, { Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import config from '../config/config.js'
import { arcjetMiddleware } from '../middlewares/arcjet.middleware.js'

export default async function expressLoader(app: Express) {
  app.set('trust proxy', 1)

  // Security HTTP headers
  app.use(
    helmet({
      contentSecurityPolicy: false
    })
  )

  // CORS Policy
  app.use(
    cors({
      origin: config.CLIENT_URL || true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']
    })
  )

  // Body & Cookie Parsers
  app.use(express.json({ limit: '15kb' }))
  app.use(express.urlencoded({ extended: true, limit: '15kb' }))
  app.use(cookieParser())

  // Arcjet Rate Limiting & Bot Protection
  app.use(arcjetMiddleware)
}
