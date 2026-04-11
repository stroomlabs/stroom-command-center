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

## Capability Namespace — Two-Level Rule (DR-036 remediation, 2026-04-10)

There are two levels of capability gating. Every gated UI surface MUST use exactly one level; mixing levels on the same surface is forbidden.

**Level 1 — Tab visibility (`{tab}.view`)**
- Coarse-grained. Controls whether a bottom-bar tab is rendered at all.
- One gate per tab, keyed by `<tab>.view`. Canonical set: `queue.view`, `explore.view`, `command.view`, `projects.view`, `ops.view`. Pulse has no gate and is always visible.
- Enforced in `apps/native/app/(tabs)/_layout.tsx` via `hideIfDenied(cap)` spread on each `Tabs.Screen` options block. The route stays registered (deep links still work for an allow-listed operator reaching it via a direct path), but the tab disappears from the visible bar when denied.
- **Fail-open while loading.** A tab is hidden ONLY when capabilities have finished loading, a real role row is present, AND `hasCapability` returns false. Capability loading must never cause a tab to flash and disappear.

**Level 2 — Action gates (`<domain>.<verb>`)**
- Fine-grained. Controls individual privileged actions within a screen.
- Canonical set (non-exhaustive): `claims.approve`, `claims.reject`, `claims.override`, `entities.edit`, `governance.run_sweep`, `admin.manage_users`. Additions allowed; must be documented here when added.
- Enforced via the `CapabilityGate` component or the `useCapabilities().hasCapability` hook.
- **Fail-closed.** Privileged UI must not render until capabilities confirm the action is permitted. An unconfirmed/loading snapshot is treated as denied.

**Rules:**
1. Every tab has a level-1 gate (except Pulse). Every privileged action has a level-2 gate.
2. A level-1 cap and a level-2 cap are independent keys in the role JSONB. Granting `queue.view` does NOT imply `claims.approve` — they are set separately per role. This is how a "read-only observer" role (e.g. `viewer_plus`) can see the Queue tab but still be blocked from Approve/Reject/Override buttons inside it.
3. When adding a new tab, seed all 6 roles with the new `{tab}.view` key in the **same** migration that ships the tab code. Code and data must land together.
4. When adding a new action gate, update this file with the new key and its enforcement point before merging.
5. Never use `select('*')`-style wildcard assumptions to "absorb" a missing cap key — always set the key explicitly to `true` or `false` in the role JSONB so denial is auditable.

**Canonical role × tab matrix (batch 32a remediation, 2026-04-10):**

| Role         | queue.view | explore.view | command.view | projects.view | ops.view |
|--------------|:---:|:---:|:---:|:---:|:---:|
| owner        | ✓ | ✓ | ✓ | ✓ | ✓ |
| admin        | ✓ | ✓ | ✓ | ✓ | ✗ |
| curator      | ✓ | ✓ | ✗ | ✗ | ✗ |
| viewer_plus  | ✓ | ✓ | ✗ | ✗ | ✗ |
| viewer       | ✗ | ✓ | ✗ | ✗ | ✗ |
| guest        | ✗ | ✗ | ✗ | ✗ | ✗ |

Note: `curator` and `viewer_plus` share identical tab-view caps by design. The distinction lives at level 2 — `curator` has `claims.approve`/`claims.reject`, `viewer_plus` does not. Tab visibility alone does not imply ability to act.

Any future change to this matrix must be applied to `intel.operator_roles.capabilities` via a migration and reflected here in the same PR.

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
- 2026-04-10 Tab bar collapsed to Pulse only after capabilities loaded — `_layout.tsx` gate keys (`claims.review`, `entities.read`, `command.use`, `projects.read`, `admin.settings`) did not match the owner role's seeded capabilities JSONB. Root cause: batch 32a shipped the gate code without a matching data migration to seed the tab-level cap keys. Fix: introduced the two-level `{tab}.view` namespace (see Capability Namespace section above), migrated all 6 roles to include the new keys, renamed all 5 tab gates in `_layout.tsx` from action-level to `{tab}.view`. Anti-pattern: shipping capability-gated UI without a same-batch data migration that seeds the keys in all existing roles. MUST keep `_layout.tsx` gates on the `*.view` namespace and seed those keys in every role row.

## Regressed and Pending Re-Fix
None as of 2026-04-09. STATE.md is the authority on active regressions; this section stays in sync with STATE.md's "Open Regressions" section. The two entries previously listed here (Ops tab nesting, missing swipe-back) were verified false alarms — see STATE.md "Open Regressions" for the contract-validation success log.

## Pre-Flight Checklist for Every Code Change
1. Read this file.
2. Read STATE.md for current shipped state.
3. If your change touches a Load-Bearing File, name the file in your response and confirm intent before proceeding.
4. If your change could affect a Recently Fixed item, name the item and confirm intent before proceeding.
5. After shipping, append a dated line to STATE.md describing what shipped.
6. After shipping and pushing, capture the new HEAD SHA with `git rev-parse HEAD`, then smoke-test each contract document you touched by curl-ing its SHA-pinned URL — for example `https://raw.githubusercontent.com/stroomlabs/stroom-command-center/<SHA>/apps/native/STATE.md` — and verifying the new content appears in the output. SHA-pinned URLs are guaranteed fresh because each commit SHA is a unique CDN path key, so GitHub's edge cache cannot serve a pre-push snapshot for that path. **Do NOT use `?cachebust=...` on `/main/` URLs — GitHub's raw CDN (Fastly) keys cache entries on URL path only, not on query string. The query param is silently ignored and returns stale bytes.** This was verified empirically on 2026-04-10: a `/main/?cachebust=$(date +%s%N)` URL returned pre-push content for >10 seconds after a successful push, while the SHA-pinned URL returned the new content immediately. If the SHA-pinned curl does not return the expected content, the push silently failed — halt and surface to the operator.
