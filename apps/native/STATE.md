# STATE — Stroom Command Center (Live Snapshot)
**Live, machine-readable snapshot of current shipped state. Auto-appended on every successful OTA. Hand-edited only when necessary.**

## Current Build
- TestFlight binary: 1.0.0 (2)
- Active OTA: production branch, group f163ad76-7aa0-4d3f-8c70-46ccb59ca7ec
- Active OTA contents: queue cold-load gap fix + slider stepper + diagnostic tints reverted
- Bundle ID: com.stroomlabs.commandcenter
- ASC App ID: 6761855616

## Local Commits Ahead of Origin
Main branch is ahead of origin/main with all 2026-04-08 work plus the 2026-04-09 INVARIANTS contract.

## Last Verified On Device
- 2026-04-09 evening: Queue cold-load gap fixed and verified clean on physical iPhone.
- 2026-04-09 evening: Slider stepper verified on source/claim/policies detail screens.

## Pending Verification
- DR-036 invite round-trip end-to-end. Operators screen path obstructed by Ops-under-Projects regression.

## Open Regressions (blocking tomorrow's first work block)
1. Ops tab nested under Projects instead of top-level sibling.
2. Full-screen right-swipe-back gesture removed from Stack screens.

## Server-Side State
- DR-037 auto-governance policy v1 is live.
- Sources auto_approve flag: 119 sources flagged.
- Operator kevin@stroomlabs.com has temporary password set; must rotate via in-app Change Password flow.
- Pulse counts (sanity-check in morning): 52,540 claims, 4,446 entities, 563 sources.

## Ship Log
- 2026-04-08 OTA group 008f29bd-b583-4021-8527-f030950cd911 — batch 31 + 32a + tab gate fix
- 2026-04-08 OTA group 677c39fb-e96a-4147-8274-e9769f67e482 — batch 32b + queue partial fix + header density + schema alignment
- 2026-04-09 OTA group f163ad76-7aa0-4d3f-8c70-46ccb59ca7ec — queue cold-load gap final fix + slider stepper
