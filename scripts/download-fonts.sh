#!/usr/bin/env bash
# Download brand fonts for Stroom Command Center
# Run from repo root: bash scripts/download-fonts.sh

set -euo pipefail

FONT_DIR="apps/native/assets/fonts"
mkdir -p "$FONT_DIR"

echo "→ Downloading Archivo..."
ARCHIVO_BASE="https://github.com/omnibus-type/Archivo/raw/master/fonts/ttf"
curl -sL "$ARCHIVO_BASE/Archivo-Regular.ttf" -o "$FONT_DIR/Archivo-Regular.ttf"
curl -sL "$ARCHIVO_BASE/Archivo-Medium.ttf" -o "$FONT_DIR/Archivo-Medium.ttf"
curl -sL "$ARCHIVO_BASE/Archivo-SemiBold.ttf" -o "$FONT_DIR/Archivo-SemiBold.ttf"
curl -sL "$ARCHIVO_BASE/Archivo-Bold.ttf" -o "$FONT_DIR/Archivo-Bold.ttf"
curl -sL "$ARCHIVO_BASE/Archivo-Black.ttf" -o "$FONT_DIR/Archivo-Black.ttf"

echo "→ Downloading IBM Plex Mono..."
PLEX_BASE="https://github.com/IBM/plex/raw/master/IBM-Plex-Mono/fonts/complete/ttf"
curl -sL "$PLEX_BASE/IBMPlexMono-Regular.ttf" -o "$FONT_DIR/IBMPlexMono-Regular.ttf"
curl -sL "$PLEX_BASE/IBMPlexMono-Medium.ttf" -o "$FONT_DIR/IBMPlexMono-Medium.ttf"
curl -sL "$PLEX_BASE/IBMPlexMono-SemiBold.ttf" -o "$FONT_DIR/IBMPlexMono-SemiBold.ttf"

echo "✓ All fonts downloaded to $FONT_DIR"
ls -la "$FONT_DIR"
