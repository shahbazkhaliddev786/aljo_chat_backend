---
name: be-concurrency-guard
description: Identifies concurrent mutations and inserts pessimistic/optimistic locking or atomic writes. Use when handling race condition, atomic, database transaction, lock, locking.
---

# Concurrency Guard & Atomic Operations (`be-concurrency-guard`)

This skill defines patterns for preventing race conditions, managing concurrent database mutations, enforcing atomic writes, and implementing locking mechanisms in backend services.

## Concurrency Protection Patterns

### 1. Atomic Database Operations
- Never fetch a value, mutate it in application memory, and write it back if concurrent requests can modify the same record.
- Use atomic SQL expressions directly:
  ```ts
  // ❌ BAD (Race condition under concurrent requests)
  const room = await db.select().from(rooms).where(eq(rooms.id, roomId));
  await db.update(rooms).set({ participantCount: room.participantCount + 1 });

  // ✅ GOOD (Atomic database execution)
  await db.update(rooms)
    .set({ participantCount: sql`${rooms.participantCount} + 1` })
    .where(eq(rooms.id, roomId));
  ```

### 2. Database Transactions (`db.transaction`)
- Wrap related multi-table mutations inside explicit transactions to guarantee ACID compliance and automatic rollbacks on failure:
  ```ts
  await db.transaction(async (tx) => {
    await tx.insert(messages).values(newMessage);
    await tx.update(conversations)
      .set({ lastMessageId: newMessage.id })
      .where(eq(conversations.id, conversationId));
  });
  ```

### 3. Distributed Locking for WebSockets & Real-Time Call State
- Use Redis distributed locks (e.g. Redlock algorithm) or database row locks (`SELECT ... FOR UPDATE`) when coordinating active state updates (such as WebRTC producer allocation or active room state changes).
