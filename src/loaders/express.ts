import express, { Express } from 'express'
import helmet from 'helmet'
import cors from 'cors'
import cookieParser from 'cookie-parser'
import config from '../config/config.js'
import { arcjetMiddleware } from '../middlewares/arcjet.middleware.js'
import { LOCAL_UPLOAD_DIR } from '../utils/storage.js'

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

  // Locally stored uploads (only used when Cloudinary is not configured).
  // Served as downloads with sniffing disabled so uploaded files never run as pages.
  app.use(
    '/uploads',
    express.static(LOCAL_UPLOAD_DIR, {
      index: false,
      fallthrough: false,
      setHeaders: (res, filePath) => {
        res.setHeader('X-Content-Type-Options', 'nosniff')
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin')
        if (!/\.(png|jpe?g|gif|webp)$/i.test(filePath)) res.setHeader('Content-Disposition', 'attachment')
      }
    })
  )

  // Body & Cookie Parsers
  app.use(express.json({ limit: '15kb' }))
  app.use(express.urlencoded({ extended: true, limit: '15kb' }))
  app.use(cookieParser())

  // Arcjet Rate Limiting & Bot Protection
  app.use(arcjetMiddleware)
}
