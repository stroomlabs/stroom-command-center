import React from 'react';
import { View, StyleSheet, Image, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useCurrentVertical } from '../hooks/useCurrentVertical';

// Universal full-screen background. Mounts at the root of every screen as
// the single source of truth for atmosphere. Renders absolutely-positioned
// with zIndex -1 and pointer-events disabled so it sits fully behind every
// other element without intercepting touches.
//
// Composition (back → front):
//   1. 5-stop diagonal gradient (the cinematic base)
//   2. Silver atmospheric wash (bottom-left to top-right)
//   3. Apex flare (warm secondary wash)
//   4. Noise grain (4% opacity, tiled 128x128 PNG)
//
// Static — no breathing glows, no animation, no radial pulses. The
// background is the canvas; the foreground does the moving.
//
// The deepest gradient stop is shifted 2% toward the active vertical's
// accent color so each vertical feels distinct without breaking the
// overall unity. Tint reads from the `vertical` prop, falling back to
// the AsyncStorage `stroom.pulse_vertical` key.

const VERTICAL_TINT: Record<string, string> = {
  motorsports: '#00A19B',
  cruise: '#06B6D4',
  theme_parks: '#22C55E',
  nfl: '#6366F1',
  nba: '#6366F1',
  intelligence: '#C8CCCE',
  general: '#C8CCCE',
};

let noiseSource: any = null;
try {
  noiseSource = require('../../assets/noise-tile.png');
} catch {
  noiseSource = null;
}

interface ScreenCanvasProps {
  // Optional override. When omitted, reads from AsyncStorage via
  // useCurrentVertical hook so the canvas auto-syncs to whatever vertical
  // the operator selected from Pulse.
  vertical?: string | null;
}

export function ScreenCanvas({ vertical }: ScreenCanvasProps = {}) {
  const stored = useCurrentVertical();
  const active = vertical ?? stored;
  const tint = active ? VERTICAL_TINT[active] : null;

  // useWindowDimensions gives explicit pixel width/height that updates on
  // rotation. Image with resizeMode="repeat" only tiles reliably when given
  // concrete dimensions — StyleSheet.absoluteFill (right/bottom: 0) was
  // causing the noise PNG to render once at native size in the top-left
  // corner instead of tiling. Explicit width/height fixes the seam.
  const { width, height } = useWindowDimensions();

  // Mix the deepest stop ('#050506') 2% toward the vertical accent.
  // Stays barely perceptible — visible only side-by-side.
  const deepStop = mixHex('#050506', tint, 0.02);

  return (
    <View pointerEvents="none" style={styles.canvas}>
      {/* Layer 1 — 5-stop diagonal base */}
      <LinearGradient
        colors={['#050507', '#09090c', '#0c0c0f', '#08080b', deepStop]}
        locations={[0, 0.35, 0.55, 0.8, 1.0]}
        start={{ x: 0.1, y: 0 }}
        end={{ x: 0.9, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Layer 2 — silver atmospheric wash */}
      <LinearGradient
        colors={['rgba(200,204,206,0.02)', 'transparent']}
        start={{ x: 0.3, y: 0.75 }}
        end={{ x: 0.7, y: 0.3 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Layer 3 — apex flare */}
      <LinearGradient
        colors={['rgba(200,204,206,0.04)', 'transparent']}
        start={{ x: 0.7, y: 0.2 }}
        end={{ x: 0.3, y: 0.8 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Layer 4 — grain texture (explicit dimensions so resizeMode="repeat"
          tiles the 128x128 PNG seamlessly across the full screen) */}
      {noiseSource && (
        <Image
          source={noiseSource}
          resizeMode="repeat"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width,
            height,
            opacity: 0.04,
          }}
        />
      )}
    </View>
  );
}

// Lerp two hex colors in RGB. `accent` may be null (returns base
// unchanged). `ratio` 0 = base, 1 = accent.
function mixHex(base: string, accent: string | null, ratio: number): string {
  if (!accent) return base;
  const b = parseHex(base);
  const a = parseHex(accent);
  if (!b || !a) return base;
  const r = Math.round(b.r * (1 - ratio) + a.r * ratio);
  const g = Math.round(b.g * (1 - ratio) + a.g * ratio);
  const bl = Math.round(b.b * (1 - ratio) + a.b * ratio);
  return `#${toHex(r)}${toHex(g)}${toHex(bl)}`;
}

function parseHex(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  const full =
    clean.length === 3
      ? clean.split('').map((c) => c + c).join('')
      : clean;
  if (full.length !== 6) return null;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) return null;
  return { r, g, b };
}

function toHex(n: number): string {
  return Math.max(0, Math.min(255, n)).toString(16).padStart(2, '0');
}

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
});
