# HiGO Launch Status — 2026-07-05

## What works right now

| Piece | Status |
|---|---|
| Backend API (Railway) | ✅ Live at `www.hiconnectgo.com` — health OK, firebase-admin initialized, `verify-firebase-phone` endpoint live |
| Passenger Android app | ✅ **Verified running on physical phone** (SM-A055F): onboarding renders, phone-OTP flow reaches the Verify Code screen with live resend countdown. APK: `dist/apks/higo-passenger-preview.apk` (build `461927b1`) |
| Driver Android app | ✅ **Verified running on physical phone**: location onboarding renders, Firebase OTP parity complete. APK: `dist/apks/higo-driver-preview.apk` (build `66387f06`) |
| Production AABs | ✅ **Built and downloaded**: `dist/apks/higo-passenger-production.aab` + `dist/apks/higo-driver-production.aab` — signed with the EAS keystores, ready to upload to Play Console |
| Firebase phone OTP | ✅ Both apps use native `@react-native-firebase/auth`; `com.driverapp` registered in Firebase; EAS keystore SHA-1/SHA-256 registered for both packages |
| Android release signing | ✅ EAS-managed keystores exist for both apps |
| Twilio Verify fallback | ✅ Server supports Twilio Verify when `TWILIO_VERIFY_SERVICE_SID` is set |

## Root causes fixed today (why 18h of local builds failed)

