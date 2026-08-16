import { pgTable, uuid, varchar, text, timestamp, pgEnum, uniqueIndex } from 'drizzle-orm/pg-core'
import { relations } from 'drizzle-orm'
import { users } from './users.js'
import { messages } from './messages.js'

export const conversationTypeEnum = pgEnum('conversation_type', ['direct', 'group'])
export const memberRoleEnum = pgEnum('member_role', ['admin', 'member'])

export const conversations = pgTable('conversations', {
  id: uuid('id').primaryKey().defaultRandom(),
  type: conversationTypeEnum('type').notNull(),
  title: varchar('title', { length: 150 }),
  avatarUrl: text('avatar_url'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  lastMessageAt: timestamp('last_message_at', { withTimezone: true }).defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
})

export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    conversationId: uuid('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: memberRoleEnum('role').default('member').notNull(),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    lastReadMessageId: uuid('last_read_message_id')
  },
  (table) => [uniqueIndex('conversation_user_idx').on(table.conversationId, table.userId)]
)

export const conversationsRelations = relations(conversations, ({ one, many }) => ({
  creator: one(users, {
    fields: [conversations.createdBy],
    references: [users.id]
  }),
  members: many(conversationMembers),
  messages: many(messages)
}))

export const conversationMembersRelations = relations(conversationMembers, ({ one }) => ({
  conversation: one(conversations, {
    fields: [conversationMembers.conversationId],
    references: [conversations.id]
  }),
  user: one(users, {
    fields: [conversationMembers.userId],
    references: [users.id]
  })
}))
