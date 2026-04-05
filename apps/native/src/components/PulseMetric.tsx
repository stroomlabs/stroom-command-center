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

  const cardStyle = compact ? styles.compact : styles.card;
  const inner = (
    <GlassCard style={onPress ? styles.innerFill : cardStyle}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        {prefix && <Text style={[styles.prefix, { color: accent }]}>{prefix}</Text>}
        <Text style={[styles.value, { color: accent }]}>{displayValue}</Text>
        {suffix && <Text style={[styles.suffix, { color: colors.slate }]}>{suffix}</Text>}
      </View>
    </GlassCard>
  );

  if (!onPress) return inner;

  return (
    <Pressable
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
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  prefix: {
    fontFamily: fonts.mono.medium,
    fontSize: 14,
    marginRight: 2,
  },
  value: {
    fontFamily: fonts.mono.semibold,
    fontSize: 28,
    // tabular-nums via fontVariant
    fontVariant: ['tabular-nums'],
  },
  suffix: {
    fontFamily: fonts.mono.regular,
    fontSize: 14,
    marginLeft: 4,
  },
});
