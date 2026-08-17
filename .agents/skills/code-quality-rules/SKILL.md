---
name: code-quality-rules
description: Standardizes structural naming conventions, clean function signatures, and explicit patterns. Use when handling formatting, linter, code style, naming, readability.
---

# Code Quality & Style Standard (`code-quality-rules`)

This skill standardizes naming conventions, function signatures, TypeScript typing practices, and formatting across the project.

## Naming & Typing Standards

### 1. Explicit Naming Conventions
- **Variables & Functions**: `camelCase` (e.g., `getUserById`, `activeCallRoom`).
- **Interfaces & Types**: `PascalCase` (e.g., `UserProfile`, `SocketPayload`).
- **Constants**: `UPPER_SNAKE_CASE` (e.g., `MAX_RETRY_ATTEMPTS`, `JWT_SECRET`).
- **Files**: `kebab-case` or domain-aligned (e.g., `mediasoup.service.ts`, `auth.controller.ts`).

### 2. Explicit Function Signatures & Return Types
- Always define explicit return types for exported functions and service methods:
  ```ts
  // ❌ BAD (Implicit return type)
  export const findUser = async (id: string) => { ... }

  // ✅ GOOD (Explicit return type)
  export const findUser = async (id: string): Promise<User | null> => { ... }
  ```

### 3. Parameter Limits & Clean Signatures
- Limit function parameters to a maximum of 3 arguments. If more are required, group them into an options object interface:
  ```ts
  // ✅ GOOD
  interface CreateRoomOptions {
    name: string;
    isPrivate: boolean;
    maxParticipants?: number;
  }
  export function createRoom(options: CreateRoomOptions): Promise<Room> { ... }
  ```

### 4. Zero Dead Code & Strict Linting
- Remove unused variables, imports, and commented-out legacy code blocks.
- Prefix intentionally unused arguments (e.g., in Express middleware signatures) with an underscore (`_req`, `_next`).
