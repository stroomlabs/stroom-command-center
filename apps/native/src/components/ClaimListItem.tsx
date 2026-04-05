import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EntityClaim } from '@stroom/supabase';
import { StatusBadge } from './StatusBadge';
import { titleCase } from './JsonView';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface ClaimListItemProps {
  claim: EntityClaim;
  onPress: () => void;
}

function ClaimListItemImpl({ claim, onPress }: ClaimListItemProps) {
  const predicate = formatPredicate(claim.predicate ?? 'unknown');
  const value = resolveDisplayValue(
    claim.value_jsonb,
    claim.object_entity?.canonical_name ?? null
  );
  const sourceName = claim.source?.source_name ?? 'Unknown';
  const trust = Number(claim.source?.trust_score ?? 0);
  const corrobs = claim.corroboration_score ?? 0;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${predicate} claim, status ${claim.status}. Open for details.`}
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.header}>
        <Text style={styles.predicate}>{predicate}</Text>
        <StatusBadge status={claim.status} />
      </View>
      <Text style={styles.value} numberOfLines={3}>
        {value}
      </Text>
      <View style={styles.footer}>
        <Text style={styles.source} numberOfLines={1}>
          {sourceName}
        </Text>
        <Text
          style={[
            styles.trust,
            trust >= 7.5 ? styles.trustHigh : styles.trustLow,
          ]}
        >
          {trust.toFixed(1)}
        </Text>
        {corrobs > 0 && (
          <View style={styles.corrobBadge}>
            <Ionicons name="layers-outline" size={11} color={colors.silver} />
            <Text style={styles.corrobCount}>{corrobs}</Text>
          </View>
        )}
        <Ionicons name="chevron-forward" size={14} color={colors.slate} />
      </View>
    </Pressable>
  );
}

function formatPredicate(pred: string): string {
  const last = pred.includes('.') ? pred.split('.').pop()! : pred;
  return last.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveDisplayValue(
  jsonb: Record<string, unknown> | null,
  objectName: string | null
): string {
  if (objectName) return objectName;
  if (!jsonb) return '—';
  if ('value' in jsonb && typeof jsonb.value !== 'object') return String(jsonb.value);
  if ('name' in jsonb) return String(jsonb.name);
  if ('range' in jsonb) return String(jsonb.range);
  if ('type' in jsonb) {
    const parts: string[] = [];
    if (jsonb.tier) parts.push(`T${jsonb.tier}`);
    parts.push(titleCase(String(jsonb.type)));
    return parts.join(' · ');
  }
  if ('data' in jsonb && Array.isArray(jsonb.data)) {
    const arr = jsonb.data as any[];
    if (arr.length === 0) return '(empty)';
    const first = arr[0];
    const name = first?.name || first?.driver || first?.team || Object.values(first)[0];
    return arr.length === 1 ? String(name) : `${name} + ${arr.length - 1} more`;
  }
  const entries = Object.entries(jsonb).slice(0, 2);
  return entries
    .map(([k, v]) => `${titleCase(k)}: ${String(v).slice(0, 30)}`)
    .join('\n');
}

const styles = StyleSheet.create({
  row: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.sm,
  },
  predicate: {
    fontFamily: fonts.mono.medium,
    fontSize: 11,
    color: colors.teal,
    flex: 1,
  },
  value: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.alabaster,
    lineHeight: 19,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  source: {
    fontFamily: fonts.archivo.regular,
    fontSize: 11,
    color: colors.silver,
    flex: 1,
  },
  trust: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  trustHigh: { color: colors.statusApprove },
  trustLow: { color: colors.statusPending },
  corrobBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  corrobCount: {
    fontFamily: fonts.mono.medium,
    fontSize: 11,
    color: colors.silver,
    fontVariant: ['tabular-nums'],
  },
});

// Memoized — entity detail renders up to 100 of these at a time.
export const ClaimListItem = React.memo(ClaimListItemImpl);
