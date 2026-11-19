# Green Marketplace Backend

REST API for the Green Marketplace plant-commerce platform: a bulk-plant order request service
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

## Customer authentication

Customer accounts are registered via email OTP verification and protected with a 6-digit MPIN.

| Method | Path                                          | Body                                              | Auth   | Notes                                       |
| ------ | --------------------------------------------- | ------------------------------------------------- | ------ | ------------------------------------------- |
| POST   | `/api/v1/auth/customer/register/send-otp`     | `{ email }`                                       | —      | Sends 6-digit OTP via Resend (5m TTL)       |
| POST   | `/api/v1/auth/customer/register/verify-otp`   | `{ email, otp }`                                  | —      | Max 5 attempts; returns `verificationToken` |
| POST   | `/api/v1/auth/customer/register/set-pin`      | `{ email, verificationToken, mpin, confirmMpin }` | —      | Creates customer; returns token pair        |
| POST   | `/api/v1/auth/customer/login`                 | `{ email, mpin }`                                 | —      | Account lockout after 5 failed attempts     |
| POST   | `/api/v1/auth/customer/forgot-pin/send-otp`   | `{ email }`                                       | —      | Sends reset OTP via Resend                  |
| POST   | `/api/v1/auth/customer/forgot-pin/verify-otp` | `{ email, otp }`                                  | —      | Returns `verificationToken`                 |
| POST   | `/api/v1/auth/customer/forgot-pin/reset`      | `{ email, verificationToken, mpin, confirmMpin }` | —      | Resets MPIN; revokes existing sessions      |
| POST   | `/api/v1/auth/customer/refresh`               | `{ refreshToken }`                                | —      | Rotates refresh token                       |
| POST   | `/api/v1/auth/customer/logout`                | `{ refreshToken }`                                | —      | Revokes refresh token                       |
| GET    | `/api/v1/auth/customer/me`                    | —                                                 | Bearer | Returns authenticated customer profile      |

## Customer authentication

Customer accounts are registered via email OTP verification and protected with a 6-digit MPIN.

| Method | Path                                      | Body                                                 | Auth   | Notes                                  |
| ------ | ----------------------------------------- | ---------------------------------------------------- | ------ | -------------------------------------- |
| POST   | `/api/v1/auth/customer/register/send-otp` | `{ email }`                                          | —      | Sends 6-digit OTP via Resend (5m TTL)  |
| POST   | `/api/v1/auth/customer/register/verify-otp`| `{ email, otp }`                                    | —      | Max 5 attempts; returns `verificationToken` |
| POST   | `/api/v1/auth/customer/register/set-pin`  | `{ email, verificationToken, mpin, confirmMpin }`    | —      | Creates customer; returns token pair   |
| POST   | `/api/v1/auth/customer/login`             | `{ email, mpin }`                                    | —      | Account lockout after 5 failed attempts|
| POST   | `/api/v1/auth/customer/forgot-pin/send-otp`| `{ email }`                                         | —      | Sends reset OTP via Resend             |
| POST   | `/api/v1/auth/customer/forgot-pin/verify-otp`| `{ email, otp }`                                  | —      | Returns `verificationToken`            |
| POST   | `/api/v1/auth/customer/forgot-pin/reset`  | `{ email, verificationToken, mpin, confirmMpin }`    | —      | Resets MPIN; revokes existing sessions |
| POST   | `/api/v1/auth/customer/refresh`           | `{ refreshToken }`                                   | —      | Rotates refresh token                  |
| POST   | `/api/v1/auth/customer/logout`            | `{ refreshToken }`                                   | —      | Revokes refresh token                  |
| GET    | `/api/v1/auth/customer/me`                | —                                                    | Bearer | Returns authenticated customer profile |

## Admin authentication

There is no public registration. Admins are pre-created with `npm run seed:admin`. Admins set an initial 6-digit MPIN via email OTP verification, or log in with their pre-existing password or MPIN.

Endpoints are mounted at `/api/v1/auth/admin/*` and aliased at `/api/v1/admin/auth/*`.

