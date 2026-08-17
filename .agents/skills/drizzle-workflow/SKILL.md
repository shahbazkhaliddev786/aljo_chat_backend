---
name: drizzle-workflow
description: Instructions and workflows for managing database schemas, migrations, and queries with Drizzle ORM in Aljo Chat Backend.
---

# Drizzle ORM Workflow & Best Practices

This skill outlines the process for updating database schemas, generating migrations, and executing database queries in the Aljo Chat Backend.

## 1. Schema Modifications

- Database schemas are located under [src/db/schema](file:///c:/Users/shahb/OneDrive/Desktop/Shahbaz/Projects/aljo-chat/backend/src/db/schema).
- Always export schema tables and relations from their respective files and re-export from `src/db/schema/index.ts`.

## 2. Generating & Running Migrations

When you add or update any table in `src/db/schema/`:

1. **Generate Migration Files**:
   ```bash
   npm run db:generate
   ```
   This uses `drizzle-kit` to create SQL migration files in `src/db/migrations/`.

2. **Push Schema (Development)**:
   ```bash
   npm run db:push
   ```
   Directly applies schema changes to the connected PostgreSQL / Supabase instance.

3. **Database Studio**:
   ```bash
   npm run db:studio
   ```
   Opens Drizzle Studio to inspect and manage data visually.

## 3. Query Guidelines

- Always import `db` from `src/db/index.ts`.
- Use type-safe Drizzle query builders (`db.select()`, `db.insert()`, `db.update()`, `db.delete()`).
- Avoid raw SQL strings unless complex operations (such as GIS or raw aggregations) strictly require them.
