import React, { useEffect } from 'react';
import { StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../constants/brand';

// Soft atmospheric glow — a large circular View with very low-opacity fill
// layered behind content to evoke a radial gradient without a gradient lib.
//
// Setting `breathe` runs a slow sine-wave opacity oscillation between
// `opacity * 0.375` (≈0.03 at default 0.08) and `opacity` over `cycleDuration`.
// Use two GlowSpots at slightly different `cycleDuration` values (e.g. 4000
// and 5000) and offset positions to create a layered never-syncing effect.
export function GlowSpot({
  size = 400,
  color,
  opacity = 0.06,
  top,
  left,
  right,
  bottom,
  style,
  breathe = false,
  cycleDuration = 4000,
}: {
  size?: number;
  color?: string;
  opacity?: number;
  top?: number;
  left?: number;
  right?: number;
  bottom?: number;
  style?: StyleProp<ViewStyle>;
  breathe?: boolean;
  // Full cycle in ms (half up, half down). Defaults to 4s.
  cycleDuration?: number;
}) {
  const base = color ?? colors.teal;
  const bg = toRgba(base, 1);

  const phase = useSharedValue(1);
  useEffect(() => {
    if (breathe) {
      // Sine easing: Easing.inOut(Easing.sin) gives an organic ease at both
      // ends — like a slow breath rather than a mechanical ping-pong.
      phase.value = withRepeat(
        withTiming(0, {
          duration: cycleDuration / 2,
          easing: Easing.inOut(Easing.sin),
        }),
        -1,
        true
      );
    } else {
      phase.value = 1;
    }
  }, [breathe, cycleDuration, phase]);

  const animatedStyle = useAnimatedStyle(() => {
    // phase oscillates 1 → 0 → 1. Scale to breathe range:
    //   opacity * 0.375 ↔ opacity  (at default 0.08 this is ~0.03 ↔ 0.08)
    const scalar = breathe ? 0.375 + phase.value * 0.625 : 1;
    return { opacity: opacity * scalar };
  });

  return (
    <Animated.View
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
        animatedStyle,
      ]}
    />
  );
}

function toRgba(color: string, alpha: number): string {
  if (color.startsWith('rgba') || color.startsWith('rgb')) return color;
  const hex = color.replace('#', '');
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

const styles = StyleSheet.create({
  spot: {
    position: 'absolute',
  },
});
