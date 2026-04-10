# Pre-Flight (MANDATORY — read before any code change)

Before modifying any file in this repository, you MUST:

1. Read apps/native/INVARIANTS.md in full.
2. Read apps/native/STATE.md in full.
3. If your proposed change would touch a Load-Bearing File listed in INVARIANTS.md, surface the file name to the operator and confirm intent before writing any code.
4. If your proposed change could regress a Recently Fixed item listed in INVARIANTS.md, surface the item to the operator and confirm intent before writing any code.
5. After successfully shipping a change, append a dated line to apps/native/STATE.md describing what shipped, then immediately stage, commit, and push STATE.md to origin/main with a chore(state) commit message. Do not batch STATE.md updates with feature commits and do not defer the push. The GitHub raw URL of STATE.md is the canonical source of truth read by all chat sessions and any delay creates drift. If the push fails for any reason, halt and surface the failure to the operator before continuing.

This pre-flight is non-negotiable. If you cannot read INVARIANTS.md or STATE.md for any reason, halt and surface the failure to the operator.

---

# Stroom Command Center

Operator-facing mobile app for the StroomHelix intelligence graph. Lets the operator monitor live Pulse metrics, review and batch-approve claims in a governance Queue, Explore entities and predicates, query the graph through a Claude-powered Command chat, and run graph health / audit / research workflows from an Ops tab.

## Stack

- **Expo Router monorepo** — `apps/native` is the Expo app (SDK 52, RN 0.76, Hermes, new architecture enabled). Shared workspaces live in `packages/` (`@stroom/types`, `@stroom/supabase`).
- **Supabase** — project id `xazalbajuvqbqgkgyagf` (`https://xazalbajuvqbqgkgyagf.supabase.co`). All domain tables live in the **`intel`** schema; the client is scoped to that schema so hook queries reference tables unqualified.
- **Claude** — Command chat hits the `command-chat` Supabase Edge Function which wraps the Anthropic API, persists threads to `intel.command_sessions`, and streams responses back as SSE.
- **Deep-link scheme** — `stroom-command://` declared in `app.json`. Routes: `/claim/:id`, `/entity/:id`, `/source/:id`, `/predicate/:key`, `/queue`, `/pulse` (top-level redirect into the tab group), `/coverage`, `/audit`, `/research`, `/sources`, `/digest`.

## Layout

```
apps/native/
  app/
    (tabs)/             5-tab bottom bar: Pulse · Queue · Explore · Command · Ops
      _layout.tsx       Tab config; tabBarBadge bound to pulse.queueDepth,
                        light-impact haptic on every tabPress
      index.tsx         Pulse — header+LIVE, 4 primary metrics, 3 secondary
                        metrics, status breakdown, last-updated. Nothing else.
      queue.tsx         Governance queue: search bar, status filter chips,
                        long-press badge → batch approve, swipe-right approve
      explore.tsx       Entity search + predicate explorer segment
      command.tsx       Claude chat — streaming, session history sheet,
                        inline entity links, glass action sheet on long-press
      ops.tsx           Ops dashboard (wrench-outline icon): Graph Health,
                        Audit Trail, Research Queue, Coverage Gaps, Sources
                        cards. Header "N issues detected" + gear → /more.
    entity/[id].tsx     Entity detail + connections graph footer
    claim/[id].tsx      Claim detail + source lineage + sticky action bar
                        (Reject · Edit · Approve)
    claim/edit/[id].tsx Recursive per-field JSONB editor (nested objects,
                        expandable arrays, boolean pills, number keyboards)
    source/[id].tsx     Source detail + claim list
    predicate/[key].tsx Claims by predicate
    sources.tsx         All sources sorted by trust score
    coverage.tsx        Coverage gaps (entities with < 3 claims)
    audit.tsx           Audit trail
    research.tsx        Research queue
    digest.tsx          Daily digest (hourly bar chart)
    notification-prefs.tsx  Notification toggles → operator_profiles.preferences
    more.tsx            Settings, Quick Stats, sign-out (stack route, not a tab)
    pulse.tsx           Deep-link alias → redirects to (tabs) root
    login.tsx           Password auth + biometric gate
    _layout.tsx         Root Stack + GestureHandlerRootView + AuthProvider
                        + BrandAlertProvider + RouteGuard + ErrorBoundary
                        + OfflineBanner
  src/
    hooks/              usePulseData, useGraphHealth, useQueueClaims,
                        useExploreSearch, usePredicatesList, useEntityDetail,
                        useClaimDetail, useCommandChat, useSessionHistory,
                        useEntityNameMap, useAuditLog, useResearchQueue,
                        usePushNotifications, useNotificationPrefs,
                        useGovernanceStats, useTopEntities, useCoverageGaps,
                        useSourceDetail, useSourcesList, useDailyDigest
    components/         PulseMetric, ClaimCard, ClaimListItem, EntityRow,
                        StatusBadge, GlassCard, GlowSpot, Skeleton,
                        RejectSheet, ActionSheet, SessionHistorySheet,
                        BrandAlert, OfflineBanner, ErrorBoundary, JsonView
    constants/brand.ts  Brand tokens (colors, fonts, spacing, radius, gradient)
    lib/
      supabase.ts       Local Supabase client (schema: 'intel')
      auth.tsx          AuthProvider (password + Face ID gate)

packages/
  types/src/index.ts    Domain types (Claim, Entity, Source, Predicate,
                        AuditLogEntry, ResearchQueueItem, …)
  supabase/src/index.ts Shared fetchers (fetchQueueClaims, batchApproveClaims,
                        updateClaim, fetchConnectionsForEntity, fetchDailyDigest,
                        fetchGraphHealth, …) + SUPABASE_URL/SUPABASE_ANON_KEY
```

