# Aljo Chat Backend - Agent Guidelines & Development Rules

This repository contains the backend service for **Aljo Chat**, a real-time messaging and group audio/video call application built with Express 5, Drizzle ORM, Supabase PostgreSQL, Socket.io, Mediasoup (WebRTC SFU), and Arcjet security.

---

## Technical Stack Overview

- **Core Framework**: Express 5 on Node.js (TypeScript with `"type": "module"`)
- **Database & ORM**: Drizzle ORM with PostgreSQL / Supabase
- **Real-Time Communication**: Socket.io for messaging/events & Mediasoup for WebRTC SFU calls
- **Security & Validation**: `@arcjet/node`, `helmet`, `express-validator`, `bcryptjs`
- **File Management**: `multer` + `cloudinary` + `datauri`
- **Logging**: `winston` logger

---

## Directory & Architectural Structure

```text
src/
├── index.ts              # Entry point (HTTP server & Socket.io initialization)
├── app.ts                # Express app setup and middleware configuration
├── config/               # Environment & app configuration (Arcjet, Cloudinary, DB, etc.)
├── constants/            # Application constants and enums
├── controllers/          # Request controllers (keep thin, delegate to services)
├── db/                   # Drizzle client, migrations, and schema definitions
│   └── schema/           # Drizzle table schemas
├── loaders/              # Service loaders (Express, Socket.io, Mediasoup)
├── middlewares/          # Express middlewares (Auth, Rate Limiting, Arcjet, Error handling)
├── routes/               # Express API routes
├── services/             # Core business logic (Auth, Chat, Mediasoup SFU, Cloudinary)
├── sockets/              # Socket.io event handlers and WebRTC signal receivers
├── types/                # Custom TypeScript type declarations and interfaces
├── utils/                # Utility helpers (logger, response formatters)
└── validations/          # Express-validator schemas
```

---

## Coding Standards & Rules

1. **Separation of Concerns**:
   - Keep controllers minimal (`req` extraction -> call service -> send standard JSON response).
   - Put all business logic in `services/`.
   - Put DB queries in services using Drizzle ORM schema references from `db/schema/`.

2. **Real-time Handling (Sockets & Mediasoup)**:
   - Socket event listeners belong in `src/sockets/`.
   - WebRTC media routing logic (Transports, Producers, Consumers) belongs in `src/services/mediasoup.service.ts`.
   - Always handle Socket and Mediasoup exceptions to avoid crashing the event loop or leaking media transports.

3. **Database Schema & Migrations**:
   - Schema updates must be made in `src/db/schema/`.
   - Always run `npm run db:generate` to output new migrations when updating schemas.
   - Use `npm run db:push` for fast schema sync in development environments.

4. **Error Handling & Response Structure**:
   - Use standardized response utilities from `src/utils/` for consistent API output.
   - Log errors through Winston logger rather than bare `console.log`.

---

## Development & Verification Commands

| Command | Purpose |
| :--- | :--- |
| `npm run dev` | Start development server with `tsx` & `nodemon` |
| `npm run build` | Compile TypeScript project (`tsc`) |
| `npm run lint` | Run ESLint checks |
| `npm run lint:fix` | Fix auto-fixable ESLint issues |
| `npm run db:generate` | Generate Drizzle migrations |
| `npm run db:push` | Push schema changes directly to DB |