1. **Local Windows Android builds are a dead end** — `react-native-worklets` CMake path-length failure. Solution: EAS cloud builds (Linux workers). Do not fight the local build.
2. app.json slug didn't match the EAS project (`higo-passenger` vs `passengerapp`).
3. Passenger metro config used `@react-native/metro-config` instead of `expo/metro-config` → entry resolution + serializer failures on EAS.
4. Workspace libs (`@higo/brand-tokens` etc.) have gitignored `dist/` → added `eas-build-post-install` to build them on EAS.
5. `import.meta` in `config.ts`/`sentry.ts` → Hermes compile failure. Replaced with `process.env.EXPO_PUBLIC_*` (Vite `define` supplies web).
6. `newArchEnabled=false` would break reanimated 4 → reverted to `true`.
7. Startup crash on device: `window.location.origin` in `linking.ts` (window exists on RN, location doesn't).
8. Default Android robot launcher icon → replaced with branded HiGO icons (all densities + adaptive + 1024 masters).
9. Second on-device crash: `react` 19.2.7 didn't match RN's renderer 19.2.3 → pinned `react`/`react-dom` 19.2.3 workspace-wide (pnpm override).
10. Driver app crashed on `expo-av` (removed from SDK 56) → migrated ringtone + voice recording to `expo-audio`.
11. Ran `expo install --fix` in both apps: RN 0.84.1→0.85.3, reanimated 4.3.1, worklets 0.8.3, async-storage 2.2.0, Sentry RN 7.11 — all now match SDK 56 expectations (`expo install --check` passes).
12. RN 0.85 removed `StyleSheet.absoluteFillObject` → replaced with explicit absolute positioning in 4 files.

## Bug-fix round 2 (from your on-device testing)

A separate session fixed three bugs you hit; I verified and extended them:

1. **"Error when selecting payment method"** — `RequestTripDto.pickup`/`destination` used `@ValidateNested() @Type(() => LatLngDto)` under the API's global `forbidNonWhitelisted: true`, which was rejecting valid nested coordinate payloads. Replaced with a direct custom validator on the parent property. Fixed in `trip.dto.ts` + `trips.controller.ts` (normalizes to `{lat,lng}` before hitting the service). I found and fixed the **same bug still present in `TripSosDto.location`** (the emergency SOS endpoint) — same root cause, would have failed the same way.
2. **"Bottom button hidden behind phone nav buttons"** — passenger `ScreenShell.tsx`/`App.tsx` now use `react-native-safe-area-context` with explicit bottom-inset padding instead of plain `SafeAreaView` (which doesn't reserve space for Android's gesture/button bar). **The driver app had the identical bug and hadn't been touched** — applied the same fix (`App.tsx` wraps in `SafeAreaProvider`, `ScreenShell.tsx` uses safe-area insets). I then found the *same root cause in four more screens* that build their own bottom action sheets/bars outside `ScreenShell` (map overlays with floating CTAs) and fixed those too: passenger `Home.tsx` (search bar), `DriverEnRoute.tsx` and `TripActive.tsx` (call/cancel sheet). Driver's `Navigation.tsx` also has a `bottom: 0` style but it's just the map filling its own bounded container (not a floating CTA) — already covered by the `ScreenShell` fix, no separate change needed.
3. **"Goes offline when there's network"** — passenger `offline.ts` health check now requires 2 consecutive failures (not 1) before flagging offline, uses an 8s timeout with no-cache headers, and restores "online" immediately on any success. This was a passenger-only module; driver app has no equivalent health-check poller, so nothing to port there.

4. **While screenshotting the fix**, the passenger app rendered in landscape even though `app.json` says `"orientation": "portrait"` — turns out the passenger app is a *bare* Android project (has a committed `android/` folder), and bare projects don't get app.json's orientation setting auto-injected by EAS the way managed projects do. `AndroidManifest.xml`'s `MainActivity` had no `android:screenOrientation` at all, so the phone could freely rotate. Added `android:screenOrientation="portrait"` directly to the manifest. This is plausibly a real contributor to the "hidden button" report if the phone rotated during use — an unlocked, untested landscape layout is exactly where things clip. Driver app is a managed-workflow project, so its `app.json` orientation setting is honored automatically; no manifest edit needed there.

Verified: API test suite passes (30/30), API production build succeeds, both apps typecheck clean, both apps bundle clean locally. **Both apps reinstalled on your phone with every fix above and confirmed stable** (process alive, no crash, no fatal exceptions in logcat) — final passenger build is `dist/apks/higo-passenger-preview.apk`, driver is `dist/apks/higo-driver-preview.apk`. Your phone locked partway through my on-device screenshot pass, so I didn't force through the lock screen — worth you doing one more visual pass yourself on the payment/booking flow to confirm the button and rotation fixes look right.

**Separate, non-blocking issue found while testing**: driver app logs a non-fatal FCM push-token registration failure on every cold start (Firebase Messaging instance not ready when the registration call fires). Doesn't crash the app or affect OTP login — flagged as a follow-up task, not fixed tonight.

**⚠️ Not yet live**: the API-side fix (`trip.dto.ts`/`trips.controller.ts`) only exists in your local working tree — Railway deploys from git, and nothing from today (168 changed files across both bug-fix rounds) has been committed or pushed. Your phone will keep hitting the *old* broken validation on the live API until this is pushed. Say the word and I'll commit + push to `main`.

## Remaining before store submission

### You must do (accounts/decisions — cannot be automated)
1. **Test OTP login E2E on your phone** — both apps are already installed on your phone. Open each, enter your real number, and confirm the SMS code arrives and login completes (I reached the Verify Code screen but the SMS didn't land on the test SIM while you were away — if it doesn't arrive, check Firebase Console → Authentication → Sign-in method → Phone for quota/region settings). Then book a test trip end-to-end.
2. **Google Play Console account** ($25 one-time) — create app listings for both apps.
3. **Apple Developer Program** ($99/yr) — iOS builds are impossible without it. After enrollment: `npx eas-cli build -p ios` will set up certificates interactively.
4. **Privacy policy URL** — required by both stores (apps collect location + phone numbers).
5. Store listing assets: screenshots, feature graphic, descriptions.
6. Play data-safety form + background-location declaration for the driver app (`FOREGROUND_SERVICE_LOCATION` triggers extra review — prepare a short demo video).

### Next build commands (when ready for stores)
```
cd apps/passenger-app && npx eas-cli build -p android --profile production   # AAB
cd apps/driver-app    && npx eas-cli build -p android --profile production   # AAB
```
First Play upload is manual (drag AAB into Play Console); afterwards `eas submit` can automate.

### Known non-blockers to schedule after launch
- API strict `typecheck` target fails on pre-existing issues (admin-finance, events.gateway, trips.service) — the deployed webpack build is unaffected.
- Driver KYC upload has no native file picker (web-only path is guarded, native button no-ops).
- `hiconnect-firebase-services-key.json` is committed to the repo — rotate it and move to env/secret storage before public launch.

## Honest assessment vs "launch tomorrow"

Android **internal/closed testing track tomorrow is realistic** (APKs exist; Play review for closed testing is hours-to-days). Public production listing typically takes days (review + data-safety + background-location review for driver app). iOS is gated on Apple enrollment (1–2 days for approval) and has never been built — assume ~1 week minimum for App Store.

The GAP_CLOSURE_PLAN's Phases 2–5 (chat, promo codes, analytics, load testing…) are NOT done — what exists is the core loop: OTP auth, booking, matching, trip lifecycle, payments scaffolding, admin dashboard. Launching a pilot in Abuja on the core loop is a business call; the plan document estimated 12–16 weeks for the full roadmap.
