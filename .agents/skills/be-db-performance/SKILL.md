---
name: be-db-performance
description: Audits ORM logic for N+1 queries, suggests strategic database indexing, and checks query plans. Use when handling n+1 queries, db performance, database optimization, indexing.
---

# Database Performance & Optimization (`be-db-performance`)

This skill focuses on auditing ORM queries, eliminating N+1 query bottlenecks, managing database indexes, and optimizing data fetch execution paths in Drizzle ORM and PostgreSQL.

## Core Guidelines

### 1. Eliminating N+1 Query Loops
- **Never perform database queries inside `.map()`, `.forEach()`, or loops**:
  ```ts
  // ❌ BAD (N+1 queries)
  const users = await db.select().from(usersTable);
  for (const user of users) {
    user.posts = await db.select().from(postsTable).where(eq(postsTable.userId, user.id));
  }

  // ✅ GOOD (Single relational query or JOIN)
  const usersWithPosts = await db.query.usersTable.findMany({
    with: {
      posts: true,
    },
  });
  ```

### 2. Strategic Database Indexing
- Ensure every foreign key, frequently filtered column (`where`), and sorted column (`orderBy`) has a defined index in the Drizzle table schema:
  ```ts
  export const messages = pgTable('messages', {
    id: uuid('id').primaryKey(),
    conversationId: uuid('conversation_id').notNull().references(() => conversations.id),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  }, (table) => ({
    conversationIdx: index('messages_conversation_idx').on(table.conversationId),
    conversationCreatedIdx: index('messages_conv_created_idx').on(table.conversationId, table.createdAt),
  }));
  ```

### 3. Query Projections & Selecting Necessary Fields
- Avoid fetching entire record objects when only specific columns are required.
- Use explicit `.select({ id: users.id, name: users.name })` to minimize memory allocation and network transport overhead.

### 4. Efficient Pagination
- Prefer **Cursor-based pagination** (using `id` or timestamp filters like `where(gt(messages.id, lastId))`) over high-offset `OFFSET` queries for large tables.
