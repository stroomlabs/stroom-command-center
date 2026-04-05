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

// Soft atmospheric glow — a large circular View with very low-opacity fill,
// layered behind content to evoke a radial gradient without pulling in a
// gradient library. Stack multiple with decreasing opacity for a softer
// fall-off. Defaults target Stroom Labs teal.
//
// Setting `breathe` runs a slow 8-second opacity oscillation between
// `opacity * 0.67` and `opacity` — atmospheric, not flashy.
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
}) {
  const base = color ?? colors.teal;
  const bg = toRgba(base, 1); // set alpha via animated opacity

  const phase = useSharedValue(1);
  useEffect(() => {
    if (breathe) {
      // 8s full cycle: 4s up, 4s down, repeating
      phase.value = withRepeat(
        withTiming(0, { duration: 4000, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      phase.value = 1;
    }
  }, [breathe, phase]);

  const animatedStyle = useAnimatedStyle(() => {
    // phase oscillates 1 → 0 → 1 over 8s.
    // Breathe range: [opacity * 0.5, opacity].  Pass opacity=0.08 to land
    // on the spec'd 0.04 ↔ 0.08 envelope.
    const scalar = breathe ? 0.5 + phase.value * 0.5 : 1;
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
