/// <reference types="node" />
import { defineConfig } from 'drizzle-kit'
import * as dotenv from 'dotenv-flow'

dotenv.config()

export default defineConfig({
  schema: './dist/db/schema/index.js',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL as string
  },
  verbose: true,
  strict: true
})
