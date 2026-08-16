import { pgTable, uuid, varchar, text, boolean, timestamp, pgEnum } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { refreshTokens } from './tokens.js'
import { conversationMembers } from './conversations.js'
import { messages } from './messages.js'

export const userStatusEnum = pgEnum('user_status', ['online', 'offline', 'away'])

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  password: varchar('password', { length: 255 }).notNull(),
  avatarUrl: text('avatar_url'),
  bio: text('bio'),
  publicKey: text('public_key'),
  status: userStatusEnum('status').default('offline').notNull(),
  lastSeen: timestamp('last_seen', { withTimezone: true }),
  isVerified: boolean('is_verified').default(false).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
})

export const usersRelations = relations(users, ({ many }) => ({
  refreshTokens: many(refreshTokens),
  conversationMemberships: many(conversationMembers),
  sentMessages: many(messages)
}))
