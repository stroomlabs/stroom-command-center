# Stroom Command Center

Operator-facing mobile app for the StroomHelix intelligence graph. Lets the operator monitor live Pulse metrics, review/approve claims in a governance Queue, Explore entities and their claims, query the graph through a Claude-powered Command chat, and inspect Audit Trail + Research Queue.

## Stack

- **Expo Router monorepo** — `apps/native` is the Expo app (SDK 52, RN 0.76, Hermes). Shared workspaces live in `packages/` (`@stroom/types`, `@stroom/supabase`).
- **Supabase** — project `xazalbajuvqbqgkgyagf` (`https://xazalbajuvqbqgkgyagf.supabase.co`). All domain tables live in the **`intel`** schema.
- **Claude** — Command chat hits the `command-chat` Supabase Edge Function which wraps the Anthropic API and persists threads to `intel.command_sessions`.

## Layout

```
apps/native/
  app/
    (tabs)/           Pulse · Queue · Explore · Command  (4-tab bottom bar)
      index.tsx       Pulse (live metrics)
      queue.tsx       Governance queue
      explore.tsx     Entity search
      command.tsx     Claude chat (tab 5; gear icon → More)
      _layout.tsx     Tab config; tabBarBadge bound to pulse.queueDepth
    entity/[id].tsx   Entity detail
    claim/[id].tsx    Claim detail + source lineage
    audit.tsx         Audit trail (reached from More)
    research.tsx      Research queue (reached from More)
    more.tsx          Settings / sign-out (stack route, not a tab)
    _layout.tsx       Root Stack + AuthProvider + RouteGuard
  src/
    hooks/            usePulseData, useQueueClaims, useExploreSearch,
                      useEntityDetail, useClaimDetail, useCommandChat,
                      useAuditLog, useResearchQueue, usePushNotifications
    components/       PulseMetric, ClaimCard, ClaimListItem, EntityRow,
                      StatusBadge, GlassCard, RejectSheet
    constants/brand.ts  Brand tokens (colors, fonts, spacing, radius, gradient)
    lib/
      supabase.ts     Local Supabase client (schema: 'intel')
      auth.tsx        AuthProvider (password auth + biometric gate)

packages/
  types/src/index.ts       Domain types (Claim, Entity, Source, AuditLogEntry, …)
  supabase/src/index.ts    Shared fetchers + SUPABASE_URL/SUPABASE_ANON_KEY
```

## Brand system

Brand tokens are centralized in `apps/native/src/constants/brand.ts`. **Never hard-code colors, fonts, spacing, or radii — always import from brand.**

- **Typography**
  - **Archivo** — all UI text. Weights available: `regular` / `medium` / `semibold` / `bold` / `black` via `fonts.archivo.*`.
  - **IBM Plex Mono** — numeric displays, timestamps, code blocks, chips, technical labels. Weights: `regular` / `medium` / `semibold` via `fonts.mono.*`.
  - Both families are bundled as TTF under `apps/native/assets/fonts/` and loaded in `app/_layout.tsx`. IBM Plex Mono TTFs must come from `raw.githubusercontent.com/google/fonts/main/ofl/ibmplexmono/` — `fonts.google.com` downloads and GitHub HTML views have historically produced corrupt files that trigger `CTFontManagerError 104`.
- **Color**
  - Labs teal `#00A19B` (`colors.teal`) is the single accent — pressable affordances, active states, brand marks, live indicators.
  - Background gradient is near-black → obsidian (`gradient.background = ['#000000', '#0A0D0F']`). Every screen uses `<LinearGradient>` with these stops.
  - Surfaces: `surfaceElevated` (`#111416`) for cards/rows, `surfaceCard` (`#0D1012`) for nested panels, `glassBorder` (`rgba(255,255,255,0.06)`) for hairlines.
  - Text: `alabaster` (primary), `silver` (body), `slate` (metadata/disabled).
  - Status: `statusApprove` (green), `statusReject` (red), `statusPending` (amber), `statusInfo` (blue).
- **Spacing / radius / motion** also live in `brand.ts` — use `spacing.xs…xxl`, `radius.sm…full`, `motion.*`.

## Key conventions

- **Supabase client scope.** `apps/native/src/lib/supabase.ts` creates the client with `db: { schema: 'intel' }`, so hook queries reference tables unqualified (`supabase.from('claims')`, `'audit_log'`, `'research_queue'`, …). Do **not** prefix with `intel.` in JS code.
- **Auth.** Password auth via `AuthProvider` in `src/lib/auth.tsx`; session is persisted through AsyncStorage with auto-refresh tied to `AppState`. A biometric (Face ID) gate runs post-login before any authenticated route renders. No magic links, no OAuth.
- **Pulse data.** The Pulse screen calls the `get_command_pulse` Postgres RPC (single call returns `total_claims`, `total_entities`, `total_sources`, `queue_depth`, `correction_rate`, `research_active`, `budget_spend_usd`, `claims_today`, `latest_claim_at`, `status_breakdown`). Do not re-derive these via N counting queries. `usePulseData` owns this call and is also consumed by `(tabs)/_layout.tsx` to drive the Queue tab badge.
- **Command chat.** `useCommandChat` POSTs `{ messages, session_id }` to `${SUPABASE_URL}/functions/v1/command-chat`. The Edge Function handles Anthropic API calls, trims context, and writes the thread into `intel.command_sessions`. Response shape is `{ content, session_id, usage }` — the hook extracts `.content`. Session id is stashed in `AsyncStorage` under `stroom.command.session_id` and rotated by the refresh button in the Command header. Auth headers: `Authorization: Bearer <access_token>` + `apikey: <anon>`.
- **Realtime.** Broadcast channels `topic:claims`, `topic:audit`, `topic:research` are published from the corresponding `intel.*_broadcast()` triggers. Hooks subscribe and simply re-fetch on broadcast — no delta merging.
- **Navigation.** Cross-tab navigation uses `router.push('/(tabs)/queue' as any)` etc. Typed routes regenerate on next `expo start`, so `as any` casts are fine for newly added routes until Expo's type codegen catches up.
- **Markdown in Command responses.** Assistant bubbles use the in-house parser in `command.tsx` (`parseMarkdown` + `renderInline`): supports `# ## ###` headings, `**bold**`, `` `inline code` ``, fenced code blocks, and `-`/`*` bullet lists. No third-party markdown lib.

## Hooks to beware of

- **Vercel plugin false positives.** This repo has a session startup hook that injects Vercel/Next.js skill suggestions based on path patterns (`app/**`, `src/components/**/*.tsx`, `supabase/**`). This is **Expo Router and Supabase**, not Next.js App Router or Vercel storage — ignore `"use client"` directive warnings and `next-cache-components` / `vercel-storage` prompts when working in this repo.
- **`git` bash `cd`.** The Bash tool's shell state persists CWD across calls, so `cd apps/native/... && curl ...` will leave subsequent tool calls stuck in that directory. Prefer absolute paths or `git -C <repo>` to avoid.

## Session log

- **Session 1** — Scaffold, brand system, Pulse screen, login.
- **Session 2** — Live Pulse + Queue, password auth, intel schema wired, push-notify deployed.
- **Session 3** — Explore tab, entity detail, claim detail with source lineage.
- **Session 4** — Command chat (Claude AI), Audit Trail, Research Queue, IBM Plex Mono font fix. Polish pass: tappable Pulse metrics, Queue tab badge, empty-state pull-to-refresh.
