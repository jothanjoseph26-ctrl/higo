# HiGo Platform — Gap Closure & Production Launch Plan

## Current Status: ~60-65% Complete

---

## PHASE 0: Railway Deployment (Done Today)

### Completed
- [x] `railway.toml` — Railway service configuration
- [x] `Dockerfile` — Multi-stage production build
- [x] `Procfile` — Process definition
- [x] `.env.railway` — Production environment template
- [x] Fixed `drivers.controller.ts` — removed non-existent Prisma model references
- [x] Fixed `admin.controller.ts` — rewritten to use actual schema models
- [x] Fixed `app.module.ts` — added `DriversModule`, `AdminModule`, `SmsModule`
- [x] Replaced AWS S3 → Alibaba Cloud OSS (`ali-oss`)
- [x] Replaced AWS Textract → Alibaba Cloud Vision (placeholder)
- [x] Added admin login endpoint (`POST /auth/admin/login`)
- [x] Updated `env.schema` for Alibaba Cloud env vars
- [x] Updated `package.json` — AWS SDKs → `ali-oss`, added `bcryptjs`

### Railway Deployment Steps
1. Create Railway account at https://railway.app
2. New Project → Deploy PostgreSQL plugin
3. New Project → Deploy Redis plugin
4. Connect GitHub repo `jothanjoseph26-ctrl/higo`
5. Set environment variables from `.env.railway`
6. Railway auto-deploys from `Dockerfile`
7. Run `prisma migrate deploy` as a one-off command
8. Seed admin user (see below)

### Seed Admin User
```sql
INSERT INTO admin_users (id, name, email, password_hash, role, is_active)
VALUES (
  gen_random_uuid(),
  'Super Admin',
  'admin@hiconnect.com',
  '$2a$10$<bcrypt_hash_of_your_password>',
  'super_admin',
  true
);
```

---

## PHASE 1: Week 1-2 — Compilation Fixes & Core Stability

### Priority 0: Must fix before anything works

| # | Task | Status | Files |
|---|------|--------|-------|
| 1 | Fix drivers controller compilation | DONE | `drivers.controller.ts` |
| 2 | Fix admin controller compilation | DONE | `admin.controller.ts` |
| 3 | Add missing module imports | DONE | `app.module.ts` |
| 4 | Replace AWS S3 with Alibaba OSS | DONE | `s3.service.ts`, `s3.module.ts` |
| 5 | Replace AWS Textract | DONE | `textract.service.ts` |
| 6 | Add admin login endpoint | DONE | `auth.controller.ts`, `auth.service.ts` |
| 7 | Install `ali-oss` + `bcryptjs` | DONE | `package.json` |
| 8 | Create seed script for admin user | TODO | `prisma/seed.js` |
| 9 | Create seed script for Abuja zones | TODO | `prisma/seed-zones.js` |
| 10 | Create seed script for pricing config | TODO | `prisma/seed-pricing.js` |

### Priority 1: Backend compilation verification
- [ ] Run `pnpm nx build @higo/api` and fix any remaining errors
- [ ] Run `prisma generate` and verify client compiles
- [ ] Test all endpoints with curl/httpie

---

## PHASE 2: Week 3-4 — Frontend Wiring

### Passenger App
| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Replace mock FCM with real Firebase | HIGH | 2h |
| 2 | Wire booking flow to real API | HIGH | 4h |
| 3 | Wire trip tracking to real Socket.IO | HIGH | 4h |
| 4 | Wire rating to real API | HIGH | 2h |
| 5 | Wire trip history to real API | HIGH | 2h |
| 6 | Replace hardcoded places with Google Places | MEDIUM | 4h |
| 7 | Implement saved places/favorites | MEDIUM | 4h |
| 8 | Wire wallet to Paystack | MEDIUM | 4h |
| 9 | Add trip cancellation flow | MEDIUM | 3h |
| 10 | Add error boundaries | LOW | 2h |

### Driver App
| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Replace Navigation placeholder with real map | HIGH | 6h |
| 2 | Wire trip accept/decline to real Socket.IO | HIGH | 4h |
| 3 | Wire earnings to real API | HIGH | 3h |
| 4 | Wire subscription to real Paystack | HIGH | 3h |
| 5 | Add driver onboarding screens | HIGH | 6h |
| 6 | Fix DriverSOS user vs driver reference | HIGH | 1h |
| 7 | Replace Alert.prompt with cross-platform modal | MEDIUM | 2h |
| 8 | Add offline fallback for voice | MEDIUM | 3h |
| 9 | Add vehicle management | MEDIUM | 4h |
| 10 | Add bank account management | MEDIUM | 3h |

### Admin Dashboard
| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Wire dashboard KPIs to real API | HIGH | 4h |
| 2 | Wire driver management to real API | HIGH | 3h |
| 3 | Wire KYC review to real API | HIGH | 4h |
| 4 | Wire disputes to real API | HIGH | 3h |
| 5 | Wire pricing config to real API | HIGH | 3h |
| 6 | Wire zones to real API | HIGH | 4h |
| 7 | Remove login mock fallback | HIGH | 1h |
| 8 | Add settings backend persistence | MEDIUM | 4h |
| 9 | Add audit logging | MEDIUM | 4h |
| 10 | Add error boundaries | LOW | 2h |

