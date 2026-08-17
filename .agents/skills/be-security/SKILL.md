---
name: be-security
description: Enforces strict validation, parameterization, robust authorization (RBAC), and sanitization. Use when handling backend security, sql injection, owasp, auth middleware, rbac.
---

# Backend Security Standard (`be-security`)

This skill provides mandatory security guidelines and enforcement standards for Express 5, Node.js, and Drizzle ORM backends.

## Core Rules & Defenses

### 1. SQL Injection Prevention & Parameterization
- **Always use Drizzle ORM query builders**: Drizzle automatically parameterizes inputs passed through helper methods (`db.select()`, `db.insert()`, `where(eq(...))`).
- **Never interpolate strings into raw SQL queries**:
  ```ts
  // ❌ BAD
  await db.execute(sql.raw(`SELECT * FROM users WHERE email = '${userInput}'`));

  // ✅ GOOD
  await db.select().from(users).where(eq(users.email, userInput));
  ```

### 2. Strict Input Validation & Sanitization
- Validate all incoming `req.body`, `req.query`, and `req.params` using `express-validator` or `zod` schemas before touching controller/service logic.
- Sanitize string parameters to prevent XSS payloads if rendered or echoed back.

### 3. Authentication & Authorization (RBAC)
- **JWT Verification**: Validate token structure, algorithm (`HS256`/`RS256`), expiration, and signature in auth middleware.
- **RBAC Middleware**: Always enforce role-based access checks at the route middleware level:
  ```ts
  export const requireRole = (...allowedRoles: string[]) => {
    return (req: Request, res: Response, next: NextFunction) => {
      if (!req.user || !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      next();
    };
  };
  ```

### 4. Edge Security & Rate Limiting
- Enforce bot protection, rate-limiting, and attack detection using `@arcjet/node` or express rate limiters.
- Use `helmet()` middleware to set secure HTTP response headers (`Content-Security-Policy`, `X-Frame-Options`, `Strict-Transport-Security`).
