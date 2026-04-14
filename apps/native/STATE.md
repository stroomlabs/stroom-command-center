# STATE — Stroom Command Center (Live Snapshot)
**Live, machine-readable snapshot of current shipped state. Auto-appended on every successful OTA. Hand-edited only when necessary.**

## Current Build
- TestFlight binary: 1.0.0 (2)
- Active OTA: production branch, group f163ad76-7aa0-4d3f-8c70-46ccb59ca7ec
- Active OTA contents: queue cold-load gap fix + slider stepper + diagnostic tints reverted
- Bundle ID: com.stroomlabs.commandcenter
- ASC App ID: 6761855616

## Local Commits Ahead of Origin
Main branch is in sync with origin/main as of 2026-04-11. Latest feature commit: 8a7328f (fix(rbac) phantom column cleanup across DR-036 surface).

## Last Verified On Device
- 2026-04-09 evening: Queue cold-load gap fixed and verified clean on physical iPhone.
- 2026-04-09 evening: Slider stepper verified on source/claim/policies detail screens.
- 2026-04-10 fix(32a) tab gate namespace migration (2cb35f6) — 5 gates in (tabs)/_layout.tsx renamed from action-level to {tab}.view, all 6 intel.operator_roles seeded with *.view keys, two-level rule documented in INVARIANTS.md. Verified on iPhone 17 Pro sim: all 6 tabs render in correct order (Pulse · Queue · Explore · Command · Projects · Ops), owner = 36 caps, /my-role catalog renders. OTA push pending.
- 2026-04-11 fix(rbac): phantom column cleanup across DR-036 surface (8a7328f). Verified on iPhone 17 Pro sim — Pulse, Ops, My Role, Queue all render clean, no PGRST errors. Gate 1 green: Operators roster loads, Kevin detail view renders with role.id identity comparisons working, isCallerOwner cascade confirmed. Gate 2 (Change Role sheet) deferred — single-owner self-demotion correctly blocked by UI safety rail, full mutation path verification waits on second operator invite. Data dependency: users.read capability seeded into owner JSONB manually (37 caps total) as post-commit follow-up; not yet in canonical seed migration — tracked as open tail. OTA push pending.

## Pending Verification
- DR-036 invite round-trip end-to-end — reachable via Ops tab → Operators card → Invite. Not yet smoke-tested on device.

## Open Regressions
None as of 2026-04-09. Earlier in the session two regressions were suspected (Ops nested under Projects, missing swipe-back gesture). Both were verified false alarms when the foundation contract preflight ran:
- Ops is a top-level Tabs.Screen, verified by grep against (tabs)/_layout.tsx
- fullScreenGestureEnabled: true is set on the Stack root in app/_layout.tsx (since batch 31a / commit 176a277)
- The "nested Ops" symptom was Command → More, which is a modal-presented Stack screen with its own dismiss gesture, not a tab routing bug
- The "missing swipe-back" symptom was iOS standard behavior on modal-presented screens, where fullScreenGestureEnabled does not apply

This is logged as a contract-validation success: STATE.md was written from operator perception without verification, and the preflight gates caught it before any code was wrongly modified.

## Known Gaps
- 2026-04-11 1:08 AM — Invite smoke test attempted (streegs99@me.com as Admin). HTTP 401 from operator-admin Edge Function. Not debugged. First task next session: inspect function secrets (SUPABASE_SERVICE_ROLE_KEY presence), verify auth flow, check Amendment A partial landing. Blocker for full Gate 2 verification.

## Server-Side State
- DR-037 auto-governance policy v1 is live.
- Sources auto_approve flag: 119 sources flagged.
- Operator kevin@stroomlabs.com has temporary password set; must rotate via in-app Change Password flow.
- Pulse counts (sanity-check in morning): 52,540 claims, 4,446 entities, 563 sources.

## Ship Log
- 2026-04-08 OTA group 008f29bd-b583-4021-8527-f030950cd911 — batch 31 + 32a + tab gate fix
- 2026-04-08 OTA group 677c39fb-e96a-4147-8274-e9769f67e482 — batch 32b + queue partial fix + header density + schema alignment
- 2026-04-09 OTA group f163ad76-7aa0-4d3f-8c70-46ccb59ca7ec — queue cold-load gap final fix + slider stepper
- 2026-04-14 chore(ios): added `"buildNumber": "1"` to apps/native/app.json ios section for TestFlight prep (97d8d57).
