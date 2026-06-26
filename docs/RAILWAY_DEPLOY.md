# Railway Deploy Runbook (for agents)

This document describes how HiGo is deployed to Railway today. Follow it when shipping code changes or helping another agent deploy.

## Architecture (production)

| Railway service | Role | Dockerfile | Key env vars |
|-----------------|------|------------|--------------|
| **Hiconnect** | NestJS API (`main.js`) | `Dockerfile` (default) | `DATABASE_URL`, `REDIS_URL`, `FIREBASE_*`, secrets from `.env.railway` |
| **Worker** | Bull queue worker (`worker.js`) | `Dockerfile` | Same as API + `PROCESS_ROLE=worker` |
| **Admin** | nginx: admin + passenger + driver web | `Dockerfile.web` via `RAILWAY_DOCKERFILE_PATH` | `VITE_API_URL`, `VITE_API_BASE_URL`, `VITE_SOCKET_URL` |
| **PostgresPostGIS** | Database | (Railway plugin) | Referenced as `${{PostgresPostGIS.DATABASE_URL}}` |
| **Redis** | Cache / queues | (Railway plugin) | Referenced in `REDIS_URL` |

### Public URLs (current)

| App | URL |
|-----|-----|
| API | https://hiconnect-production.up.railway.app |
| API health | https://hiconnect-production.up.railway.app/health |
| Admin | https://admin-production-13cc.up.railway.app/login |
| Passenger web | https://admin-production-13cc.up.railway.app/passenger/ |
| Driver web | https://admin-production-13cc.up.railway.app/driver/ |

Passenger and driver share the **Admin** service (one domain on free tier). nginx path routing is in `docker/nginx-web.conf.template`.

---

## Prerequisites

1. **Railway CLI** installed and logged in:
   ```powershell
   railway login
   railway whoami
   ```

2. **Linked project** (from repo root):
   ```powershell
   cd C:\Users\flood\hiconnect\higo-platform
   railway link
   ```
   Project name: `Hiconnect`, environment: `production`.

3. **Do not** `git add -A` before push — `.env` / `.env.local` contain secrets and GitHub push protection will block the push. Stage only the files you changed.

---

## What each Dockerfile builds

### `Dockerfile` (API + Worker)

- Multi-stage: `deps` → `builder` (Nx build `@higo/api`) → `runner`
- Runs `apps/api/dist/main.js` by default
- If `PROCESS_ROLE=worker`, runs `apps/api/dist/worker.js`
- Health check path: `/health` (excluded from `/api` global prefix in Nest)

### `Dockerfile.web` (Admin service)

- Builds three Vite apps:
  - `apps/admin-dashboard` → `/`
  - `apps/passenger-app` with `VITE_BASE_PATH=/passenger/` → `/passenger/`
  - `apps/driver-app` with `VITE_BASE_PATH=/driver/` → `/driver/`
- Serves all three via nginx on `$PORT` (3000)
- Build fails if any bundle still contains bare `expo-modules-core` imports

### Per-service Dockerfile selection

Railway reads `RAILWAY_DOCKERFILE_PATH` per service (not from `railway.toml` alone):

| Service | Set in Railway dashboard |
|---------|--------------------------|
| Hiconnect | `Dockerfile` (or unset) |
| Worker | `Dockerfile` |
| Admin | `Dockerfile.web` |

`railway.toml` sets shared deploy settings (`healthcheckPath = "/health"`, restart policy).

---

## Standard deploy workflow

### 1. Commit and push code

```powershell
Set-Location C:\Users\flood\hiconnect\higo-platform

# Stage only intentional files — never git add -A
git add path/to/changed/files
git commit -m "fix: describe change"
git push origin main
```

### 2. Deploy services via CLI

Deploy from **repo root**. Use `--detach` so the CLI returns while Railway builds.

```powershell
# API
railway up -s Hiconnect --detach

# Background worker
railway up -s Worker --detach

# Admin + passenger + driver web
railway up -s Admin --detach
```

You do **not** need to redeploy Postgres or Redis unless you changed their plugins.

### 3. Watch build logs

```powershell
railway logs -s Hiconnect
railway logs -s Admin
```

Or open the build URL printed by `railway up`.

### 4. Smoke test after deploy (~2 min)

```powershell
# API liveness (note: /health NOT /api/health)
Invoke-RestMethod https://hiconnect-production.up.railway.app/health

# API readiness (DB + Redis)
Invoke-RestMethod https://hiconnect-production.up.railway.app/health/ready

# Web apps
Invoke-WebRequest https://admin-production-13cc.up.railway.app/passenger/ -UseBasicParsing
Invoke-WebRequest https://admin-production-13cc.up.railway.app/driver/ -UseBasicParsing
```

From repo root (API must be up):

```powershell
node scripts/smoke-api.cjs
```

---

## Environment variables (agent checklist)

