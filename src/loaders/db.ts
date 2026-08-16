import { db } from '../db/index.js'
import { sql } from 'drizzle-orm'
import logger from '../utils/logger.js'

export default async function dbLoader() {
  try {
    await db.execute(sql`SELECT 1`)
    logger.info('DATABASE_CONNECTED', { meta: { status: 'Connected to Supabase PostgreSQL via Drizzle ORM' } })
  } catch (error: any) {
    logger.error('DATABASE_CONNECTION_FAILED', { meta: { error: error.message } })
    throw error
  }
}
