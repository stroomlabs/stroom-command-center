import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../constants/brand';

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonValue[];
interface JsonObject {
  [key: string]: JsonValue;
}

type Change =
  | { kind: 'added'; key: string; next: JsonValue }
  | { kind: 'removed'; key: string; prev: JsonValue }
  | { kind: 'changed'; key: string; prev: JsonValue; next: JsonValue }
  | { kind: 'same'; key: string; value: JsonValue };

function diffObjects(
  prev: JsonObject | null,
  next: JsonObject | null
): Change[] {
  const a = prev ?? {};
  const b = next ?? {};
  const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
  const rows: Change[] = [];
  for (const key of Array.from(keys).sort()) {
    const inA = key in a;
    const inB = key in b;
    if (inA && !inB) {
      rows.push({ kind: 'removed', key, prev: a[key] });
    } else if (!inA && inB) {
      rows.push({ kind: 'added', key, next: b[key] });
    } else {
      const sameJson =
        JSON.stringify(a[key]) === JSON.stringify(b[key]);
      if (sameJson) {
        rows.push({ kind: 'same', key, value: a[key] });
      } else {
        rows.push({ kind: 'changed', key, prev: a[key], next: b[key] });
      }
    }
  }
  return rows;
}

function formatValue(v: JsonValue): string {
  if (v == null) return '—';
  if (typeof v === 'object') return JSON.stringify(v);
  return String(v);
}

interface ClaimDiffProps {
  prev: Record<string, unknown> | null;
  next: Record<string, unknown> | null;
  // Optional labels for the two sides — defaults to "Old" and "New".
  prevLabel?: string;
  nextLabel?: string;
}

// Inline diff of two value_jsonb objects. Added keys render green, removed
// keys red, changed keys amber with old → new, unchanged keys are dimmed.
// Same-row pairs only show the changed keys at the top so the diff stays
// compact on small screens.
export function ClaimDiff({
  prev,
  next,
  prevLabel = 'Old',
  nextLabel = 'New',
}: ClaimDiffProps) {
  const rows = React.useMemo(
    () => diffObjects(prev as any, next as any),
    [prev, next]
  );

  const changedRows = rows.filter((r) => r.kind !== 'same');
  const sameRows = rows.filter((r) => r.kind === 'same');
  const counts = {
    added: changedRows.filter((r) => r.kind === 'added').length,
    removed: changedRows.filter((r) => r.kind === 'removed').length,
    changed: changedRows.filter((r) => r.kind === 'changed').length,
  };

  if (changedRows.length === 0 && sameRows.length === 0) {
    return (
      <View style={styles.card}>
        <Text style={styles.emptyText}>No diff to show.</Text>
      </View>
    );
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.label}>DIFF</Text>
        <View style={styles.countsRow}>
          {counts.added > 0 && (
            <Text style={[styles.countPill, styles.countAdded]}>
              +{counts.added}
            </Text>
          )}
          {counts.changed > 0 && (
            <Text style={[styles.countPill, styles.countChanged]}>
              ~{counts.changed}
            </Text>
          )}
          {counts.removed > 0 && (
            <Text style={[styles.countPill, styles.countRemoved]}>
              −{counts.removed}
            </Text>
          )}
        </View>
      </View>

      <View style={styles.legendRow}>
        <Text style={styles.legendLabel}>{prevLabel}</Text>
        <Ionicons name="arrow-forward" size={10} color={colors.slate} />
        <Text style={styles.legendLabel}>{nextLabel}</Text>
      </View>

      {changedRows.length === 0 ? (
        <Text style={styles.emptyText}>All fields match.</Text>
      ) : (
        changedRows.map((r) => {
          if (r.kind === 'added') {
            return (
              <View key={r.key} style={[styles.row, styles.rowAdded]}>
                <Text style={[styles.rowKey, styles.keyAdded]}>+ {r.key}</Text>
                <Text style={[styles.rowValue, styles.valueAdded]}>
                  {formatValue(r.next)}
                </Text>
              </View>
            );
          }
          if (r.kind === 'removed') {
            return (
              <View key={r.key} style={[styles.row, styles.rowRemoved]}>
                <Text style={[styles.rowKey, styles.keyRemoved]}>
                  − {r.key}
                </Text>
                <Text
                  style={[
                    styles.rowValue,
                    styles.valueRemoved,
                    styles.strike,
                  ]}
                >
                  {formatValue(r.prev)}
                </Text>
              </View>
            );
          }
          // changed
          return (
            <View key={r.key} style={[styles.row, styles.rowChanged]}>
              <Text style={[styles.rowKey, styles.keyChanged]}>~ {r.key}</Text>
              <View style={styles.changedValues}>
                <Text
                  style={[styles.rowValue, styles.valueOld, styles.strike]}
                  numberOfLines={2}
                >
                  {formatValue(r.prev)}
                </Text>
                <Ionicons
                  name="arrow-forward"
                  size={10}
                  color={colors.statusPending}
                />
                <Text
                  style={[styles.rowValue, styles.valueNew]}
                  numberOfLines={2}
                >
                  {formatValue(r.next)}
                </Text>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  label: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
  },
  countsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  countPill: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  countAdded: {
    color: colors.statusApprove,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
  },
  countChanged: {
    color: colors.statusPending,
    backgroundColor: 'rgba(245, 158, 11, 0.12)',
  },
  countRemoved: {
    color: colors.statusReject,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  legendLabel: {
    fontFamily: fonts.mono.regular,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.8,
  },
  emptyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
  },
  row: {
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    gap: 2,
  },
  rowAdded: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderLeftWidth: 2,
    borderLeftColor: colors.statusApprove,
  },
  rowRemoved: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderLeftWidth: 2,
    borderLeftColor: colors.statusReject,
  },
  rowChanged: {
    backgroundColor: 'rgba(245, 158, 11, 0.08)',
    borderLeftWidth: 2,
    borderLeftColor: colors.statusPending,
  },
  rowKey: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
  },
  keyAdded: { color: colors.statusApprove },
  keyRemoved: { color: colors.statusReject },
  keyChanged: { color: colors.statusPending },
  rowValue: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.silver,
  },
  valueAdded: { color: colors.alabaster },
  valueRemoved: { color: colors.slate },
  valueOld: { color: colors.slate },
  valueNew: { color: colors.alabaster },
  strike: { textDecorationLine: 'line-through' },
  changedValues: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
});