## Brand system

Brand tokens are centralized in `apps/native/src/constants/brand.ts`. **Never hard-code colors, fonts, spacing, or radii — always import from brand.**

- **Typography**
  - **Archivo** — all UI text. Weights: `regular` / `medium` / `semibold` / `bold` / `black` via `fonts.archivo.*`.
  - **IBM Plex Mono** — numeric displays, timestamps, code blocks, chips, technical labels. Weights: `regular` / `medium` / `semibold` via `fonts.mono.*`.
  - Both families ship as TTF under `apps/native/assets/fonts/` and are loaded in `app/_layout.tsx`. IBM Plex Mono TTFs **must** come from `raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/` — `fonts.google.com` downloads and GitHub HTML views produce corrupt files that trigger `CTFontManagerError 104`.
- **Color**
  - Labs teal `#00A19B` (`colors.teal`) is the single accent — pressable affordances, active states, brand marks, live indicators, atmospheric glows.
  - Background gradient is near-black → obsidian (`gradient.background = ['#000000', '#0A0D0F']`). Every screen uses `<LinearGradient>` with these stops.
  - Surfaces: `surfaceElevated` (`#111416`) for cards/rows, `surfaceCard` (`#0D1012`) for nested panels, `glassBorder` (`rgba(255,255,255,0.06)`) for hairlines.
  - Text: `alabaster` (primary), `silver` (body), `slate` (metadata/disabled).
  - Status: `statusApprove` (green), `statusReject` (red), `statusPending` (amber), `statusInfo` (blue).
- **Spacing / radius / motion** also live in `brand.ts` — use `spacing.xs…xxl`, `radius.sm…full`, `motion.*`.
- **Atmospheric glows** — every main screen places 1–2 `<GlowSpot>` components behind the content (opacity 0.04–0.08, large circle, low-opacity teal or status-tinted). Subtle, not neon.

## Key conventions

