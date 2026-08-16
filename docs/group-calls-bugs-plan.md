# Group Call Bugs & Root Cause Solution Plan

## Bug 1: Ghost Participants (User leaves but is still visible to others)

### Root Cause Analysis
When a user leaves a call (either by clicking "End Call" or by closing the browser/disconnecting), the server attempts to broadcast the `sfu:user-left` event using `socket.to("conversation:" + conversationId)`. 
However, Socket.IO rooms (`conversation:id`) are only joined when a socket first connects to the server (`handlePresenceOnConnect`). If a conversation was created after connection, or if the socket reconnected, the remaining users are **not inside that Socket.IO room**. Therefore, the remaining members never receive the `sfu:user-left` event, their frontend `remoteStreams` state is never updated, and the departed user's video tile remains on screen indefinitely.

### Implementation Plan
1. In `backend/src/sockets/mediasoup.handler.ts` (for explicit `sfu:leave-room`) and `presence.handler.ts` (for disconnects), query conversation members from the database.
2. Broadcast the `sfu:user-left` event directly to each member's personal user room (`io.to("user:" + member.userId)`), matching the reliable pattern used by `sfu:initiate-call`.
3. On the frontend (`useGroupCall.ts`), ensure `handleUserLeft` cleans up participant tracks and state cleanly.

---

## Bug 2: Instant Join & Ghost Rooms (Bypassing Calling Modal on New Calls)

### Root Cause Analysis
In `mediasoup.service.ts`, `removeSocketFromRoom` was previously removing producers by checking `p.socketId === socket.id`. 
If a user's socket reconnected during a call session, their `socket.id` changed. When they later clicked "End Call", the backend looked for producers matching their *new* socket ID, leaving their *old* producers orphaned in memory.
Because the room's producer count (`room.producers.size`) never reached `0`, the Mediasoup room and router were **never destroyed**.
When any member started a new call in that group later, the frontend called `sfu:get-producers`. The backend returned these orphaned zombie producers. Seeing `hasRemoteProducers = true`, the frontend immediately set the call status to `connected`, bypassing the "Calling..." modal and rendering ghost participants from the previous call.

### Implementation Plan
1. In `backend/src/services/mediasoup.service.ts`, update producer/consumer cleanup functions (`removeUserFromRoom` and `removeSocketFromAllRooms`) to match and delete by **`userId`** (and `socketId`), ensuring socket ID changes during reconnects can never leave behind orphan producers.
2. Ensure that when all producers for a room are removed, the room's Mediasoup `Router` is closed and deleted from the `rooms` Map.
3. In `sfu:get-producers`, filter out any invalid/stale producers before returning them to the client.
