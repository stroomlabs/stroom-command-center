import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../lib/haptics';
import { colors, fonts } from '../constants/brand';

// Horizontal stepper control. Replaces @react-native-community/slider so
// the same adjustment UI works on OTA bundles without a native rebuild —
// the slider is a native module (<RNCSlider>) that crashes the view on
// any binary that doesn't include it.
//
// Behavior:
//   - Tap minus/plus: step by `step` once, haptic + onChange + onCommit
//   - Long-press minus/plus: rapid-step every 120ms while held, haptic
//     on each step, single onCommit when the user releases
//   - Value clamped to [min, max] inclusive
//   - Stepping snaps to a step-multiple to avoid 0.1 + 0.1 + 0.1 = 0.3000…001 drift
//
// `onChange` is the live-update callback (every tick). `onCommit` is the
// "finger lifted" hook — use it to push to the server, matching the old
// slider's onSlidingComplete semantics.

const RAPID_INTERVAL_MS = 120;
const LONG_PRESS_DELAY_MS = 350;

interface StepperProps {
  value: number;
  min?: number;
  max?: number;
  step?: number;
  onChange: (next: number) => void;
  onCommit?: (next: number) => void;
  disabled?: boolean;
}

const clamp = (n: number, lo: number, hi: number) =>
  Math.min(Math.max(n, lo), hi);

const snap = (n: number, step: number): number => {
  if (step <= 0) return n;
  // Round to step boundary, then re-round to sensible decimal precision
  // so 0.1 stepping produces 0.1 / 0.2 / 0.3 (not 0.30000000000000004).
  const snapped = Math.round(n / step) * step;
  const decimals = step >= 1 ? 0 : step >= 0.1 ? 1 : 2;
  return Number(snapped.toFixed(decimals));
};

export function Stepper({
  value,
  min = 0,
  max = 10,
  step = 0.1,
  onChange,
  onCommit,
  disabled = false,
}: StepperProps) {
  // Keep a ref of the current value so the rapid-step interval closure
  // always reads the latest — plain closures would capture a stale value.
  const valueRef = useRef(value);
  valueRef.current = value;

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Guarantee the interval is torn down if the component unmounts mid-hold.
  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const precision = step >= 1 ? 0 : 1;
  const displayValue = (value ?? 0).toFixed(precision);

  const applyDelta = (delta: number): boolean => {
    const next = snap(clamp(valueRef.current + delta, min, max), step);
    if (next === valueRef.current) return false;
    haptics.tap.light();
    onChange(next);
    return true;
  };

  const handleTap = (delta: number) => {
    if (disabled) return;
    if (applyDelta(delta)) {
      // Commit immediately on a single tap — matches slider onSlidingComplete.
      onCommit?.(valueRef.current);
    }
  };

  const startRepeat = (delta: number) => {
    if (disabled) return;
    stopRepeat();
    intervalRef.current = setInterval(() => {
      applyDelta(delta);
    }, RAPID_INTERVAL_MS);
  };

  const stopRepeat = () => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
      // Single commit at the end of the hold — don't spam the server every
      // 120ms while the finger is down.
      onCommit?.(valueRef.current);
    }
  };

  const minusDisabled = disabled || value <= min;
  const plusDisabled = disabled || value >= max;

  return (
    <View style={styles.row}>
      <Pressable
        onPress={() => handleTap(-step)}
        onLongPress={() => startRepeat(-step)}
        onPressOut={stopRepeat}
        delayLongPress={LONG_PRESS_DELAY_MS}
        disabled={minusDisabled}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Decrease"
        style={({ pressed }) => [
          styles.btn,
          pressed && !minusDisabled && styles.btnPressed,
          minusDisabled && styles.btnDisabled,
        ]}
      >
        <Ionicons name="remove-outline" size={24} color={colors.teal} />
      </Pressable>

      <View style={styles.valueWrap}>
        <Text style={styles.value} allowFontScaling={false}>
          {displayValue}
        </Text>
      </View>

      <Pressable
        onPress={() => handleTap(step)}
        onLongPress={() => startRepeat(step)}
        onPressOut={stopRepeat}
        delayLongPress={LONG_PRESS_DELAY_MS}
        disabled={plusDisabled}
        hitSlop={6}
        accessibilityRole="button"
        accessibilityLabel="Increase"
        style={({ pressed }) => [
          styles.btn,
          pressed && !plusDisabled && styles.btnPressed,
          plusDisabled && styles.btnDisabled,
        ]}
      >
        <Ionicons name="add-outline" size={24} color={colors.teal} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  btn: {
    width: 44,
    height: 44,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    backgroundColor: 'rgba(0, 161, 155, 0.08)',
  },
  btnPressed: {
    opacity: 0.75,
    transform: [{ scale: 0.96 }],
  },
  btnDisabled: {
    opacity: 0.3,
  },
  valueWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: fonts.archivo.black,
    fontSize: 24,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.4,
  },
});
