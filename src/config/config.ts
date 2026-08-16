import dotenvFlow from 'dotenv-flow'

dotenvFlow.config()

export const config = {
  PORT: process.env.PORT || 5000,
  ENV: process.env.NODE_ENV || 'development',
  SERVER_URL: process.env.SERVER_URL || 'http://localhost:5000',
  CLIENT_URL: process.env.CLIENT_URL || 'http://localhost:3000',

  // Database
  DATABASE_URL: process.env.DATABASE_URL as string,

  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'super-secret-access-token-key-aljo-chat',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  REFRESH_TOKEN_SECRET: process.env.REFRESH_TOKEN_SECRET || 'super-secret-refresh-token-key-aljo-chat',
  REFRESH_TOKEN_EXPIRES_IN: process.env.REFRESH_TOKEN_EXPIRES_IN || '30d',

  // Arcjet
  ARCJET_KEY: process.env.ARCJET_KEY || '',

  // Cloudinary
  CLOUDINARY: {
    CLOUD_NAME: process.env.CLOUDINARY_CLOUD_NAME || '',
    API_KEY: process.env.CLOUDINARY_API_KEY || '',
    API_SECRET: process.env.CLOUDINARY_API_SECRET || ''
  },

  // SMTP
  SMTP: {
    HOST: process.env.SMTP_HOST || 'smtp.gmail.com',
    PORT: Number(process.env.SMTP_PORT) || 587,
    USER: process.env.SMTP_USER || '',
    PASS: process.env.SMTP_PASS || '',
    FROM: process.env.EMAIL_FROM || '"aljo chat" <no-reply@aljochat.com>'
  }
}

export default config
