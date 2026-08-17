---
name: telemetry-observability
description: Replaces raw print statements with structured JSON logs containing global span IDs and trace context. Use when handling logging, opentelemetry, metrics, tracing, context tracking.
---

# Telemetry & Observability Standard (`telemetry-observability`)

This skill defines logging, distributed tracing, metrics collection, and contextual error reporting rules using Winston and OpenTelemetry patterns.

## Observability Rules

### 1. Structured Logging over `console.log`
- **Never use bare `console.log` or `console.error` in production services**.
- Use the central Winston logger instance from `src/utils/logger.ts` to output structured JSON logs:
  ```ts
  // ❌ BAD
  console.log("User logged in:", userId);

  // ✅ GOOD
  logger.info("User authentication successful", {
    userId,
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });
  ```

### 2. Trace Context & Request ID Propagation
- Attach a unique `requestId` or OpenTelemetry `traceId` / `spanId` to every incoming request context via middleware.
- Pass `requestId` into child logger invocations across asynchronous execution chains, Socket.io handlers, and database queries.

### 3. Log Levels & Error Stacks
- Use appropriate log levels:
  - `error`: Unhandled exceptions, failed DB operations, critical API failures (include `error.stack`).
  - `warn`: Rate limits triggered, fallback execution paths, non-fatal anomalies.
  - `info`: Key domain lifecycle events (user signup, room creation, transport connected).
  - `debug`: Detailed diagnostics (Socket signals, transport parameters).

### 4. Metrics & Performance Telemetry
- Track key operational metrics (HTTP response times, Socket.io active connections, Mediasoup producer counts) and export formatted metrics for monitoring systems.
