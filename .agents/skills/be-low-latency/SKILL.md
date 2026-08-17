---
name: be-low-latency
description: Profiles execution paths, optimizes algorithms, and cuts out redundant operational bottlenecks. Use when handling response time, latency, fast response, cpu intensive.
---

# Low Latency & High Performance Execution (`be-low-latency`)

This skill provides guidelines for minimizing API response times, unblocking the Node.js event loop, profiling execution paths, and eliminating operational bottlenecks.

## Execution Rules

### 1. Non-Blocking Asynchronous Work
- Never block the single-threaded Node.js event loop with CPU-intensive operations (heavy encryption, large JSON parses, synchronous file I/O).
- Offload heavy compute tasks to worker threads or background queues.

### 2. Parallelizing Independent Async Operations
- Execute non-dependent `async` tasks in parallel using `Promise.all()` instead of sequential `await` calls:
  ```ts
  // ❌ BAD (Sequential latency addition: t1 + t2)
  const user = await fetchUser(userId);
  const settings = await fetchSettings(userId);

  // ✅ GOOD (Parallel execution: max(t1, t2))
  const [user, settings] = await Promise.all([
    fetchUser(userId),
    fetchSettings(userId),
  ]);
  ```

### 3. Response Streaming & Compression
- Use Gzip/Brotli compression middleware (`compression()`) for large HTTP responses.
- For streaming media or real-time event updates, stream data directly via WebSockets or Server-Sent Events (SSE).

### 4. Profiling & Bottleneck Detection
- Wrap critical path methods in performance timers to log latency spikes:
  ```ts
  const start = performance.now();
  await processTask();
  const duration = performance.now() - start;
  if (duration > 100) logger.warn(`Slow execution detected: ${duration}ms`);
  ```
