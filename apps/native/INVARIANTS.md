# INVARIANTS — Stroom Command Center
**Read this file before any code change. If your proposed change would touch a Load-Bearing File or regress a Recently Fixed bug, STOP and surface the conflict to the operator before writing any code.**

## Navigation
- Tab order (left to right): Pulse · Queue · Explore · Command · Projects · Ops
- Source file: apps/native/app/(tabs)/_layout.tsx
- Ops is a TOP-LEVEL tab. It is NEVER nested under Projects, Command, or any other tab.
- Tab order is enforced by apps/native/__tests__/tab-order.test.ts. Do not bypass.

## Gestures
- Full-screen right-swipe-back is enabled on every Stack screen via fullScreenGestureEnabled: true on the Stack root in apps/native/app/_layout.tsx. This is the Expo Router / React Navigation 7 native iOS prop. Per-screen options blocks must NOT override fullScreenGestureEnabled. Modal screens are the only allowed exception and must be explicitly tagged with presentation: 'modal'.

## Brand & Visual
- Watermark uses the helix double-O mark, NEVER the letter S. Component: apps/native/src/components/ScreenWatermark.tsx.
- Trust scores are on a 0–10 scale. Any 0–1 reference is wrong.
- Header density is unified across all six tabs via apps/native/src/components/ScreenHeader.tsx. Custom title blocks are forbidden.

## Capability Gates (DR-036)
- admin.manage_users → operator-admin Edge Function
- claims.approve → Approve action on Queue cards and Why sheet
- claims.reject → Reject action on Queue cards and Why sheet
- claims.override → Override button on Why sheet (calls intel.send_to_manual_review)
- All gated UI uses the CapabilityGate component or the useCapability hook. Do not bypass.

## Database
- Schema is intel, not stroom_engine.
- intel.entities unique constraint: (domain, entity_type, slug).
- intel.predicate_registry.value_type accepts: text, json, boolean, number, url. NOT jsonb.

## Load-Bearing Files (read before touching)
- apps/native/app/(tabs)/_layout.tsx — tab order and structure
- apps/native/app/_layout.tsx — Stack root, gesture config, providers, auth
- apps/native/src/components/ScreenTransition.tsx — fade-in animation used by all six tabs
- apps/native/src/components/ScreenHeader.tsx — unified header density
- apps/native/src/components/ScreenWatermark.tsx — helix mark
- apps/native/src/components/CapabilityGate.tsx — RBAC gating
- apps/native/src/hooks/useCapabilities.ts — capability resolution hook
- apps/native/src/lib/supabase.ts — Supabase client init

## Recently Fixed — DO NOT REGRESS
- 2026-04-08 Queue cold-load gap (~650pt dead space) — fix in app/(tabs)/queue.tsx on three scroll containers (FlatList, skeleton ScrollView, empty ScrollView). Anti-pattern: default iOS auto inset adjustment in tab context. MUST keep contentInsetAdjustmentBehavior="never" and automaticallyAdjustContentInsets={false}.
- 2026-04-08 RNCSlider crash on detail screens — fix is the Stepper component across source/claim/policies detail. Anti-pattern: do not reintroduce @react-native-community/slider.
- 2026-04-08 Watermark showed S instead of helix mark — fix in ScreenWatermark.tsx. Use the double-O helix SVG, never the letter S.
- 2026-04-08 Header density inconsistent across tabs — fix in ScreenHeader.tsx. All tabs must use ScreenHeader, not custom title blocks.
- 2026-04-08 Pulse vertical pills overflow — iOS Maps pattern: inactive=icon-only, active=expanded.
- 2026-04-08 Login screen unwanted wordmark — no STROOM LABS wordmark, no Intelligence Operations subtitle.

## Regressed and Pending Re-Fix
None as of 2026-04-09. STATE.md is the authority on active regressions; this section stays in sync with STATE.md's "Open Regressions" section. The two entries previously listed here (Ops tab nesting, missing swipe-back) were verified false alarms — see STATE.md "Open Regressions" for the contract-validation success log.

## Pre-Flight Checklist for Every Code Change
1. Read this file.
2. Read STATE.md for current shipped state.
3. If your change touches a Load-Bearing File, name the file in your response and confirm intent before proceeding.
4. If your change could affect a Recently Fixed item, name the item and confirm intent before proceeding.
5. After shipping, append a dated line to STATE.md describing what shipped.
6. After shipping and pushing, capture the new HEAD SHA with `git rev-parse HEAD`, then smoke-test each contract document you touched by curl-ing its SHA-pinned URL — for example `https://raw.githubusercontent.com/stroomlabs/stroom-command-center/<SHA>/apps/native/STATE.md` — and verifying the new content appears in the output. SHA-pinned URLs are guaranteed fresh because each commit SHA is a unique CDN path key, so GitHub's edge cache cannot serve a pre-push snapshot for that path. **Do NOT use `?cachebust=...` on `/main/` URLs — GitHub's raw CDN (Fastly) keys cache entries on URL path only, not on query string. The query param is silently ignored and returns stale bytes.** This was verified empirically on 2026-04-10: a `/main/?cachebust=$(date +%s%N)` URL returned pre-push content for >10 seconds after a successful push, while the SHA-pinned URL returned the new content immediately. If the SHA-pinned curl does not return the expected content, the push silently failed — halt and surface to the operator.
