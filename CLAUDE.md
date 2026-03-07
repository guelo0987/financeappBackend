# CLAUDE.md

This file provides guidance to Claude Code when working with this repository.
Read `WEALTHOS_README.md` for the full business logic, endpoints spec, and database documentation.

## Commands

```bash
npm run dev       # Development (nodemon + ts-node, hot reload)
npm run build     # Compile TypeScript to dist/
npm start         # Run compiled output (dist/index.js)
```

No test framework is configured yet.

## Stack

| Layer          | Technology                                    |
|----------------|-----------------------------------------------|
| Runtime        | Node.js + Express + TypeScript                |
| ORM            | Prisma (schema at `prisma/schema.prisma`)     |
| Database       | PostgreSQL via Supabase (project `fzklyclzehpmggqvjipy`) |
| Auth           | Custom JWT + bcrypt (NOT Supabase Auth)        |
| Build output   | `dist/` (CommonJS, ES2020)                    |

## Database Connection

- Supabase pooler region: `aws-1-us-east-1` (NOT aws-0)
- Use **session pooler** (port 5432) for `DATABASE_URL` — transaction pooler (6543) causes prepared statement errors with Prisma
- Direct host is IPv6 only — always use pooler
- After schema changes: `npx prisma db push` then `npx prisma generate`

## Architecture — Layered Pattern

```
src/
├── config/          # Prisma client, app config
├── types/           # DTOs, interfaces, Express augmentation
├── utils/           # Error classes (AppError hierarchy), JWT helpers
├── services/        # Business logic (validation, DB queries, hashing)
├── controllers/     # Thin HTTP adapters: parse req → call service → send res
├── middleware/       # Auth (JWT), global error handler
├── routes/          # Route definitions
└── index.ts         # Express app setup, middleware registration
```

### Rules

- **Controllers are thin** — no business logic, just call service and `next(error)` on failure
- **Services contain all logic** — validation, DB access, business rules
- **Types folder** — every DTO, response type, and interface goes here
- **Error handling** — throw `AppError` subclasses (`BadRequestError`, `UnauthorizedError`, `ConflictError`, `NotFoundError`), the global `errorHandler` middleware catches them

## Auth System

- Custom JWT (NOT Supabase Auth) — `public.usuarios` table with `password_hash`
- bcrypt salt rounds: 12, JWT expires in 30 days
- JWT payload: `{ usuario_id, email, iat, exp }`
- Auth middleware extracts `usuario_id` from JWT — **never trust `usuario_id` from request body**
- All protected queries filter by `req.user.usuario_id`

## Response Format

```json
// Success
{ "data": { ... } }

// Error
{ "error": { "codigo": "ACTIVO_NO_ENCONTRADO", "mensaje": "El activo no existe." } }
```

## Database Schema (14 tables, 3 enums)

### Core tables
- **usuarios** — user profile, email/password_hash, moneda_base (DOP|USD)
- **suscripciones** — 1:1 with usuario, states: prueba → activa/vencida/cancelada
- **activos** — financial assets (efectivo, cuenta_bancaria, inversion, crypto, inmueble, vehiculo, otro)
- **transacciones** — income/expense/transfer, linked to activos and categorias
- **categorias** — system (usuario_id=NULL) + user-created categories
- **alertas** — system/AI-generated notifications

### Shared spaces
- **espacios_compartidos** — shared financial groups (couples, family, partners)
- **espacio_miembros** — PK(espacio_id, usuario_id), roles: admin/miembro
- **espacio_invitaciones** — token-based invitations, 48h expiry

### Cache tables (filled by cron jobs)
- **cache_tasas_cambio** — USD/DOP exchange rates
- **cache_precios_crypto** — BTC, ETH, etc. from CoinGecko
- **cache_precios_mercado** — ETFs, commodities from Twelve Data
- **sync_log** — audit trail for API sync operations

### Enums
- `tipo_activo`: efectivo, cuenta_bancaria, inversion, crypto, inmueble, vehiculo, otro
- `tipo_transaccion`: ingreso, gasto, transferencia
- `estado_suscripcion`: prueba, activa, vencida, cancelada

## Key Business Rules

- Registration auto-creates subscription in `prueba` state (5-day trial)
- Users with `vencida`/`cancelada` subscription can view but NOT create transactions
- USD transactions auto-calculate `monto_dop` from `cache_tasas_cambio` — fail if no rate cached
- Assets with `ticker_simbolo` update value from cache tables
- All DB column names, enum values, and error messages are in **Spanish**
- BigInt serialization: patched via `BigInt.prototype.toJSON` in `index.ts`

## Conventions

- All code in `src/` directory
- Database names in Spanish, code variable names in Spanish where matching DB
- Dates: ISO 8601, amounts: always numbers (never strings)
- Env vars in `.env` (never commit — contains DB password and JWT secret)