### Hiconnect (API) — required for OTP + auth

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | `${{PostgresPostGIS.DATABASE_URL}}` |
| `REDIS_URL` | Redis plugin URL |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Firebase Admin (push, verify phone tokens) |
| `FIREBASE_WEB_API_KEY` | Firebase client Phone Auth (public; set on API, exposed via `/api/auth/firebase-config`) |
| `FIREBASE_PROJECT_ID` | `hiconnect-3caf8` |
| `OTP_PROVIDER` | `firebase` |
| `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY` | Auth |
| `GOOGLE_OAUTH_CLIENT_ID` | Google sign-in |

Template: `.env.railway` (copy values into Railway dashboard — never commit real secrets).

### Admin (web build)

| Variable | Example |
|----------|---------|
| `RAILWAY_DOCKERFILE_PATH` | `Dockerfile.web` |
| `VITE_API_URL` | `https://hiconnect-production.up.railway.app/api` |
| `VITE_API_BASE_URL` | `https://hiconnect-production.up.railway.app/api` |
| `VITE_SOCKET_URL` | `https://hiconnect-production.up.railway.app` |

### Worker

| Variable | Value |
|----------|-------|
| `PROCESS_ROLE` | `worker` |
| Same secrets as Hiconnect | DB, Redis, Firebase, etc. |

Set variables via CLI:

```powershell
railway variables set KEY=value -s Hiconnect
railway variables set KEY=value -s Admin
```

List (names only):

```powershell
railway variables -s Hiconnect
```

---

## Firebase web OTP (passenger / driver browsers)

Web apps use **Firebase Phone Auth** (client sends SMS via Google), not the API `send-otp` endpoint.

1. API serves config: `GET /api/auth/firebase-config`
2. Browser calls `signInWithPhoneNumber` (Firebase SDK)
3. User enters SMS code
4. App calls `POST /api/auth/verify-firebase-phone` with Firebase `idToken`

**Firebase Console setup** (one-time):

- Authentication → Phone → **Enabled**
- Authorized domains → `admin-production-13cc.up.railway.app`
- Project settings → copy Web API Key → `FIREBASE_WEB_API_KEY` on Hiconnect

Helper script to fetch/create web app config (uses service account file locally):

```powershell
cd apps/api
node ../../scripts/fetch-firebase-web-config.cjs
```

---

## Common pitfalls (learned in production)

| Symptom | Cause | Fix |
|---------|-------|-----|
| Passenger blank page, `ENGLISH` undefined | Missing `SupportedLanguage` enum in `@higo/shared-types` | Add enum, rebuild, redeploy Admin |
| `expo-modules-core` bare import error | Vite marked expo as `external` | Use `vite-expo-shim.plugin.ts`; no `external: [/expo-modules-core/]` |
| `/api/health` 404 spam | Health is at `/health`, not under `/api` | Use `HEALTH_CHECK_URL` in passenger `config.ts` |
| OTP returns `channel: mock` | Termii 401; web has no FCM token | Use Firebase Phone Auth on web; set `FIREBASE_WEB_API_KEY` |
| `identitytoolkit ... ERR_CONNECTION_CLOSED` | Phone auth disabled, domain not authorized, or network | Enable Phone + authorized domain in Firebase Console |
| Worker crashes on DI | Missing module imports | Ensure `PaymentsModule` imports `AiModule`, etc. |
| Prisma engine missing in Docker | Partial `node_modules` copy | `Dockerfile` copies full pnpm `node_modules` in runner |

---

## When to redeploy which service

| You changed… | Redeploy |
|--------------|----------|
| `apps/api/**`, `packages/shared-types/**` (API types) | **Hiconnect** + **Worker** |
| `apps/admin-dashboard/**` | **Admin** |
| `apps/passenger-app/**`, `apps/driver-app/**` | **Admin** |
| `Dockerfile.web`, `docker/nginx-web.conf.template` | **Admin** |
| `Dockerfile`, worker bootstrap | **Hiconnect** + **Worker** |
| Railway env vars only | Redeploy affected service (or wait for auto-redeploy) |

---

## Quick reference commands

```powershell
# Status
railway status

# Deploy all three app services
railway up -s Hiconnect --detach
railway up -s Worker --detach
railway up -s Admin --detach

# Logs
railway logs -s Hiconnect
railway logs -s Worker
railway logs -s Admin

# DB migrate (run locally against production URL — careful)
# Or use Railway shell / one-off job
cd apps/api
pnpm exec prisma migrate deploy
```

---

## Agent handoff template

After deploying, log:

1. **Commit**: `git log -1 --oneline`
2. **Services redeployed**: Hiconnect / Worker / Admin
3. **Smoke results**: `/health`, `/passenger/`, `/driver/`
4. **Env changes**: list any new Railway variables (names only, not values)
5. **Known blockers**: e.g. Firebase Console steps still needed by human