---

## PHASE 3: Week 5-8 — Production Features

### Backend
| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | FCM push notification service | HIGH | 6h |
| 2 | Real-time passenger-driver chat | HIGH | 8h |
| 3 | Cancellation fee logic | HIGH | 4h |
| 4 | Fare estimate endpoint (pre-trip) | HIGH | 3h |
| 5 | Google Maps Directions API integration | HIGH | 6h |
| 6 | Trip fare recalculation on completion | MEDIUM | 4h |
| 7 | Zone CRUD API for admin | MEDIUM | 4h |
| 8 | Promo code system | MEDIUM | 6h |
| 9 | Batch disbursement processing | MEDIUM | 4h |
| 10 | Background check integration | MEDIUM | 4h |

### Frontend
| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Real-time chat (passenger ↔ driver) | HIGH | 8h |
| 2 | Scheduled rides | MEDIUM | 6h |
| 3 | Referral system | MEDIUM | 6h |
| 4 | Promo code input in booking | MEDIUM | 3h |
| 5 | Corporate accounts UI | MEDIUM | 8h |
| 6 | Trip tracking share URL | LOW | 4h |
| 7 | Dark mode | LOW | 4h |
| 8 | Offline indicator | LOW | 2h |

---

## PHASE 4: Week 9-12 — Advanced Features

### Operations & Analytics
| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Launch War Room dashboard | HIGH | 8h |
| 2 | Fleet analytics | HIGH | 8h |
| 3 | Driver trust score system | MEDIUM | 6h |
| 4 | Automated alerting | MEDIUM | 4h |
| 5 | System health monitoring | MEDIUM | 4h |
| 6 | Bulk operations (KYC, suspension) | LOW | 6h |

### Driver Retention
| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Driver subscription model (3 tiers) | MEDIUM | 6h |
| 2 | Driver incentives (zone bonuses) | MEDIUM | 4h |
| 3 | Referral rewards | LOW | 4h |
| 4 | Earnings leaderboard | LOW | 4h |

### AI & Smart Features
| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Smart matching (demand/supply) | MEDIUM | 8h |
| 2 | Fraud detection | LOW | 8h |
| 3 | Offline mode | LOW | 6h |
| 4 | Surge pricing activation | LOW | 4h |

---

## PHASE 5: Week 13-16 — Pre-Launch

### DevOps & Security
| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Staging environment on Railway | HIGH | 4h |
| 2 | CI/CD pipeline (GitHub Actions) | HIGH | 4h |
| 3 | Sentry error tracking integration | HIGH | 2h |
| 4 | Rate limiting tuning | HIGH | 2h |
| 5 | Security audit | HIGH | 8h |
| 6 | SSL/TLS verification | HIGH | 1h |
| 7 | Database backups | HIGH | 2h |
| 8 | Load testing | MEDIUM | 4h |

### Testing
| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | E2E tests for booking flow | HIGH | 8h |
| 2 | E2E tests for driver flow | HIGH | 6h |
| 3 | E2E tests for admin flow | HIGH | 6h |
| 4 | Unit tests for payment service | MEDIUM | 4h |
| 5 | Unit tests for matching service | MEDIUM | 4h |
| 6 | Integration tests | MEDIUM | 8h |

### Launch Prep
| # | Task | Priority | Effort |
|---|------|----------|--------|
| 1 | Seed Abuja zones with real coordinates | HIGH | 4h |
| 2 | Seed pricing config | HIGH | 2h |
| 3 | Seed test data (drivers, passengers) | HIGH | 4h |
| 4 | App Store / Play Store submission | HIGH | 8h |
| 5 | Driver onboarding documentation | HIGH | 4h |
| 6 | Operations runbook | HIGH | 4h |
| 7 | Support team training | HIGH | 8h |

---

## Effort Summary

| Phase | Duration | Key Deliverable |
|-------|----------|-----------------|
| Phase 0 | Done | Railway deployment ready |
| Phase 1 | Week 1-2 | Backend compiles, seeds, admin login |
| Phase 2 | Week 3-4 | All 3 apps wired to real API |
| Phase 3 | Week 5-8 | Production features (chat, push, fees) |
| Phase 4 | Week 9-12 | Advanced features (analytics, AI) |
| Phase 5 | Week 13-16 | Pre-launch (testing, security, stores) |

**Total estimated effort: 12-16 weeks to production launch**

---

## Immediate Next Steps (This Week)

1. **Deploy to Railway** — push code, configure env vars, verify API starts
2. **Seed database** — admin user, Abuja zones, pricing config
3. **Fix remaining compilation errors** — run build, fix any issues
4. **Test core flows** — OTP login, booking, trip lifecycle
5. **Wire passenger app** — connect to real API endpoints

---

## Risk Register

| Risk | Impact | Mitigation |
|------|--------|------------|
| Alibaba Cloud Vision API not provisioned | KYC OCR won't work | Use manual review until provisioned |
| Paystack plans not created | Subscriptions won't work | Create plans before launch |
| No real zone coordinates | Geofencing won't work | Seed with Abuja coordinates |
| FCM not configured | No push notifications | Priority 1 in Phase 3 |
| No App Store accounts | Can't distribute | Start process now |
