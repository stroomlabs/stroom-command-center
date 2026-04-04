import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GlassCard } from './GlassCard';
import { colors, fonts, spacing } from '../constants/brand';

interface PulseMetricProps {
  label: string;
  value: string | number;
  accent?: string;
  prefix?: string;
  suffix?: string;
  compact?: boolean;
}

export function PulseMetric({
  label,
  value,
  accent = colors.teal,
  prefix,
  suffix,
  compact = false,
}: PulseMetricProps) {
  const displayValue = typeof value === 'number' ? formatNumber(value) : value;

  return (
    <GlassCard style={compact ? styles.compact : styles.card}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.valueRow}>
        {prefix && <Text style={[styles.prefix, { color: accent }]}>{prefix}</Text>}
        <Text style={[styles.value, { color: accent }]}>{displayValue}</Text>
        {suffix && <Text style={[styles.suffix, { color: colors.slate }]}>{suffix}</Text>}
      </View>
    </GlassCard>
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
