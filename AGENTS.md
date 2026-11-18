# AGENTS.md — Green Marketplace Backend

Instructions for AI coding assistants (Claude Code, Cursor, Copilot, etc.) working in this
repository. Read this file and [docs/PROJECT_CONTEXT.md](docs/PROJECT_CONTEXT.md) before
making changes. `README.md` is the API reference for humans; keep all three in sync.

---

## 1. How to work with the project owner

These rules come from the owner and override your defaults.

1. **Analyse first, implement after approval.** For any new module or significant change:
   analyse the requirement, list data models, APIs, request/response shapes, validations,
   business rules, security concerns, assumptions and open questions. Present it and **wait
   for explicit approval** before writing code.
2. **Implement only the approved scope.** Do not add features, rename business concepts or
   change agreed business rules on your own. If something small is needed to make the
   approved scope work (e.g. a GET-by-id for an edit screen), say so explicitly.
3. **Recommend, don't just list.** When a decision is needed, give options with a clear
   recommendation and the trade-off in one line.
4. **Ask when requirements conflict** with earlier decisions (see the decision log in
   `docs/PROJECT_CONTEXT.md`). Never silently pick one.
5. **Git:**
   - Commit when a piece of work is complete and verified. **Push only when the owner asks.**
   - **No AI attribution** in commits or PRs: no `Co-Authored-By: Claude …`, no
     "Generated with …" lines.
   - Before committing, check `git status` for unexpected files (the owner sometimes edits
     in parallel). Build on their changes; never revert them without asking.
6. **Secrets:** never commit secrets, never write real values into `.env.example`, never ask
   the owner to paste passwords or connection strings into chat, and never print secret
   values in command output (check settings by printing booleans/lengths instead).
7. **Verify before claiming done:** `npm run typecheck`, `npm run lint`, `npm test`,
   `npm run build` must all pass. Report failures honestly.

## 2. Terminology (strict)

| Use                                                                  | Never use                                          |
| -------------------------------------------------------------------- | -------------------------------------------------- |
| **Order Request** / Order Requests                                   | Enquiry, Inquiry, Order (for unconfirmed requests) |
| My Requests (customer), Order Requests (admin)                       | —                                                  |
| Submit Request, Track Request, Cancel Request, Update Request Status | —                                                  |

An Order Request is a customer's **intention** to buy. It is never a confirmed order;
pricing is indicative and payment happens offline.

## 3. Stack

- Node.js 22, **TypeScript** (strict, ESM, `NodeNext`), Express 5, MongoDB with Mongoose 8
- Zod 4 for validation, bcryptjs, jsonwebtoken, helmet, cors, express-rate-limit
- pino / pino-http for logging, multer (memory storage) + Cloudinary for images
- Vitest + Supertest + mongodb-memory-server for tests; ESLint (typescript-eslint) + Prettier

## 4. Commands

```bash
npm run dev            # tsx watch (does NOT reload .env — restart after editing it)
npm run typecheck      # tsc --noEmit
npm run lint           # eslint .
npm test               # vitest run (first run downloads a MongoDB binary)
npm run build          # tsc -p tsconfig.build.json → dist/
npm run format         # prettier --write .
npm run seed:admin     # create an admin (prompts; password hidden)
```

## 5. Project structure

```
src/
  app.ts              createApp(): middleware, /health, /api/v1, 404, error handler
  server.ts           connects DB, listens, graceful shutdown
  config/env.ts       the only place app code reads process.env (Zod-validated at startup;
                      scripts may read their own script-only vars, e.g. SEED_ADMIN_*)
  config/db.ts        connect/disconnect, mongoose.set('strictQuery', true)
  routes/index.ts     mounts module routers; admin routers get `authenticate` here
  middlewares/        authenticate, validate, rateLimiters, upload, errorHandler
  utils/              ApiError, apiResponse, pagination, validators, slug, logger, redact
  scripts/            operational scripts (seedAdmin) — console output allowed here only
  modules/
    admin/ auth/ category/ plant/ upload/ dashboard/
    order-requests/   files are named orderRequest.*.ts
tests/                integration tests, one file per module + setup.ts + helpers.ts
postman/              Postman collection + local/dev/prod environments (no secrets)
docs/                 PROJECT_CONTEXT.md (business rules, decisions, roadmap)
```

Each module folder contains, as needed: `<name>.routes.ts`, `<name>.controller.ts`,
`<name>.service.ts`, `<name>.model.ts`, `<name>.validation.ts`, `<name>.constants.ts`.
Existing folders are singular camelCase (`category`, `plant`); `order-requests` is the
owner-mandated exception. Ask before choosing a folder name for a new module.

## 6. Architecture rules

**Request flow:** route → `validate` middleware → controller → service → model.

- **Routes** are built by factory functions (`createXRouter()`), so each `createApp()` gets
  fresh rate-limiter stores. Public routes at `/api/v1/<resource>`, admin routes at
  `/api/v1/admin/<resource>` mounted behind `authenticate` in `routes/index.ts`.
- **Controllers** only translate HTTP ↔ service calls: read `req.body` (already parsed) or
  `req.validated.query` / `req.validated.params`, call the service, reply with
  `sendSuccess`. Use `requireAdmin(req)` for the admin id. No business logic.
- **Services** hold all business rules, throw `ApiError` for expected failures, and return
  **plain response objects built by mapping functions** (`toAdminPlant`, `toCustomerView`, …).
  Never return raw Mongoose documents.
- **Models** define schema, indexes and types only (`InferSchemaType`). Set
  `select: false` on secrets (`passwordHash`, `trackingTokenHash`).