| Method | Path                                        | Body                                              | Auth   | Notes                                  |
| ------ | ------------------------------------------- | ------------------------------------------------- | ------ | -------------------------------------- |
| POST   | `/api/v1/auth/admin/login`                  | `{ email, mpin }` or `{ email, password }`        | —      | Lockout after 5 failed attempts        |
| POST   | `/api/v1/auth/admin/initial-pin/send-otp`   | `{ email }`                                       | —      | Verified against pre-created admin     |
| POST   | `/api/v1/auth/admin/initial-pin/verify-otp` | `{ email, otp }`                                  | —      | Returns `verificationToken`            |
| POST   | `/api/v1/auth/admin/initial-pin/set-pin`    | `{ email, verificationToken, mpin, confirmMpin }` | —      | Sets initial MPIN; returns token pair  |
| POST   | `/api/v1/auth/admin/forgot-pin/send-otp`    | `{ email }`                                       | —      | Sends reset OTP via Resend             |
| POST   | `/api/v1/auth/admin/forgot-pin/verify-otp`  | `{ email, otp }`                                  | —      | Returns `verificationToken`            |
| POST   | `/api/v1/auth/admin/forgot-pin/reset`       | `{ email, verificationToken, mpin, confirmMpin }` | —      | Resets MPIN; revokes existing sessions |
| POST   | `/api/v1/auth/admin/refresh`                | `{ refreshToken }`                                | —      | Rotates refresh token                  |
| POST   | `/api/v1/auth/admin/logout`                 | `{ refreshToken }`                                | —      | Revokes refresh token                  |
| GET    | `/api/v1/auth/admin/me`                     | —                                                 | Bearer | Returns authenticated admin profile    |

| Method | Path                                   | Body                                              | Auth   | Notes                                  |
| ------ | -------------------------------------- | ------------------------------------------------- | ------ | -------------------------------------- |
| POST   | `/api/v1/auth/admin/login`             | `{ email, mpin }` or `{ email, password }`        | —      | Lockout after 5 failed attempts        |
| POST   | `/api/v1/auth/admin/initial-pin/send-otp` | `{ email }`                                    | —      | Verified against pre-created admin     |
| POST   | `/api/v1/auth/admin/initial-pin/verify-otp`| `{ email, otp }`                                | —      | Returns `verificationToken`            |
| POST   | `/api/v1/auth/admin/initial-pin/set-pin` | `{ email, verificationToken, mpin, confirmMpin }` | —      | Sets initial MPIN; returns token pair  |
| POST   | `/api/v1/auth/admin/forgot-pin/send-otp`  | `{ email }`                                    | —      | Sends reset OTP via Resend             |
| POST   | `/api/v1/auth/admin/forgot-pin/verify-otp`| `{ email, otp }`                               | —      | Returns `verificationToken`            |
| POST   | `/api/v1/auth/admin/forgot-pin/reset`   | `{ email, verificationToken, mpin, confirmMpin }` | —      | Resets MPIN; revokes existing sessions |
| POST   | `/api/v1/auth/admin/refresh`            | `{ refreshToken }`                                | —      | Rotates refresh token                  |
| POST   | `/api/v1/auth/admin/logout`             | `{ refreshToken }`                                | —      | Revokes refresh token                  |
| GET    | `/api/v1/auth/admin/me`                 | —                                                 | Bearer | Returns authenticated admin profile    |

- Access tokens are JWTs valid for 15 minutes (`JWT_ACCESS_TTL_SECONDS`). Send them as
  `Authorization: Bearer <token>`. Customer and admin tokens carry distinct cryptographic audiences.
- Refresh tokens are opaque, valid for 7 days (`REFRESH_TOKEN_TTL_DAYS`), single-use, and
  stored only as SHA-256 hashes. Each refresh returns a new pair.
- Failed logins are limited to 5 per IP and email every 15 minutes, with database-level account lockout after 5 consecutive failures.
- Deactivating an account (`isActive: false`) blocks them immediately, even with a valid token.

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

## Plants

Prices are **indicative** and given in whole **paise** (`{ "amount": 25000, "currency": "INR" }`
is ₹250). Price units: `per_plant`, `per_pot`, `per_bag`, `per_dozen`. Availability:
`in_stock`, `limited`, `out_of_stock`.

### Public

