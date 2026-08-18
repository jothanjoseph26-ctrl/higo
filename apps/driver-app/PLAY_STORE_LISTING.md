# HiGO Driver — Play Store Listing Copy

## App name (30 char max)
HiGO Driver

## Short description (80 char max)
Drive with HiGO: accept rides, earn fast, track trips in real time in Abuja.

## Full description (4000 char max)

Drive with HiGO and start earning on your own schedule in Abuja, FCT.

HiGO connects you with passengers nearby, so you spend less time waiting and more time earning. Whether you drive a keke or a car, HiGO Driver gives you everything you need to manage your rides from one app.

WHY DRIVE WITH HIGO
• Go online and receive nearby ride requests instantly
• See pickup and drop-off details before you accept
• Turn-by-turn navigation to every pickup and destination
• Get paid — cash or card, tracked automatically in your earnings
• Build your rating and grow your passenger base
• In-app chat and calling to coordinate with passengers
• 24/7 support for safety concerns or trip issues

GETTING STARTED
1. Sign up with your phone number
2. Complete driver verification (ID, licence, vehicle documents)
3. Go online and start receiving ride requests

SAFETY FIRST
HiGO verifies every driver's identity and vehicle documents before they can accept trips. Your live location is shared with passengers only during active trips so they can track their ride and you can be found quickly in an emergency.

Questions or support: support@hiconnectgo.com

## Category
Maps & Navigation (or Business, depending on what's available for ride-hailing driver apps in your Play Console region)

## Privacy Policy URL
https://pilot.hiconnectgo.com/privacy-policy

## Contact email
support@hiconnectgo.com

---

## Data Safety form — quick reference

Based on what the app actually collects (see src/App.tsx, app.json permissions, and the Privacy Policy):

| Data type | Collected? | Purpose | Shared? |
|---|---|---|---|
| Precise location | Yes | App functionality (trip matching/dispatch), while app is in use AND in background while online | Shared with matched passenger during a trip |
| Name | Yes | Account management, app functionality | Shared with matched passenger |
| Phone number | Yes | Account management (OTP verification) | Not shared publicly |
| Photos (KYC docs, profile) | Yes | Account management (identity verification) | Not shared |
| Financial info (payment/earnings) | Yes | App functionality (payouts) | Processed via Paystack |
| App activity / device IDs | Yes | Analytics, crash reporting (Sentry, Firebase Crashlytics) | Not shared |

- **Is data encrypted in transit?** Yes (HTTPS/WSS).
- **Can users request data deletion?** Yes — via support@hiconnectgo.com (mention this in the account-deletion section of the form).
- **Background location justification** (Play requires a written explanation + a demo video for background location approval): "HiGO Driver shares a driver's live location with dispatch and the matched passenger while the driver is online and en route to or during a trip, including when the app is backgrounded, so passengers can track their ride's arrival and see accurate ETAs, and so HiGO can safely locate a driver in an emergency."

## App content declarations
- **Target audience:** 18+ (drivers must be licensed adults)
- **Ads:** No (unless you've added an ad SDK — confirm)
- **In-app purchases:** No (subscription payments go through Paystack outside Play Billing — confirm this is acceptable for your Play Console account type; ride-hailing driver apps are typically exempt from Play Billing requirements since they're a real-world service, not digital content, but double-check current Play policy)
