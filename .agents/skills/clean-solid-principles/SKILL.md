---
name: clean-solid-principles
description: Audits code against Single Responsibility, Open/Closed, Liskov, Interface Segregation, and Dependency Inversion. Use when handling solid, clean code, refactor, dry, design pattern.
---

# S.O.L.I.D & Clean Code Principles (`clean-solid-principles`)

This skill provides architectural guidelines for auditing, refactoring, and structuring TypeScript code against S.O.L.I.D principles and clean design patterns.

## S.O.L.I.D Enforcement Rules

### 1. Single Responsibility Principle (SRP)
- Every class, module, or function must have one primary reason to change.
- **Controllers**: Extracted request validation and response formatting ONLY.
- **Services**: Business domain logic only.
- **Repositories/DB**: Schema definitions and raw database query builders only.

### 2. Open/Closed Principle (OCP)
- Software entities should be open for extension, but closed for modification.
- Use interface abstraction and strategy patterns instead of massive `switch`/`if-else` blocks when adding new feature providers (e.g. storage providers, payment gateways, notification channels).

### 3. Liskov Substitution Principle (LSP)
- Derived types or implementations must be fully substitutable for their base types without breaking code execution or altering invariants.

### 4. Interface Segregation Principle (ISP)
- Create small, focused interfaces rather than single bloated interfaces:
  ```ts
  // ❌ BAD (Bloated interface forcing unused methods)
  interface MediaHandler {
    processVideo(): void;
    processAudio(): void;
    sendNotification(): void;
  }

  // ✅ GOOD (Segregated interfaces)
  interface AudioProcessor {
    processAudio(): void;
  }
  interface VideoProcessor {
    processVideo(): void;
  }
  ```

### 5. Dependency Inversion Principle (DIP)
- High-level modules should depend on abstractions (interfaces), not on concrete low-level implementations.
- Inject dependencies via service parameters or constructors to allow easy mocking and unit testing.
