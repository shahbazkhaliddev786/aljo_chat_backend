import { drizzle } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'
import config from '../config/config.js'
import * as schema from './schema/index.js'

// For query client
const queryClient = postgres(config.DATABASE_URL)

export const db = drizzle(queryClient, { schema })

export type DB = typeof db
