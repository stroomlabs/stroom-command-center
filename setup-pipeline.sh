#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$HOME/Downloads/stroom-command-center"
cd "$PROJECT_DIR"

echo "═══════════════════════════════════════════"
echo "  Stroom Command Center — Pipeline Setup"
echo "═══════════════════════════════════════════"

# ── Step 1: GitHub CLI check ──
if ! command -v gh &>/dev/null; then
  echo "→ Installing GitHub CLI..."
  brew install gh
fi

if ! gh auth status &>/dev/null 2>&1; then
  echo "→ Authenticating GitHub CLI..."
  gh auth login --web
fi

# ── Step 2: Git init + commit ──
echo "→ Initializing git..."
git init -q 2>/dev/null || true

# .gitignore already exists from build
git add -A
git commit -m "Session 2: live Pulse + Queue, password auth, intel schema wired, push-notify deployed" --allow-empty -q

# ── Step 3: Create GitHub repo ──
echo "→ Creating GitHub repo..."
if gh repo view stroomlabs/stroom-command-center &>/dev/null 2>&1; then
  echo "  Repo already exists, setting remote..."
  git remote remove origin 2>/dev/null || true
  git remote add origin https://github.com/stroomlabs/stroom-command-center.git
else
  gh repo create stroomlabs/stroom-command-center --private --source=. --push
fi

git push -u origin main 2>/dev/null || git push -u origin main --force

# ── Step 4: Expo login + EAS configure ──
echo "→ Configuring EAS..."
if ! npx expo whoami &>/dev/null 2>&1; then
  echo "  Need Expo login..."
  npx expo login
fi

cd apps/native
npx eas build:configure --platform ios 2>/dev/null || true

# Create update channel
npx eas channel:create preview 2>/dev/null || echo "  Channel 'preview' already exists"
cd "$PROJECT_DIR"

# ── Step 5: GitHub Action ──
echo "→ Installing GitHub Action..."
mkdir -p .github/workflows
cp "$PROJECT_DIR/.github/workflows/ota-update.yml" .github/workflows/ 2>/dev/null || true

# ── Step 6: Set EXPO_TOKEN secret ──
echo ""
echo "═══════════════════════════════════════════"
echo "  MANUAL STEP REQUIRED"
echo "═══════════════════════════════════════════"
echo ""
echo "  1. Go to https://expo.dev/accounts/[you]/settings/access-tokens"
echo "  2. Create a new token named 'github-actions'"
echo "  3. Run: gh secret set EXPO_TOKEN"
echo "     Then paste the token when prompted"
echo ""

# ── Step 7: Claude Code ──
echo "→ Checking Claude Code..."
if ! command -v claude &>/dev/null; then
  echo "→ Installing Claude Code..."
  npm install -g @anthropic-ai/claude-code
fi

echo ""
echo "═══════════════════════════════════════════"
echo "  DONE. Pipeline:"
echo ""
echo "  Dev:    claude  (opens Claude Code in project)"
echo "  Test:   cd apps/native && npx expo start --ios"
echo "  Deploy: git push  (auto-triggers OTA update)"
echo "═══════════════════════════════════════════"
echo ""
echo "  To start Claude Code now:"
echo "  cd $PROJECT_DIR && claude"
echo ""
