---
name: be-idempotency
description: Designs safe, unique retry strategies and processing keys for distributed external events. Use when handling idempotency, webhook, retry, consumer, payment processing.
---

# Idempotency & Distributed Event Retries (`be-idempotency`)

This skill provides patterns to design safe, idempotent API endpoints, webhook receivers, and event consumers that support retries without duplicate side-effects.

## Idempotency Patterns

### 1. Idempotency Key Handling
- For critical mutating endpoints (e.g. payment processing, message dispatch, order creation), accept an `Idempotency-Key` HTTP header.
- Store key status in Redis or DB with an expiration period:
  ```ts
  const idempotencyKey = req.headers['idempotency-key'] as string;
  if (idempotencyKey) {
    const cachedResponse = await redis.get(`idempotency:${idempotencyKey}`);
    if (cachedResponse) {
      return res.status(200).json(JSON.parse(cachedResponse));
    }
  }
  ```

### 2. Webhook Event Deduplication
- Incoming webhooks (from Stripe, Cloudinary, auth providers) can be delivered multiple times.
- Always log and verify the event ID in a deduplication log table or key before executing processing logic:
  ```ts
  const processed = await redis.set(`webhook:${eventId}`, '1', 'EX', 86400, 'NX');
  if (!processed) {
    return res.status(200).json({ received: true, note: 'Duplicate event skipped' });
  }
  ```

### 3. Safe Retries & Transactional Outbox
- Combine idempotency checking with exponential backoff when retrying failed external calls.
- Use the **Transactional Outbox Pattern** when emitting domain events: write the event payload to the database inside the same transaction as the entity mutation, then process it asynchronously.
