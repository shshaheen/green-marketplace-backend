# Project Context — Green Marketplace

Business requirements, agreed rules, decisions and roadmap. This is the memory of the
project: read it before proposing changes, and update it when a decision is made.
Coding rules live in [AGENTS.md](../AGENTS.md); API details in [README.md](../README.md).

_Last updated: 2026-11-18_

---

## 1. Product

A plant-commerce platform connecting customers with **one plant nursery**. The core
business is **bulk plant ordering** — typically 40–50+ plants for resorts, farmhouses,
home decoration, landscaping, gardens and other commercial or personal needs.

**MVP model:** the app is a platform for **Order Requests**, not a shop.

1. Customer browses the catalogue (no login) and selects plants and quantities.
2. Customer submits an Order Request with contact and delivery details.
3. Backend validates it, creates a reference number (`ORD-2026-00001`) and a tracking token.
4. Admin reviews availability, contacts the customer, negotiates price and delivery.
5. Admin updates the request status. Payment and fulfilment happen **offline**.

**Out of scope for the MVP:** online payments, commissions, automated order processing,
customer accounts, staff roles / role-based permissions, email notifications.

**Future direction:** a multi-nursery marketplace. Keep the design flexible, but do **not**
add `nurseryId` or multi-tenant code until it is requested (decided 2026-11-18).

## 2. Users

| User         | Access                                                                                                                                                                                                                        |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Customer** | No account. Browses plants, submits Order Requests, tracks and cancels them with a tracking token saved on the device ("My Requests").                                                                                        |
| **Admin**    | Predefined accounts only, created with `npm run seed:admin`. No public registration. All admins have the same permissions. Manages categories, plants, images and Order Requests. Admin UI lives in the **same Flutter app**. |

## 3. Repositories

| Repo                | Path                                                | Remote                                         | State                         |
| ------------------- | --------------------------------------------------- | ---------------------------------------------- | ----------------------------- |
| Backend (this repo) | `~/Documents/Development/green_marketplace_backend` | github.com/shshaheen/green-marketplace-backend | All MVP modules done          |
| Flutter app         | `~/Documents/Development/green_marketplace`         | github.com/shshaheen/green-marketplace         | Starter app only; not started |

## 4. Business rules by module

### Admin authentication

- Login with email + password. Access token: JWT, 15 min. Refresh token: opaque, 7 days,
  single-use (rotated on every refresh), stored as SHA-256 hash, one session per device.
- Same error for unknown email, wrong password and inactive admin.
- 5 failed logins per IP + email per 15 minutes.
- Deactivated admins are blocked immediately, even with a valid token.
- Admin password: minimum 12 characters (seed script).

### Categories

- Two levels in one collection: top-level (`parent: null`) and subcategories.
- Names unique among siblings (case-insensitive). Slugs auto-generated and unique; renaming
  regenerates the slug. Non-Latin names get `category-<random>`.
- Cannot nest deeper than two levels; a category with subcategories cannot become one.
- Cannot delete while it has subcategories or non-deleted plants (409).
- Cannot move (change parent) while non-deleted plants use it (409).
- Deactivating a category hides its subcategories and their plants from customers.
- Category images: not built yet (planned with a later upload change).

### Plants

- Fields: name, slug, description, category (top-level), subcategory (child of that
  category, optional), indicative price (paise, INR), price unit (`per_plant`, `per_pot`,
  `per_bag`, `per_dozen`), minimum order quantity, availability (`in_stock`, `limited`,
  `out_of_stock`), up to 10 images (first = main), optional attributes (height range with
  unit, sunlight, watering), isActive, soft delete.
- **Prices are indicative**, not final.
- Customers see only active, non-deleted plants whose category (and subcategory) are visible.
- Changing `category` requires sending `subcategory` too (or `null`) — no silent reset.
- PATCH `attributes` replaces the whole object.
- Visibility changes only through `PATCH /:id/status`.
- Images: JPEG/PNG/WebP, ≤ 5 MB, ≤ 10 per plant, signature-checked, stored in Cloudinary
  under `<CLOUDINARY_FOLDER>/plants/<plantId>/`. Failed batch uploads are cleaned up.
- Deleting a plant keeps its images (existing Order Requests reference them).

### Order Requests

- Collection `order_requests`; module folder `src/modules/order-requests/`.
- Customer details: name, phone (10-digit Indian mobile, normalised), optional email,
  free-text location, 6-digit pincode. Intended use (required): `resort`, `farmhouse`,
  `home`, `landscaping`, `garden`, `commercial`, `other`. Optional preferred delivery date
  (today or later) and additional notes.
- 1–50 distinct plants per request. Each plant must be visible in the catalogue and the
  quantity must be **≥ its minimum order quantity** (rejected otherwise).
- **Out-of-stock plants can be requested**; `availabilitySnapshot` records it.
- **Snapshots** taken from the database at submission: plant name, unit, indicative price,
  main image URL, availability. They never change afterwards.
- Reference number `ORD-<year>-<5 digits>`, per-year counter, year in India time.
- Tracking token (32 random bytes, base64url) returned **once**; only its SHA-256 hash is
  stored. Tokens in `/track/:token` URLs are redacted from logs.
