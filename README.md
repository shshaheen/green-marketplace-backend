# Green Marketplace Backend

REST API for the Green Marketplace plant-commerce platform: a bulk-plant enquiry service
connecting customers with a nursery. Built with Node.js, Express 5, TypeScript and MongoDB.

## Requirements

- Node.js 22+
- A MongoDB database (local or MongoDB Atlas)

## Setup

```bash
npm install
cp .env.example .env   # then fill in real values
npm run seed:admin     # create the first admin account
npm run dev
```

The API listens on `http://localhost:4000` by default. `GET /health` reports server and
database status.

## Scripts

| Script                    | Purpose                                                  |
| ------------------------- | -------------------------------------------------------- |
| `npm run dev`             | Start with auto-reload                                   |
| `npm run build`           | Compile to `dist/`                                       |
| `npm start`               | Run the compiled build                                   |
| `npm test`                | Run tests against an in-memory MongoDB                   |
| `npm run typecheck`       | Type-check without emitting                              |
| `npm run lint`            | Lint                                                     |
| `npm run format`          | Format with Prettier                                     |
| `npm run seed:admin`      | Create an admin (prompts for anything not set in `.env`) |
| `npm run seed:admin:prod` | Same, from the compiled build                            |

The first `npm test` downloads a MongoDB binary for the in-memory test database.

## Project structure

```
src/
  config/       environment validation, database connection
  modules/      one folder per feature: routes, controller, service, model, validation
  middlewares/  authenticate, validate, rate limiters, error handling
  utils/        ApiError, response helpers, pagination, logger
  routes/       mounts all module routers under /api/v1
  scripts/      operational scripts (admin seeding)
tests/          integration tests (Vitest + Supertest)
```

Requests flow route → validation → controller → service → model. Controllers only handle
HTTP; business rules live in services.

## API conventions

- Base path `/api/v1`. Public routes at the root, admin routes under `/api/v1/admin`.
- Success: `{ "success": true, "data": ..., "meta"?: { page, limit, total, totalPages } }`
- Error: `{ "success": false, "error": { "code", "message", "details"? } }`
- Lists accept `?page=` (default 1) and `?limit=` (default 20, max 100).
- Request bodies are validated with strict Zod schemas; unknown fields are rejected.

## Admin authentication

There is no public registration. Admins are created with `npm run seed:admin`.

| Method | Path                         | Body                  | Auth   |
| ------ | ---------------------------- | --------------------- | ------ |
| POST   | `/api/v1/admin/auth/login`   | `{ email, password }` | —      |
| POST   | `/api/v1/admin/auth/refresh` | `{ refreshToken }`    | —      |
| POST   | `/api/v1/admin/auth/logout`  | `{ refreshToken }`    | —      |
| GET    | `/api/v1/admin/auth/me`      | —                     | Bearer |

- Access tokens are JWTs valid for 15 minutes (`JWT_ACCESS_TTL_SECONDS`). Send them as
  `Authorization: Bearer <token>`.
- Refresh tokens are opaque, valid for 7 days (`REFRESH_TOKEN_TTL_DAYS`), single-use, and
  stored only as SHA-256 hashes. Each refresh returns a new pair.
- Failed logins are limited to 5 per IP and email every 15 minutes.
- Deactivating an admin (`isActive: false`) blocks them immediately, even with a valid token.

## Categories

Two levels: top-level categories (`parent: null`) and subcategories under them.

| Method | Path                           | Notes                                                          |
| ------ | ------------------------------ | -------------------------------------------------------------- |
| GET    | `/api/v1/categories`           | Public. Active categories, each with its active subcategories  |
| GET    | `/api/v1/admin/categories`     | `?parent=<id or root>&isActive=&search=&includeDeleted=&page=` |
| POST   | `/api/v1/admin/categories`     | `{ name, description?, parent?, sortOrder?, isActive? }`       |
| GET    | `/api/v1/admin/categories/:id` |                                                                |
| PATCH  | `/api/v1/admin/categories/:id` | Any of the create fields                                       |
| DELETE | `/api/v1/admin/categories/:id` | Soft delete                                                    |

- Names are unique among siblings, ignoring case. Slugs are generated from the name and kept
  unique (`flowering`, `flowering-2`, …); renaming regenerates the slug.
- A subcategory's parent must be a top-level category, and a category that has
  subcategories cannot itself be moved under another category.
- Deleting is refused while the category has subcategories. Deleted categories are hidden
  everywhere unless `includeDeleted=true`.
- Deactivating a category also hides its subcategories from the public tree.