- **Supabase client scope.** `apps/native/src/lib/supabase.ts` creates the client with `db: { schema: 'intel' }`, so hook queries reference tables unqualified (`supabase.from('claims')`, `'audit_log'`, `'research_queue'`, …). Do **not** prefix with `intel.` in JS code.
- **Auth.** Password auth via `AuthProvider` in `src/lib/auth.tsx`; session persisted through AsyncStorage with auto-refresh tied to `AppState`. Face ID gate runs post-login before any authenticated route renders. No magic links, no OAuth.
- **Pulse data.** The Pulse screen calls the `get_command_pulse` Postgres RPC. Single call returns `total_claims`, `total_entities`, `total_sources`, `queue_depth`, `correction_rate`, `research_active`, `budget_spend_usd`, `claims_today`, `latest_claim_at`, `status_breakdown`. Do not re-derive via N counting queries. `usePulseData` owns this call and is also consumed by `(tabs)/_layout.tsx` to drive the Queue tab badge and by `ops.tsx` for the "issues detected" header.
- **Graph health.** Separate `get_graph_health` RPC returns `stale_sources`, `orphaned_entities`, `uncorroborated_claims`, `single_source_claims`, `low_confidence_claims`, `avg_trust_score`, `sources_failing`. `useGraphHealth` owns the call; the Ops tab applies warn/alert bands against Pulse totals (stale ≥5%, orphan ≥2%, uncorrob ≥30%, single-source ≥40%, low-conf ≥15%, avg trust < 7, failing > 0).
- **Command chat.** `useCommandChat` POSTs `{ messages, session_id, stream: true }` to `${SUPABASE_URL}/functions/v1/command-chat`. XHR with `onprogress` + `parseStreamChunk` handles both SSE frames (`data: {delta|content|text|…}`) and plain text streams; each chunk updates the trailing assistant message on screen. Final fallback accepts `{ content, session_id, usage }` JSON envelope. Session id lives in `AsyncStorage.stroom.command.session_id` and is rotated by the refresh button in the Command header. Auth headers: `Authorization: Bearer <access_token>` + `apikey: <anon>`.
- **Realtime.** Broadcast channels `topic:claims`, `topic:audit`, `topic:research` are published from the corresponding `intel.*_broadcast()` triggers. Hooks subscribe and simply re-fetch on broadcast — no delta merging.
- **Navigation.** Cross-tab navigation uses `router.push('/(tabs)/queue' as any)` etc. Typed routes regenerate on next `expo start`, so `as any` casts are fine for newly added routes until Expo's type codegen catches up.
- **Alerts & sheets.** All popups flow through `BrandAlertProvider` (glassmorphic replacement for `Alert.alert`) or one of the four custom bottom sheets (`ActionSheet`, `RejectSheet`, `SessionHistorySheet`, `BrandAlert`). **Never** use `Alert.alert` or `ActionSheetIOS` — they render native chrome that breaks the dark theme. `BrandAlertProvider` is mounted inside `AuthProvider` in the root layout.
- **JSONB rendering.** `<JsonView value={…}>` is the canonical human-readable renderer for any JSONB value: Title Case keys, nested objects indented behind a teal rail, arrays of objects as stacked mini-cards, scalar type detection (URL → tappable teal link, ISO date → locale string, boolean → "Yes/No"). Used in claim detail; reusable anywhere raw JSON would otherwise leak.
- **Claim edits.** `claim/edit/[id].tsx` uses a recursive per-field editor with scalar/object/array type detection. Raw JSON mode is an explicit "Advanced" opt-in — never the default. `updateClaim(client, id, patch)` in `@stroom/supabase` writes the update *and* a corresponding `audit_log` entry with `action_type: 'update'`.
- **Markdown in Command responses.** Assistant bubbles use the in-house parser in `command.tsx` (`parseMarkdown` + `renderInline`): supports `# ## ###` headings, `**bold**`, `` `inline code` ``, fenced code blocks, `-`/`*` bullet lists, and inline entity links (names from the graph become tappable teal spans routing to `/entity/:id`). No third-party markdown lib.

## Hooks to beware of

- **Vercel plugin false positives.** This repo has a session startup hook that injects Vercel/Next.js skill suggestions based on path patterns (`app/**`, `src/components/**/*.tsx`, `supabase/**`). This is **Expo Router and Supabase**, not Next.js App Router, Next.js 16, or Vercel storage — ignore `"use client"` directive warnings, `next-cache-components` / `vercel-storage` prompts, and `params is async in Next.js 16` recommendations when working in this repo. Expo Router's `useLocalSearchParams` is synchronous.
- **`git` bash `cd`.** The Bash tool's shell state persists CWD across calls, so `cd apps/native/... && curl ...` will leave subsequent tool calls stuck in that directory. Prefer absolute paths or `git -C <repo>` to avoid.
- **Ionicons naming.** `wrench-outline` does not exist in Ionicons; the canonical wrench is `construct-outline`. Similar gotchas for `hammer-outline` (use `build-outline`).

## Session log

- **Session 1** — Scaffold, brand system, Pulse screen, login.
- **Session 2** — Live Pulse + Queue, password auth, intel schema wired, push-notify deployed.
- **Session 3** — Explore tab, entity detail, claim detail with source lineage.
- **Session 4** — Command chat (Claude AI), Audit Trail, Research Queue, IBM Plex Mono font fix. Polish: tappable Pulse metrics, Queue tab badge, empty-state pull-to-refresh, streaming chat, markdown rendering, session history, inline entity links, glassmorphic ActionSheet, tab-press haptics, swipe-to-approve, Pulse last-updated timestamp, Ask Command from entity, predicate explorer, daily digest, notification prefs, batch approve, offline banner, source detail, sources list, Queue search, Queue filter chips, Explore type chips, Graph Health card, skeleton loaders, error boundary, Coverage Gaps, claim detail sticky action bar + edit screen, recursive field editor, BrandAlert migration, atmospheric glows, **5-tab restructure (Ops tab)**, streaming `stream: true` flag, deep-link routes, CLAUDE.md refresh.