- Fallback tracking by reference number + phone (read-only, cannot cancel).
- Customer responses exclude phone, email, location, admin notes and status notes.
- Status lifecycle (strict, one step at a time, never backwards):
  ```
  submitted → under_review → contacted → accepted → completed
  submitted / under_review / contacted → rejected   (admin)
  submitted / under_review / contacted → cancelled  (customer, with tracking token)
  accepted → cancelled                              (admin, note required)
  ```
  `completed`, `rejected`, `cancelled` are final. Every change is recorded in
  `statusHistory` (from, to, by customer/admin, admin id, note, time).
- Admin notes are edited separately (`PATCH /:id/notes`), independent of status.
- Rate limits: 10 submissions per IP per hour; 10 failed reference lookups per IP per
  15 minutes; 60 token actions per IP per 15 minutes.

### Dashboard

- `GET /admin/dashboard/stats`: totals, **New Requests = status `submitted`**, count per
  status, received today (India midnight) / last 7 / last 30 days, active and out-of-stock
  plants, top 5 requested plants (all statuses, by request count then quantity), 5 most
  recent requests.

## 5. Environments

- Config comes only from environment variables (`.env` locally, AWS Parameter Store on
  servers). `.env` is git-ignored; `.env.example` holds placeholders only.
- Planned environments: **local**, **dev**, **prod** (staging optional later).
  Staging/prod run with `NODE_ENV=production`.
- Each environment has its own MongoDB Atlas project/database user, JWT secret and
  Cloudinary folder or product environment. Never share secrets across environments.
- Local dev: Atlas cluster `cluster0`, database `green_marketplace`, Cloudinary folder
  `green-marketplace-dev` (recommended). The owner's IP must be on the Atlas allowlist.
- Planned hosting: AWS — ECR + ECS Fargate per environment, load balancer with HTTPS,
  secrets in SSM Parameter Store (`/green-marketplace/<env>/<KEY>`), GitHub Actions with
  OIDC; prod deploys need approval. Same Docker image promoted between environments.

## 6. Roadmap / open items

| Item                                                                               | Status                                 |
| ---------------------------------------------------------------------------------- | -------------------------------------- |
| Backend MVP modules (auth, categories, plants + images, order requests, dashboard) | Done                                   |
| Postman collection + environments                                                  | Done                                   |
| `APP_ENV` variable, stricter prod checks, per-environment defaults                 | Proposed, not approved yet             |
| Dockerfile, GitHub Actions (PR checks, deploys)                                    | Proposed, not approved yet             |
| AWS / Atlas prod / domains setup                                                   | Waiting on owner's accounts and domain |
| Flutter app (customer + admin, flavors per environment)                            | Not started                            |
| Category images                                                                    | Not started                            |
| Push notifications (FCM)                                                           | Only if required                       |

## 7. Decision log

| Date       | Decision                                                                                                                                                                                                                  |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-11-18 | TypeScript for the backend. Separate backend repository.                                                                                                                                                                  |
| 2026-11-18 | Customer tracking: token + reference/phone fallback (no customer accounts).                                                                                                                                               |
| 2026-11-18 | Admin UI in the same Flutter app.                                                                                                                                                                                         |
| 2026-11-18 | Status order: submitted → under_review → contacted → accepted → completed.                                                                                                                                                |
| 2026-11-18 | Reject quantities below the minimum order quantity.                                                                                                                                                                       |
| 2026-11-18 | Allow out-of-stock plants in requests, clearly marked.                                                                                                                                                                    |
| 2026-11-18 | No `nurseryId` for now.                                                                                                                                                                                                   |
| 2026-11-18 | INR, Indian phone numbers and pincodes only.                                                                                                                                                                              |
| 2026-11-18 | Customer email optional; no email notifications initially.                                                                                                                                                                |
| 2026-11-18 | Zod 4 (Zod 3 had a high-severity advisory). No Mongoose `sanitizeFilter`; strict Zod schemas guard against operator injection.                                                                                            |
| 2026-11-18 | Prices stored and sent as whole paise.                                                                                                                                                                                    |
| 2026-11-18 | Added `GET /admin/categories/:id` (needed by the edit screen).                                                                                                                                                            |
| 2026-11-18 | Changing a plant's category requires an explicit subcategory; attributes PATCH replaces the object.                                                                                                                       |
| 2026-11-18 | Categories cannot be deleted or moved while plants use them; hidden categories hide their plants.                                                                                                                         |
| 2026-11-18 | "Enquiry" renamed to **Order Request** everywhere; module folder `order-requests`.                                                                                                                                        |
| 2026-11-18 | Order Requests: reference-number cancel route, admin may cancel accepted requests with a note, no step skipping, separate admin-notes endpoint, `availabilitySnapshot`, intended use as a fixed list, free-text location. |
| 2026-11-18 | New Requests on the dashboard = status `submitted`.                                                                                                                                                                       |
| 2026-11-18 | No AI attribution in commits/PRs; push only when asked.                                                                                                                                                                   |

## 8. Notes for the Flutter app (when it starts)

- Store each `trackingToken` + `referenceNumber` securely on the device; "My Requests" is
  built from them (the backend has no customer accounts). Offer the reference + phone
  lookup when a token is missing.
- Keep the customer's own contact details from submission for "Request Details"; tracking
  responses do not return them.
- Never present an Order Request as a confirmed order. Labels: My Requests, Submit Request,
  Request Details, Request Reference Number, Track Request, Cancel Request,
  "Request Submitted Successfully".
- Display prices as `amount / 100` rupees and label them indicative/estimated.
- Flavors `dev` / `prod` with `--dart-define-from-file` for the API base URL.
