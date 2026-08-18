# HiGO Project — Gemini Context

## What is HiGO?
HiGO is a ride-hailing platform (like Uber/Bolt) for Nigeria. It has:
- **Passenger app** — riders book rides
- **Driver app** — drivers accept rides, navigate, complete trips
- **Admin portal** — manage drivers, passengers, trips, zones, pricing
- **Backend API** — NestJS + Prisma + PostgreSQL + Redis
- **Web apps** — React + Vite (served at ride.hiconnectgo.com, pilot.hiconnectgo.com, portal.hiconnectgo.com)

## Project Structure
```
higo-platform/                  # Nx monorepo (pnpm workspaces)
├── apps/
│   ├── api/                    # NestJS backend (deployed to Railway as "Hiconnect")
│   ├── driver-app/             # React Native Expo app (driver phone app)
│   ├── passenger-app/          # React Native Expo app (passenger phone app)
│   ├── admin-dashboard/        # Admin web app (Vite React)
│   ├── admin-dashboard-e2e/    # Playwright E2E tests for admin
│   └── api-e2e/                # Playwright E2E tests for API
├── packages/
│   ├── shared-types/           # TypeScript types shared across all apps
│   ├── api-client/             # API client library
│   └── brand-tokens/           # Design tokens (colors, spacing)
├── docker/                     # Docker configs
├── docs/                       # Documentation
└── scripts/                    # Build/deploy scripts
```

## Key Technologies
- **Package manager**: pnpm (monorepo workspaces)
- **Task runner**: Nx (use `pnpm nx` for all tasks)
- **Backend**: NestJS, Prisma ORM, PostgreSQL (with PostGIS), Redis
- **Mobile apps**: React Native + Expo (SDK 56), TypeScript
- **Web apps**: React 19, Vite, TailwindCSS, shadcn/ui components
- **Realtime**: Socket.IO (WebSocket)
- **Push notifications**: Firebase Cloud Messaging (FCM)
- **Maps**: Google Maps API
- **Payments**: Paystack
- **Auth**: Phone OTP (Firebase Phone Auth)
- **Deploy**: Railway (backend), EAS (mobile apps)

## Common Commands

### Backend (apps/api)
```bash
# Build
pnpm nx build @higo/api

# Run locally
pnpm nx serve @higo/api

# Prisma migrations
cd apps/api && pnpm prisma migrate dev
cd apps/api && pnpm prisma generate

# Deploy to Railway
railway up -s Hiconnect --detach
```

### Driver App (apps/driver-app)
```bash
# Prebuild Android native files
cd apps/driver-app && npx expo prebuild --platform android --no-install

# Build APK (requires JDK 17 + Android SDK)
export JAVA_HOME="C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot"
export ANDROID_HOME="$LOCALAPPDATA/Android/Sdk"
cd apps/driver-app/android && ./gradlew assembleRelease --no-daemon

# Build via EAS (cloud)
cd apps/driver-app && npx eas build --platform android --profile production
```

### Passenger App (apps/passenger-app)
```bash
# Same as driver app but from apps/passenger-app/
cd apps/passenger-app/android && ./gradlew assembleRelease --no-daemon
```

### Web Apps (Base44)
```bash
# Build all web apps
cd Base44 && npm run build

# Deploy to Railway
railway up -s base44-driver --detach   # pilot.hiconnectgo.com
railway up -s base44-admin --detach   # portal.hiconnectgo.com
railway up -s Base44 --detach         # ride.hiconnectgo.com
```

## Deployment Architecture
```
Railway Services:
├── Hiconnect     → api.hiconnectgo.com       (NestJS API)
├── Worker        → (no public URL)            (Bull queue workers)
├── Admin         → rider.hiconnectgo.com      (admin + rider web)
├── base44-driver → pilot.hiconnectgo.com      (driver web app)
├── base44-admin  → portal.hiconnectgo.com     (admin portal web)
└── Base44        → ride.hiconnectgo.com       (passenger web app)

Databases:
├── PostgresPostGIS → Primary database
└── Redis           → Cache + Bull queues + Socket.IO adapter
```

## Railway Deployment
```bash
# Always link to correct service first
railway link --project "higo-worker" --environment "production" --service <ServiceName>

# Then deploy
railway up --detach

# Check status
railway status

# View logs
railway logs -s <ServiceName> --lines 50
```

## Important Notes
- **Never `git add -a`** — `.env` files contain secrets
- **API health**: `GET /health` (not `/api/health`)
- **Validation**: Do NOT use `@IsNumber()` with `@Type(() => Number)` — use `@Type(() => Number)` + `@Min`/`@Max` only
- **Firebase**: Service account JSON is in Railway env var `FIREBASE_SERVICE_ACCOUNT_JSON`
- **Driver app uses WebView shell**: The native app is a WebView wrapper. The actual UI is served from `pilot.hiconnectgo.com`. Native code handles FCM, background location, and camera.

## Android Build Requirements
- **JDK 17** (NOT JDK 21/26 — CMake/NDK requires JDK 17)
  - Installed at: `C:\Program Files\Microsoft\jdk-17.0.20.8-hotspot`
- **Android SDK** at: `%LOCALAPPDATA%\Android\Sdk`
- **Build tools**: 36.0.0, **compileSdk**: 36, **minSdk**: 24
- **Windows long paths** must be enabled (registry key) for CMake builds
- **EAS builds** require paid Expo account (free plan limited)
