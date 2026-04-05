import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { GlassCard } from './GlassCard';
import { colors, fonts, spacing } from '../constants/brand';

interface PulseMetricProps {
  label: string;
  value: string | number;
  accent?: string;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
  onPress?: () => void;
}

export function PulseMetric({
  label,
  value,
  accent = colors.teal,
  prefix,
  suffix,
  compact = false,
  onPress,
}: PulseMetricProps) {
  const displayValue = typeof value === 'number' ? formatNumber(value) : value;

  // Muted treatment when the metric is zero-ish so empty states recede
  // instead of shouting for attention.
  const numericValue = typeof value === 'number' ? value : parseFloat(String(value));
  const isZero = !Number.isNaN(numericValue) && numericValue === 0;
  const effectiveAccent = isZero ? colors.slate : accent;

  const cardStyle = compact ? styles.compact : styles.card;
  const labelStyle = compact ? styles.labelCompact : styles.label;
  const valueStyle = compact ? styles.valueCompact : styles.value;
  const prefixStyle = compact ? styles.prefixCompact : styles.prefix;
  const suffixStyle = compact ? styles.suffixCompact : styles.suffix;

  const inner = (
    <GlassCard
      style={[
        onPress ? styles.innerFill : cardStyle,
        compact && styles.compactCard,
        isZero && styles.mutedCard,
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
          <Text style={labelStyle}>{label}</Text>
          <View style={styles.valueRow}>
            {prefix && (
              <Text style={[prefixStyle, { color: effectiveAccent }]}>{prefix}</Text>
            )}
            <Text style={[valueStyle, { color: effectiveAccent }]}>{displayValue}</Text>
            {suffix && (
              <Text style={[suffixStyle, { color: colors.slate }]}>{suffix}</Text>
            )}
          </View>
        </>
      )}
    </GlassCard>
  );

  if (!onPress) return inner;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}: ${prefix ?? ''}${displayValue}${suffix ? ' ' + suffix : ''}`}
      onPress={onPress}
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
    minWidth: '45%',
  },
  compact: {
    flex: 1,
    minWidth: '30%',
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
    transform: [{ scale: 0.98 }],
  },
  label: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
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
    fontFamily: fonts.mono.semibold,
    fontSize: 28,
    // tabular-nums via fontVariant
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