| Method | Path                       | Notes                                                                                  |
| ------ | -------------------------- | -------------------------------------------------------------------------------------- |
| GET    | `/api/v1/plants`           | `?category=&subcategory=&search=&availability=&minPrice=&maxPrice=&sort=&page=&limit=` |
| GET    | `/api/v1/plants/:idOrSlug` | Full details: description, all images, attributes                                      |

`sort` is one of `-createdAt` (default), `createdAt`, `price`, `-price`, `name`, `-name`.
Customers only see active plants whose category (and subcategory, if any) is active.
List items carry only the main image; details carry all of them.

### Admin

| Method | Path                                       | Notes                                                  |
| ------ | ------------------------------------------ | ------------------------------------------------------ |
| GET    | `/api/v1/admin/plants`                     | Public filters plus `?isActive=&includeDeleted=`       |
| POST   | `/api/v1/admin/plants`                     | JSON body (see below)                                  |
| GET    | `/api/v1/admin/plants/:id`                 |                                                        |
| PATCH  | `/api/v1/admin/plants/:id`                 | Any create field except `isActive`                     |
| PATCH  | `/api/v1/admin/plants/:id/status`          | `{ isActive }`                                         |
| DELETE | `/api/v1/admin/plants/:id`                 | Soft delete                                            |
| POST   | `/api/v1/admin/plants/:id/images`          | `multipart/form-data`, files in the `images` field     |
| PATCH  | `/api/v1/admin/plants/:id/images/order`    | `{ imageIds: [...] }`, every image id in the new order |
| DELETE | `/api/v1/admin/plants/:id/images/:imageId` | Removes from the plant and from Cloudinary             |

Create body:

```json
{
  "name": "Jade Plant",
  "description": "Hardy succulent",
  "category": "<top-level category id>",
  "subcategory": "<subcategory id or null>",
  "price": { "amount": 25000 },
  "priceUnit": "per_pot",
  "minOrderQty": 10,
  "availability": "in_stock",
  "attributes": {
    "height": { "min": 1, "max": 2, "unit": "ft" },
    "sunlight": "indirect_light",
    "watering": "Once a week"
  },
  "isActive": true
}
```

- `category` must be a top-level category and `subcategory` one of its subcategories.
  When changing `category`, send `subcategory` too (or `null`).
- `attributes` in a PATCH replaces the whole attributes object. Sunlight values:
  `full_sun`, `partial_shade`, `full_shade`, `indirect_light`.
- Images: JPEG, PNG or WebP, up to 5 MB each and 10 per plant. File contents are checked,
  not just the declared type. The first image is the main one.
- Deleting a plant keeps its images in Cloudinary so existing order requests can still show them.
- A category cannot be deleted or moved while non-deleted plants use it.
- Without Cloudinary settings (allowed outside production) image uploads return 503.

## Order Requests

An Order Request is a customer's intention to buy plants. It is **not a confirmed order**:
the nursery reviews it, contacts the customer, agrees price and delivery, and handles payment
offline. Customers have no accounts; a tracking token returned at submission identifies them.

### Customer

| Method | Path                                             | Notes                                                       |
| ------ | ------------------------------------------------ | ----------------------------------------------------------- |
| POST   | `/api/v1/order-requests`                         | Submit Request. Returns the reference number and token      |
| GET    | `/api/v1/order-requests/track/:token`            | Track Request                                               |
| POST   | `/api/v1/order-requests/track`                   | `{ referenceNumber, phone }`, fallback if the token is lost |
| POST   | `/api/v1/order-requests/:referenceNumber/cancel` | `{ token, reason? }`, Cancel Request                        |

Submit body:

```json
{
  "customerDetails": {
    "name": "Asha Rao",
    "phone": "9876543210",
    "email": "asha@example.com",
    "location": "Farmhouse, Shamshabad, Hyderabad",
    "pincode": "501218"
  },
  "items": [{ "plantId": "<plant id>", "quantity": 40 }],
  "intendedUse": "farmhouse",
  "preferredDeliveryDate": "2026-12-15",
  "additionalNotes": "Need delivery before the monsoon"
}
```

