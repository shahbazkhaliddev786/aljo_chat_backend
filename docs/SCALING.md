# Scaling aljo chat backend

## Today: one instance, scaled vertically

The backend must run as **one process** (`ecosystem.config.js` uses `instances: 1`). Three pieces of state live in that process's memory:

| State | Where | Why it pins us to one process |
| --- | --- | --- |
| Socket.IO rooms (`user:*`, `conversation:*`) | Socket.IO in-memory adapter | A message emitted on instance A never reaches sockets connected to instance B. |
| 1-on-1 call registry (`callId` → two sockets) | `sockets/call.handler.ts` | Signaling is relayed between two specific sockets, which may live on different instances. |
| Group-call rooms (routers, transports, producers) | `services/mediasoup.service.ts` | Media for a call must flow through the worker that owns its router. |

Adding the Socket.IO Redis adapter alone would fix only the first row. Calls would still break at random whenever two participants landed on different instances. That is why the adapter is not enabled yet.

### Capacity knobs for one machine

- **`MEDIASOUP_NUM_WORKERS`** (default: number of cores, max 4). Each mediasoup worker is single-threaded and uses one core. New calls go to the least busy worker.
- **`MEDIASOUP_RTC_MIN_PORT` / `MEDIASOUP_RTC_MAX_PORT`.** All workers share the whole range (mediasoup skips ports already in use), so a single call can use all of it. Each participant uses 2 transports, and each transport takes one UDP and one TCP port from the range. Size the range at about 2 × the peak number of concurrent call participants (across all calls), and open the same range in the firewall and container.
- **Postgres.** The hot queries are indexed (`messages_conversation_created_idx`, `conversation_members_user_idx`). Use a pooled connection (Supabase pooler) and raise `max` on the `postgres()` client if the database allows.
- **TURN.** Relay traffic goes through your TURN server, not this process. Size it separately.

A single mid-size VM (4 vCPU) typically handles thousands of connected chat users and a few hundred concurrent call participants. Measure before scaling out.

## Next step: multiple instances

Do these together, in this order:

1. **Socket.IO Redis adapter** (`@socket.io/redis-adapter`) with `REDIS_URL`. Room emits and `fetchSockets()` then work across instances. Presence checks already use `fetchSockets()`, so they keep working.
2. **Sticky sessions** at the load balancer (cookie or IP hash), so a socket's polling and websocket requests reach the same instance.
3. **Move the 1-on-1 call registry to Redis.** Store calls as hashes keyed by `callId`, keep TTLs for ringing, and send signaling with `io.to(socketId)`, which the adapter routes across instances.
4. **Route each group call to one SFU node.** Store `conversationId → node` in Redis and have clients open their SFU connection to that node: either give the SFU its own URL per node, or keep SFU signaling on the main socket and proxy it. For very large calls, mediasoup's `pipeToRouter` can link routers across workers or nodes.
5. **Shared file storage.** Configure Cloudinary. The local `uploads/` fallback is per machine and only meant for development.

Until those are in place, scale up the single machine instead of adding instances.
