# Stroom Command Center

Expo (React Native) intelligence operations app for the StroomHelix knowledge graph. Turborepo monorepo with shared Supabase client and TypeScript types.

## Structure

```
stroom-command-center/
├── apps/
│   ├── native/          ← Expo app (this session)
│   └── web/             ← Next.js 15 (Session 4)
├── packages/
│   ├── supabase/        ← Shared Supabase client + RPC wrappers
│   └── types/           ← Shared TypeScript types
```

## Prerequisites

- Node.js 20+
- Apple Developer Program ($99/year) for TestFlight
- Expo account (`npx expo login`)
- Supabase Auth: set `app_metadata: {"role": "operator"}` on your user in the Supabase dashboard

## Setup

```bash
# Clone and install
git clone <repo-url>
cd stroom-command-center
npm install

# Download brand fonts
bash scripts/download-fonts.sh

# Start Expo dev server
npm run native
```

## Supabase Auth Setup

1. Go to Supabase Dashboard → Authentication → Users
2. Find your user (kevin@stroomlabs.com)
3. Edit user → set `app_metadata` to: `{"role": "operator"}`
4. Go to Authentication → URL Configuration
5. Add `stroom-command://auth/callback` to Redirect URLs

## Deep Linking

The app uses the `stroom-command://` scheme for magic link auth callbacks.
Configured in `app.json` under `expo.scheme`.

## Screens

| Tab     | Status    | Description                              |
|---------|-----------|------------------------------------------|
| Pulse   | ✅ Built  | Live dashboard — claims, entities, queue |
| Queue   | ✅ Built  | Governance — approve/reject claims       |
| Explore | 🔲 S3    | Entity & claim browser                   |
| More    | ✅ Built  | Settings, sign out                       |

## Realtime

Uses Supabase Realtime Broadcast triggers deployed in Session 1:
- `claims_realtime_trigger` → topic:claims
- `audit_realtime_trigger` → topic:audit
- `research_realtime_trigger` → topic:research
- `sources_realtime_trigger` → topic:sources

## Deploy to TestFlight

```bash
# First time: configure EAS
cd apps/native
npx eas build:configure

# Build for iOS TestFlight
npx eas build --platform ios --profile preview

# Submit to TestFlight
npx eas submit --platform ios
```

## Brand System

- Archivo (headings/UI) + IBM Plex Mono (data values)
- 145° gradient: #000000 → #0A0D0F
- Accent: #00A19B (Stroom Teal)
- All numeric values use tabular-nums
- Max animation duration: 800ms
