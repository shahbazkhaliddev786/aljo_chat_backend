---
name: requirement-reviewer
description: Cross-references uncommitted changes against feature requirements to spot implementation gaps. Use when handling review ticket, verify against acceptance criteria, audit user story.
---

# Requirement Reviewer & Spec Auditor (`requirement-reviewer`)

This skill defines workflows for auditing current git diffs, uncommitted code, and newly added endpoints against feature tickets, user stories, and acceptance criteria.

## Audit Workflow

### 1. Acceptance Criteria Verification
- Compare every requirement listed in the feature ticket against implemented controllers, services, and route handlers.
- Verify that every specified input parameter is accepted and validated, and that every specified output field is returned in the response payload.

### 2. Identifying Implementation Gaps
- **Missing Endpoints**: Check if required CRUD or action routes are missing from `src/routes/`.
- **Unhandled Status Codes**: Ensure the API returns the correct HTTP status code for each scenario (e.g., `201 Created` on creation, `404 Not Found`, `400 Bad Request`, `409 Conflict`, `422 Unprocessable`).
- **Database Schema Completeness**: Ensure newly specified fields in user stories are mapped to `src/db/schema/` and migrated.

### 3. Edge Requirement Auditing
- Verify authorization constraints (e.g., "Only room admins can kick users") are enforced via middleware.
- Verify real-time socket notification requirements (e.g., "Broadcast event `user-joined` to room subscribers").
