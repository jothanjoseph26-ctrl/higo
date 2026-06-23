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