- Cross-module access goes through the other module's **service** functions where a rule
  is involved (e.g. `assertValidPlantCategories`, `getRequestablePlants`). Reading another
  module's model directly is acceptable for simple existence checks.
- Keep it simple: no repositories, DI containers or base classes. Add an abstraction only
  when there is a second real use (e.g. `ImageStorage` exists so tests can fake Cloudinary).

## 7. Coding conventions

**TypeScript / style**

- ESM imports with explicit `.js` extensions; `import type` for types (lint-enforced).
- No `console` in `src/` (except `src/scripts`); use `logger`.
- Prettier: single quotes, trailing commas, width 100. Run `npm run format` before commit.
- Comments explain _why_, not what. Keep them short.

**Validation (Zod 4)**

- Every route with input validates it via `validate({ body, query, params })`.
- Use `z.strictObject` for bodies so unknown fields are rejected (this is also our NoSQL
  operator-injection defence — **do not** enable Mongoose `sanitizeFilter`; it breaks the
  server's own `$gt`/`$in` queries).
- Write **update schemas separately** with `.optional()` fields — never `.partial()` on a
  schema that has `.default()`s (defaults would overwrite existing values).
- Reuse `objectIdSchema`, `idParamsSchema`, `booleanQuerySchema`, `searchQuerySchema`,
  `paginationQuerySchema` from `utils/`.
- Query booleans are the strings `"true"`/`"false"`. Sorting uses an allow-list enum.

**API responses** (always via `sendSuccess` / errors via `ApiError`)

```json
{ "success": true, "data": …, "meta": { "page", "limit", "total", "totalPages" } }
{ "success": false, "error": { "code": "VALIDATION_ERROR", "message": "…", "details": [{ "field", "message" }] } }
```

Error codes live in `utils/ApiError.ts` (`VALIDATION_ERROR`, `BAD_REQUEST`, `UNAUTHORIZED`,
`INVALID_CREDENTIALS`, `FORBIDDEN`, `NOT_FOUND`, `CONFLICT`, `PAYLOAD_TOO_LARGE`,
`TOO_MANY_REQUESTS`, `INTERNAL_ERROR`, `SERVICE_UNAVAILABLE`). The error handler maps Zod,
Mongoose, multer and body-parser errors; unexpected errors become a generic 500 and are
logged server-side only.

**Data**

- **Money is whole paise** (`{ amount: 25000, currency: "INR" }` = ₹250). Never floats.
- **Soft delete**: `deletedAt` (Date|null) + `isActive: false`. Deleted records are hidden
  everywhere unless `includeDeleted=true` on admin lists; GET by id returns 404.
- Audit fields `createdBy` / `updatedBy` (admin ObjectId) on admin-managed records.
- Slugs via `generateUniqueSlug(name, fallback, isTaken)`; unique index as race guard.
- Lists: `paginationQuerySchema` (default 20, max 100), `getSkip`, `buildPaginationMeta`,
  stable sort with `_id` tiebreaker. Text search uses `escapeRegex` (never raw user regex).
- State changes that must not race use **conditional atomic updates**
  (`findOneAndUpdate({ _id, status: from }, …)`) and return 409 when nothing matched.
- Use Mongoose 8 types (`FilterQuery`, not `QueryFilter`).

**Security**

- Never expose: `passwordHash`, `trackingTokenHash`, Cloudinary `publicId`, admin notes or
  status notes to customers, customer contact details in customer tracking responses.
- Hash secrets (bcrypt for passwords, SHA-256 for refresh/tracking tokens).
- Identical error for unknown email / wrong password / inactive admin.
- New public write endpoints need a rate limiter (`middlewares/rateLimiters.ts`).
- Tokens in URLs must be redacted from logs (`utils/redact.ts`).
- Uploaded files: check MIME allow-list **and** file signature; size/count limits.

## 8. Testing

- Every feature ships with integration tests in `tests/<module>.test.ts` using Supertest.
- `tests/setup.ts` sets env vars, starts an in-memory MongoDB and clears collections after
  each test. Create a fresh `createApp()` in `beforeEach` (fresh rate-limit stores).
- Use `createTestAdmin` / `loginAs` / `createFakeImageStorage` / `PNG_BYTES` from
  `tests/helpers.ts`. Never call real Cloudinary in tests (`setImageStorage(fake)`).
- Test the rules, not just happy paths: validation errors, auth required, 404/409 cases,
  hidden fields, rate limits.

## 9. When you add or change an endpoint

1. Validation schema → service (rules + mapping) → controller → route → mount.
2. Tests in `tests/`.
3. Update `README.md` (API section) and `postman/green-marketplace.postman_collection.json`
   (add the request with example body; save created ids with the `save(...)` test-script
   pattern; destructive requests go in "Cleanup (run last)").
4. Update `docs/PROJECT_CONTEXT.md` if a business rule or decision changed.
5. Typecheck, lint, test, build, format — then commit (no push unless asked).

## 10. Known gotchas

- `tsx watch` restarts on code changes only; restart manually after editing `.env`.
- MongoDB Atlas blocks unknown IPs → `MongooseServerSelectionError … whitelisted`. Add the
  current IP in Atlas → Security → Network Access. Never allow `0.0.0.0/0` for prod.
- `MONGODB_URI` must end with `/green_marketplace`, otherwise data goes to `test`.
- The first `npm test` downloads the MongoDB binary; parallel first runs can fail once.
- Without Cloudinary credentials (allowed outside production) uploads return 503.
- Express 5: `req.query` is read-only — parsed query/params live on `req.validated`.
