# HiGo API (`@higo/api`)

NestJS modular monolith — backend foundation for the HiGo Abuja mobility module.

## Dev startup

```bash
# 1. Infra (from repo root)
docker compose up -d

# 2. Install
pnpm install

# 3. Environment
cp .env.example ../../.env   # or copy root .env.example to .env at repo root

# 4. Database
cd apps/api
pnpm exec prisma migrate dev
pnpm exec prisma db seed
cd ../..

# 5. API
pnpm nx serve @higo/api
```

- REST base: `http://localhost:3000/api`
- Swagger (dev only): `http://localhost:3000/docs`
- Liveness: `GET /health`
- Readiness: `GET /health/ready` (Postgres + Redis)

## Published contracts (for Agents 2–7)

| Export | Package / path | Consumers |
|--------|----------------|-----------|
| Domain + API + socket types | `@higo/shared-types` | All apps |
| `AuthGuard`, `RolesGuard`, `@Public`, `@CurrentUser` | `apps/api/src/common/*` | Feature modules |
| `PrismaService` | `@Global()` — inject in constructors | Agents 2, 3, 4 |
| `RedisService` | namespaced `get/set/setNx/del/incr/expire` + sliding window | Agents 2, 3 |
| `S3Service` | upload, presigned GET/PUT, delete | Agent 4 (KYC) |
| `SmsService` | Termii → AfricasTalking fallback | Auth + Agent 2 |
| `AesService` | AES-256-GCM encrypt/decrypt | Agents 3, 4 |
| `EventsGateway` shell | JWT socket middleware, `ROOMS` from shared-types | Agent 2 |

### S3 key convention (KYC)

`higo-kyc-docs/{driverId}/{docType}/{timestamp}.{ext}`

### Auth

- Access JWT: 15 min (`JWT_ACCESS_SECRET`), claims `{ sub, type, role? }`
- Refresh JWT: 7 days (`JWT_REFRESH_SECRET`), includes `jti`; rotation denylist in Redis
- Web clients: send `X-Client-Platform: web` to receive refresh token as `higo_rt` httpOnly cookie
- Mobile: refresh token in response body

### Milestones

1. **`@higo/shared-types` published** — import `Trip`, `SOCKET_EVENTS`, auth DTOs, etc.
2. **DB migrated + guards available** — PostGIS enabled, GiST indexes applied, `AuthGuard`/`RolesGuard` wired globally

## Railway / Staging Smoke Tests

Set your Railway API URL (no trailing slash):

```bash
export BASE="https://your-service.up.railway.app"
```

**Prefix note:** REST routes use the global `/api` prefix (`main.ts`). Health probes are excluded — they live at `/health`, not `/api/health`.

### Worker dyno

Run the Bull dispatch worker as a separate Railway service (or process):

```bash
node apps/api/dist/worker.js
```

Requires the same env as the API (`DATABASE_URL`, `REDIS_URL`, etc.).

### Liveness

```bash
curl -sS "$BASE/health"
# → {"status":"ok"}
```

### Readiness (Postgres + Redis)

```bash
curl -sS "$BASE/health/ready"
# → 200 when database + redis are up
```

### Send OTP

```bash
curl -sS -X POST "$BASE/api/auth/send-otp" \
  -H "Content-Type: application/json" \
  -d '{"phone":"+2348012345678","userType":"passenger"}'
```

### Admin login

Route is `POST /api/auth/admin/login` (auth controller, not `/admin/*`).

```bash
curl -sS -X POST "$BASE/api/auth/admin/login" \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@higo.ng","password":"<ADMIN_PASSWORD>"}'
# → accessToken (+ refreshToken unless X-Client-Platform: web)
```

### Local smoke script (health + admin login)

From repo root (API must be running; seed admin credentials from `prisma/seed.js`):

```bash
# Health + readiness + admin login (defaults: localhost:3000, admin@hiconnect.com / HiGo@Admin2024)
node scripts/smoke-api.cjs

# Against staging
BASE=https://your-service.up.railway.app node scripts/smoke-api.cjs

# Custom admin credentials
ADMIN_EMAIL=admin@hiconnect.com ADMIN_PASSWORD=HiGo@Admin2024 node scripts/smoke-api.cjs
```

`scripts/test-browser.cjs` runs `smoke-api.cjs` first, then probes the admin dashboard in headless Chromium.

### Full ride API script (local)

```bash
# After send-otp, read OTP from API logs or: redis-cli GET "otp:+2348011111111"
PASSENGER_OTP=123456 DRIVER_OTP=654321 node scripts/local-e2e-ride.cjs
```

See [`HIGO_LOCAL_E2E_AND_DEPLOYMENT_PLAN.md`](../../HIGO_LOCAL_E2E_AND_DEPLOYMENT_PLAN.md) for the complete local + Railway + store deployment guide.

### Admin dashboard Playwright e2e

Requires Docker (Postgres + Redis), migrated DB, and seed:

```bash
docker compose up -d
cd apps/api && pnpm exec prisma migrate dev && pnpm exec prisma db seed && cd ../..
pnpm nx e2e @higo/admin-dashboard-e2e
```

E2E uses seed admin `admin@hiconnect.com` / `HiGo@Admin2024` (override via `ADMIN_EMAIL` / `ADMIN_PASSWORD`).

### Request trip (authenticated passenger)

Requires a passenger JWT from OTP verify or Firebase phone verify. Save the token:

```bash
export TOKEN="<passenger_access_token>"

curl -sS -X POST "$BASE/api/trips/request" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "pickup": {"lat": 9.0765, "lng": 7.3986},
    "pickupAddress": "Wuse Market, Abuja",
    "destination": {"lat": 9.0579, "lng": 7.4951},
    "destinationAddress": "Garki, Abuja",
    "vehicleType": "keke",
    "paymentMethod": "cash"
  }'
```