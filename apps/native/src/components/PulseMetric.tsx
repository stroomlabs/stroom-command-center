import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { haptics } from '../lib/haptics';
import { GlassCard } from './GlassCard';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface PulseMetricProps {
  label: string;
  value: string | number;
  accent?: string;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
  onPress?: () => void;
  animate?: boolean;
  flashKey?: number;
  // Colored left-edge accent bar (3px) for visual identity in grids.
  borderAccent?: string;
}

// Interpolates a numeric value from its previous render to the current one
// over 500ms, driven by rAF via setInterval. Returns the formatted string
// to display on every frame.
function useAnimatedCount(value: number, enabled: boolean): number {
  const [display, setDisplay] = React.useState(value);
  const prevRef = React.useRef(value);

  React.useEffect(() => {
    if (!enabled || value === prevRef.current) {
      prevRef.current = value;
      setDisplay(value);
      return;
    }
    const start = prevRef.current;
    const end = value;
    const duration = 500;
    const startedAt = Date.now();
    let raf = 0;
    const tick = () => {
      const elapsed = Date.now() - startedAt;
      const t = Math.min(1, elapsed / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      const next = Math.round(start + (end - start) * eased);
      setDisplay(next);
      if (t < 1) raf = requestAnimationFrame(tick) as unknown as number;
      else prevRef.current = end;
    };
    raf = requestAnimationFrame(tick) as unknown as number;
    return () => cancelAnimationFrame(raf);
  }, [value, enabled]);

  return display;
}

export function PulseMetric({
  label,
  value,
  accent = colors.teal,
  prefix,
  suffix,
  compact = false,
  onPress,
  animate = false,
  flashKey = 0,
  borderAccent,
}: PulseMetricProps) {
  const isNumeric = typeof value === 'number';
  const numericValue = isNumeric ? value : parseFloat(String(value));
  const animatedNumber = useAnimatedCount(
    Number.isNaN(numericValue) ? 0 : numericValue,
    animate && isNumeric
  );
  const shownNumber = animate && isNumeric ? animatedNumber : numericValue;
  const displayValue = isNumeric
    ? formatNumber(shownNumber)
    : (value as string);

  // Muted treatment when the metric is zero-ish so empty states recede.
  const isZero = !Number.isNaN(numericValue) && numericValue === 0;
  const effectiveAccent = isZero ? colors.slate : accent;

  // Border flash — runs when `flashKey` bumps. borderProgress ramps 0→1→0
  // over ~900ms and drives an absolute-position overlay border so we don't
  // have to animate GlassCard's own border directly.
  const borderProgress = useSharedValue(0);
  const firstFlashRef = React.useRef(true);
  React.useEffect(() => {
    if (firstFlashRef.current) {
      firstFlashRef.current = false;
      return;
    }
    borderProgress.value = withSequence(
      withTiming(1, { duration: 180, easing: Easing.out(Easing.ease) }),
      withTiming(0, { duration: 720, easing: Easing.in(Easing.ease) })
    );
  }, [flashKey, borderProgress]);
  const flashOverlayStyle = useAnimatedStyle(() => ({
    opacity: borderProgress.value,
  }));

  // Teal radial glow — pulses 0 → 0.12 → 0 over 400ms on tap.
  const glowOpacity = useSharedValue(0);
  const glowStyle = useAnimatedStyle(() => ({
    opacity: glowOpacity.value,
  }));

  const cardStyle = compact ? styles.compact : styles.card;
  const labelStyle = compact ? styles.labelCompact : styles.label;
  const valueStyle = compact ? styles.valueCompact : styles.value;
  const prefixStyle = compact ? styles.prefixCompact : styles.prefix;
  const suffixStyle = compact ? styles.suffixCompact : styles.suffix;

  const a11yLabel = `${label}: ${prefix ?? ''}${displayValue}${suffix ? ' ' + suffix : ''}`;

  const inner = (
    <View
      style={styles.cardWrap}
      accessible={!onPress}
      accessibilityRole={!onPress ? 'text' : undefined}
      accessibilityLabel={!onPress ? a11yLabel : undefined}
    >
      <GlassCard
        style={[
          onPress ? styles.innerFill : cardStyle,
          !compact && styles.cardPadding,
          compact && styles.compactCard,
          isZero && styles.mutedCard,
          borderAccent
            ? { borderLeftWidth: 3, borderLeftColor: borderAccent }
            : undefined,
        ]}
      >
        {compact ? (
          <View style={styles.compactRow}>
            <Text
              numberOfLines={1}
              style={[labelStyle, isZero && { color: 'rgba(86, 95, 100, 0.7)' }]}
            >
              {label}
            </Text>
            <Text
              numberOfLines={1}
              ellipsizeMode="clip"
              style={[valueStyle, styles.compactValueInline, { color: effectiveAccent }]}
            >
              {prefix ?? ''}
              {displayValue}
              {suffix ? ` ${suffix}` : ''}
            </Text>
          </View>
        ) : (
          <>
            <Text style={labelStyle} numberOfLines={1}>{label}</Text>
            <View style={styles.valueRow}>
              {prefix && (
                <Text style={[prefixStyle, { color: effectiveAccent }]}>{prefix}</Text>
              )}
              <Text
                style={[valueStyle, { color: effectiveAccent }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {displayValue}
              </Text>
              {suffix && (
                <Text style={[suffixStyle, { color: colors.slate }]} numberOfLines={1}>{suffix}</Text>
              )}
            </View>
          </>
        )}
      </GlassCard>
      <Animated.View
        pointerEvents="none"
        style={[styles.flashOverlay, flashOverlayStyle]}
      />
      {/* Teal radial glow — pulses on tap for tappable metrics */}
      {onPress && (
        <Animated.View pointerEvents="none" style={[styles.glowOverlay, glowStyle]} />
      )}
    </View>
  );

  if (!onPress) return inner;

  const handlePress = () => {
    haptics.tap.light();
    // Teal radial glow: 0 → 0.12 → 0 over 400ms
    glowOpacity.value = withSequence(
      withTiming(0.12, { duration: 200, easing: Easing.out(Easing.ease) }),
      withTiming(0, { duration: 200, easing: Easing.in(Easing.ease) })
    );
    // Border flash
    borderProgress.value = withSequence(
      withTiming(1, { duration: 150, easing: Easing.out(Easing.ease) }),
      withTiming(0, { duration: 600, easing: Easing.in(Easing.ease) })
    );
    onPress();
  };

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${prefix ?? ''}${displayValue}${suffix ? ' ' + suffix : ''}`}
      onPress={handlePress}
      style={({ pressed }) => [cardStyle, pressed && styles.pressed]}
    >
      {inner}
    </Pressable>
  );
}

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
  },
  cardPadding: {
    padding: 16,
  },
  compact: {
    flex: 1,
    minWidth: '30%',
  },
  cardWrap: {
    flex: 1,
    position: 'relative',
  },
  flashOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
  },
  glowOverlay: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: radius.lg,
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 24,
  },
  compactCard: {
    paddingVertical: 0,
    paddingHorizontal: 12,
    height: 40,
    minHeight: 40,
    justifyContent: 'center',
  },
  compactRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  compactValueInline: {
    flexShrink: 0,
    includeFontPadding: false,
  },
  mutedCard: {
    opacity: 0.45,
  },
  innerFill: {
    width: '100%',
  },
  pressed: {
    opacity: 0.75,
    transform: [{ scale: 0.97 }],
  },
  label: {
    fontFamily: fonts.archivo.bold,
    fontSize: 11,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  labelCompact: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  prefix: {
    fontFamily: fonts.mono.medium,
    fontSize: 14,
    marginRight: 2,
  },
  prefixCompact: {
    fontFamily: fonts.mono.medium,
    fontSize: 11,
    marginRight: 1,
  },
  value: {
    fontFamily: fonts.archivo.black,
    fontSize: 32,
    fontVariant: ['tabular-nums'],
  },
  valueCompact: {
    fontFamily: fonts.mono.semibold,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  suffix: {
    fontFamily: fonts.mono.regular,
    fontSize: 14,
    marginLeft: 4,
  },
  suffixCompact: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    marginLeft: 3,
  },
});
