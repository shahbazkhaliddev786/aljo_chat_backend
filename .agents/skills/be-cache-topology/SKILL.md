---
name: be-cache-topology
description: Architects smart distributed memory layers with explicit, automated cache-eviction rules. Use when handling caching, redis, cache invalidation, stale data.
---

# Cache Topology & Eviction Strategies (`be-cache-topology`)

This skill defines rules for architecting distributed caching layers (Redis / In-Memory), managing key namespacing, setting TTLs, and enforcing cache invalidation on database mutations.

## Caching Strategy Standards

### 1. Cache-Aside Pattern
- Fetch data from cache first; on cache miss, query the database, write to cache with a TTL, and return the payload:
  ```ts
  async function getUserProfile(userId: string) {
    const cacheKey = `user:profile:${userId}`;
    const cached = await redis.get(cacheKey);
    if (cached) return JSON.parse(cached);

    const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
    if (user) {
      await redis.set(cacheKey, JSON.stringify(user), 'EX', 3600); // 1 hour TTL
    }
    return user;
  }
  ```

### 2. Explicit Cache Invalidation Hooks
- **Always invalidate or update relevant cache keys on database updates/deletes**:
  ```ts
  async function updateUserProfile(userId: string, updateData: Partial<User>) {
    await db.update(users).set(updateData).where(eq(users.id, userId));
    // Invalidate stale cache key
    await redis.del(`user:profile:${userId}`);
  }
  ```

### 3. Key Namespacing & TTL Governance
- Use clear hierarchical namespaces: `entity:subsystem:identifier` (e.g. `chat:conv:1234:messages`).
- Never set keys without an explicit TTL unless using persistent data structures (such as session lookup maps).
- Use TTL jitter (randomized +/- 5-10% of TTL) to prevent Cache Stampedes / Thundering Herd problems.
