---
name: migration-safety
description: Scans migration scripts to ensure they don't lock active production database tables or break live workflows. Use when handling database migration, schema change, alter table, drop column.
---

# Database Migration Safety & Zero-Downtime (`migration-safety`)

This skill provides guidelines for auditing Drizzle ORM SQL migration scripts to ensure zero downtime, prevent heavy table locking, and maintain backward compatibility with running API servers.

## Migration Safety Guidelines

### 1. Preventing Heavy Table Locks
- **Adding Columns with Default Values**: Avoid `ALTER TABLE ... ADD COLUMN ... NOT NULL DEFAULT ...` on large PostgreSQL tables without checking PostgreSQL version capabilities, as older versions rewrite the entire table while holding an exclusive lock.
- **Index Creation**: Always use `CREATE INDEX CONCURRENTLY` for production migrations so write operations on the table are not blocked.

### 2. Two-Phase Column Deprecation & Drops
- **Never drop a column immediately** if active API instances are still reading or writing to it.
- **Phase 1**: Mark the column deprecated in code, make it nullable in DB schema, and deploy API updates that no longer rely on it.
- **Phase 2**: Drop the column in a subsequent deployment migration (`ALTER TABLE ... DROP COLUMN ...`).

### 3. Safe Column Renaming
- Instead of `ALTER TABLE ... RENAME COLUMN old_name TO new_name`:
  1. Add `new_name` as a new column.
  2. Dual-write to both `old_name` and `new_name` in application services.
  3. Backfill existing rows asynchronously.
  4. Switch reads to `new_name`.
  5. Remove `old_name`.
