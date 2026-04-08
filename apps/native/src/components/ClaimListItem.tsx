import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EntityClaim } from '@stroom/supabase';
import { StatusBadge } from './StatusBadge';
import { PressScale } from './PressScale';
import { resolveClaimDisplayValue } from '../lib/resolveDisplayValue';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface ClaimListItemProps {
  claim: EntityClaim;
  onPress: () => void;
}

function ClaimListItemImpl({ claim, onPress }: ClaimListItemProps) {
  const predicate = formatPredicate(claim.predicate ?? 'unknown');
  const value = resolveClaimDisplayValue(
    claim.value_jsonb,
    claim.object_entity?.canonical_name ?? null,
    claim.predicate
  );
  const sourceName = claim.source?.source_name ?? 'Unknown';
  const trust = Number(claim.source?.trust_score ?? 0);
  const corrobs = claim.corroboration_score ?? 0;

  return (
    <PressScale
      accessibilityRole="button"
      accessibilityLabel={`${predicate} claim, status ${claim.status}. Open for details.`}
      onPress={onPress}
      style={styles.row}
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
    </PressScale>
  );
}

function formatPredicate(pred: string): string {
  const last = pred.includes('.') ? pred.split('.').pop()! : pred;
  return last.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
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