- Reference numbers look like `ORD-2026-00001`; the counter restarts each year (India time).
- The `trackingToken` (43 characters) is returned **only once**, at submission. The app must
  store it for My Requests, tracking and cancelling. Only its SHA-256 hash is stored, and
  tokens in `/track/:token` URLs are redacted from logs.
- The reference + phone lookup is read-only (it cannot cancel) and limited to 10 failed
  attempts per IP every 15 minutes. Submissions are limited to 10 per IP per hour.
- Phone: 10-digit Indian mobile (`+91`, spaces and dashes are accepted and removed).
  Pincode: 6 digits. Email optional. Delivery date `YYYY-MM-DD`, today or later.
- `intendedUse`: `resort`, `farmhouse`, `home`, `landscaping`, `garden`, `commercial`, `other`.
- Up to 50 distinct plants. Each must be visible in the catalogue and meet its minimum order
  quantity. Out-of-stock plants can be requested.
- Plant name, unit, indicative price, main image and availability are copied from the
  catalogue at submission (`*Snapshot` fields) and never change afterwards.
- `estimatedTotal` is indicative only.
- Customer responses never include phone, email, location, admin notes or status notes.

### Admin

| Method | Path                                      | Notes                                         |
| ------ | ----------------------------------------- | --------------------------------------------- |
| GET    | `/api/v1/admin/order-requests`            | `?status=&search=&page=&limit=`, newest first |
| GET    | `/api/v1/admin/order-requests/:id`        | Includes history, notes, `allowedTransitions` |
| PATCH  | `/api/v1/admin/order-requests/:id/status` | `{ status, note? }`, Update Request Status    |
| PATCH  | `/api/v1/admin/order-requests/:id/notes`  | `{ adminNotes }` (`null` clears)              |

`search` matches the reference number, customer name or phone.

### Status lifecycle

```
submitted → under_review → contacted → accepted → completed
submitted / under_review / contacted → rejected   (admin)
submitted / under_review / contacted → cancelled  (customer)
accepted → cancelled                              (admin, note required)
```

Changes go one step at a time, never backwards; `completed`, `rejected` and `cancelled` are
final. Every change is recorded in `statusHistory` with who made it and when.

## Admin Dashboard

`GET /api/v1/admin/dashboard/stats` (admin auth) returns:

```json
{
  "orderRequests": {
    "total": 4,
    "newRequests": 1,
    "byStatus": {
      "submitted": 1,
      "under_review": 1,
      "contacted": 1,
      "accepted": 0,
      "completed": 0,
      "rejected": 1,
      "cancelled": 0
    },
    "received": { "today": 3, "last7Days": 3, "last30Days": 4 }
  },
  "plants": { "active": 3, "outOfStock": 1 },
  "topRequestedPlants": [
    { "plantId": "…", "plantName": "Jade", "requestCount": 3, "totalQuantity": 31 }
  ],
  "recentRequests": ["… up to 5 order request summaries, newest first …"]
}
```

- **New Requests** are requests with status `submitted`.
- "Today" starts at midnight India time.
- Top requested plants (up to 5) count every order request regardless of status, ranked by
  number of requests, then total quantity, using the name from the most recent request.
- Active plants are active and not deleted; out of stock is a subset of those.

## Postman

The `postman/` folder has a collection covering every endpoint, plus environments for
local, dev and prod.

1. In Postman, **Import** `postman/green-marketplace.postman_collection.json` and the
   environment you need (`local.postman_environment.json` for `http://localhost:4000`).
2. Select the environment. Set `adminEmail` and `adminPassword` in the **Current value**
   column only. Current values stay on your machine and are never synced or exported.
3. Run **Admin Auth → Login**. The tokens are saved automatically and every admin request
   uses them. When the access token expires (15 minutes), run **Refresh tokens**.

Requests that create something save its id for the next ones (`categoryId`, `plantId`,
`trackingToken`, `orderRequestId`, …), so you can go top to bottom: create a category and
subcategory, create a plant, upload images (pick files in the Body tab), submit an order
request, then manage it as admin. Destructive requests live in **Cleanup (run last)**.

For dev and prod, update `baseUrl` in those environments once the servers have domains. The
committed environment files contain no credentials; keep it that way.
