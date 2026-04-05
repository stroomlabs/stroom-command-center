import React from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { colors } from '../constants/brand';

// Soft atmospheric glow — a large circular View with very low-opacity fill,
// layered behind content to evoke a radial gradient without pulling in a
// gradient library. Stack multiple with decreasing opacity for a softer
// fall-off. Defaults target Stroom Labs teal.
export function GlowSpot({
  size = 400,
  color,
  opacity = 0.06,
  top,
  left,
  right,
  bottom,
  style,
}: {
  size?: number;
  color?: string;
  opacity?: number;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const base = color ?? colors.teal;
  // Convert hex to rgba at the requested opacity
  const bg = toRgba(base, opacity);
  return (
    <View
      pointerEvents="none"
      style={[
        styles.spot,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: bg,
          top,
          left,
          right,
          bottom,
        },
        style,
      ]}
    />
  );
}

function toRgba(color: string, alpha: number): string {
  if (color.startsWith('rgba') || color.startsWith('rgb')) {
    // assume already has transparency or user knows what they're doing
    return color;
  }
  const hex = color.replace('#', '');
  const full = hex.length === 3
    ? hex.split('').map((c) => c + c).join('')
    : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  spot: {
    position: 'absolute',
    // Large blur-like fall-off approximation — the low alpha + huge radius
    // plus the black background is enough to read as a soft glow.
  },
});
