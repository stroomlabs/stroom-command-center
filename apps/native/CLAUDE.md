# Pre-Flight (MANDATORY — read before any code change)

Before modifying any file in this repository, you MUST:

1. Read apps/native/INVARIANTS.md in full.
2. Read apps/native/STATE.md in full.
3. If your proposed change would touch a Load-Bearing File listed in INVARIANTS.md, surface the file name to the operator and confirm intent before writing any code.
4. If your proposed change could regress a Recently Fixed item listed in INVARIANTS.md, surface the item to the operator and confirm intent before writing any code.
5. After successfully shipping a change, append a dated line to apps/native/STATE.md describing what shipped, then immediately stage, commit, and push STATE.md to origin/main with a chore(state) commit message. Do not batch STATE.md updates with feature commits and do not defer the push. The GitHub raw URL of STATE.md is the canonical source of truth read by all chat sessions and any delay creates drift. If the push fails for any reason, halt and surface the failure to the operator before continuing.

This pre-flight is non-negotiable. If you cannot read INVARIANTS.md or STATE.md for any reason, halt and surface the failure to the operator.
