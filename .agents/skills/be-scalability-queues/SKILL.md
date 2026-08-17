---
name: be-scalability-queues
description: Decouples synchronous API threads into background event workers (e.g., Redis, RabbitMQ, Kafka). Use when handling queues, workers, scalability, background jobs, pub/sub.
---

# Scalability & Background Queue Architecture (`be-scalability-queues`)

This skill defines patterns for decoupling synchronous HTTP/API handlers into scalable, asynchronous background job processors using Redis, BullMQ, or messaging brokers.

## Architectural Patterns

### 1. Synchronous API Thread Decoupling
- Never hold HTTP requests open while executing slow tasks (e.g., sending emails, transcoding media, processing webhook deliveries).
- Enqueue the job immediately and return an HTTP `202 Accepted` response with a job ID:
  ```ts
  app.post('/api/media/process', async (req, res) => {
    const job = await mediaQueue.add('transcode', { fileUrl: req.body.fileUrl });
    return res.status(202).json({ success: true, jobId: job.id });
  });
  ```

### 2. Worker Thread Isolation & Error Resilience
- Place queue consumers in separate worker files or worker processes so that job failures do not crash the primary API server.
- Implement explicit backoff and retry rules for transient failures:
  ```ts
  const worker = new Worker('mediaQueue', async (job) => {
    await transcodeVideo(job.data.fileUrl);
  }, {
    settings: {
      backoff: { type: 'exponential', delay: 1000 },
      attempts: 3,
    },
  });
  ```

### 3. Pub/Sub for Real-Time Event Fanout
- Use Redis Pub/Sub for horizontal scaling across multiple Node.js instances (e.g. Socket.io Redis Adapter).
- Ensure subscribers process events asynchronously and handle connection drops gracefully.
