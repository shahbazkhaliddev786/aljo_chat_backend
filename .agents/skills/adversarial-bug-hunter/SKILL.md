---
name: adversarial-bug-hunter
description: Acts as a hostile QA agent to write stress-testing suites targeted directly at breaking your code changes. Use when handling write edge case tests, break code, find bugs, smoke test.
---

# Adversarial Bug Hunter (`adversarial-bug-hunter`)

This skill acts as a hostile QA agent designed to break code changes by crafting aggressive stress tests, fuzz inputs, null/undefined payloads, and concurrency edge cases.

## Hostile QA Testing Guidelines

### 1. Boundary & Malicious Payload Injection
- Test endpoints with extreme payload sizes, zero-length strings, negative numbers, non-UUID identifiers, and invalid JSON structures.
- Inject special characters, SQL fragments, and HTML/script tags into string fields to test sanitization layers.

### 2. Disconnect & Teardown Stress Testing (Sockets & WebRTC)
- Simulate abrupt client socket disconnections mid-handshake or mid-WebRTC transport creation.
- Verify Mediasoup transports, producers, and consumers are properly closed and garbage collected without leaking memory or orphaned worker resources.

### 3. Race Conditions & Duplicate Event Injection
- Fire rapid duplicate requests (e.g. joining the same call 5 times simultaneously in parallel) to expose unhandled race conditions or duplicate record insertions.
- Verify room cleanup timers when the last participant leaves during a reconnect attempt.

### 4. Null Pointer & Unhandled Exception Probing
- Inspect nested object property accesses (e.g., `req.user.id`, `transport.appData.peerId`) and verify optional chaining (`?.`) or explicit non-null guards are in place.
