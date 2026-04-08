import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import type { Source } from '@stroom/types';
import { useSourcesList } from '../src/hooks/useSourcesList';
import { ScreenCanvas } from '../src/components/ScreenCanvas';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

// ── Sort + filter models ──

type SortKey = 'trust' | 'claims' | 'name' | 'auto';
type FilterKey = 'all' | 'auto' | 'manual' | 'blocked';

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'trust', label: 'Trust' },
  { key: 'claims', label: 'Claims' },
  { key: 'name', label: 'Name' },
  { key: 'auto', label: 'Auto' },
];

const FILTER_OPTIONS: { key: FilterKey; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'auto', label: 'Auto-Approve' },
  { key: 'manual', label: 'Manual' },
  { key: 'blocked', label: 'Blocked' },
];

const SORT_LABEL: Record<SortKey, string> = {
  trust: 'sorted by trust',
  claims: 'sorted by claims',
  name: 'sorted by name',
  auto: 'sorted by auto-approve',
};

const FILTER_LABEL: Record<FilterKey, string | null> = {
  all: null,
  auto: 'auto-approve',
  manual: 'manual',
  blocked: 'blocked',
};

// For the "Auto" sort, we insert a divider item between the auto-approved
// group and the rest so the two groups render visually distinct.
type ListItem =
  | { kind: 'source'; source: Source }
  | { kind: 'divider'; label: string };

export default function SourcesListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sources, claimCounts, loading, error, refresh } = useSourcesList();
  const [refreshing, setRefreshing] = useState(false);
  const [sort, setSort] = useState<SortKey>('trust');
  const [filter, setFilter] = useState<FilterKey>('all');

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const handleSelectSort = useCallback((key: SortKey) => {
    Haptics.selectionAsync();
    setSort(key);
  }, []);

  const handleSelectFilter = useCallback((key: FilterKey) => {
    Haptics.selectionAsync();
    setFilter(key);
  }, []);

  // Apply filter first, then sort. For the "Auto" sort we split into two
  // groups and weave a divider between them.
  const listItems = useMemo<ListItem[]>(() => {
    const filtered = sources.filter((s) => {
      switch (filter) {
        case 'auto':
          return s.auto_approve === true;
        case 'manual':
          return !s.auto_approve;
        case 'blocked':
          return s.canary_status === 'blocked';
        case 'all':
        default:
          return true;
      }
    });

    const byTrust = (a: Source, b: Source) =>
      Number(b.trust_score) - Number(a.trust_score);
    const byClaims = (a: Source, b: Source) =>
      (claimCounts.get(b.id) ?? 0) - (claimCounts.get(a.id) ?? 0);
    const byName = (a: Source, b: Source) =>
      (a.source_name ?? '').localeCompare(b.source_name ?? '');

    if (sort === 'trust') {
      return filtered.sort(byTrust).map((s) => ({ kind: 'source', source: s }));
    }
    if (sort === 'claims') {
      return filtered.sort(byClaims).map((s) => ({ kind: 'source', source: s }));
    }
    if (sort === 'name') {
      return filtered.sort(byName).map((s) => ({ kind: 'source', source: s }));
    }
    // sort === 'auto' — group auto-approved first, then the rest; within each
    // group fall back to trust desc.
    const auto = filtered.filter((s) => s.auto_approve === true).sort(byTrust);
    const rest = filtered.filter((s) => s.auto_approve !== true).sort(byTrust);

    const items: ListItem[] = [];
    if (auto.length > 0) {
      items.push({ kind: 'divider', label: `AUTO-APPROVE · ${auto.length}` });
      for (const s of auto) items.push({ kind: 'source', source: s });
    }
    if (rest.length > 0) {
      items.push({ kind: 'divider', label: `MANUAL REVIEW · ${rest.length}` });
      for (const s of rest) items.push({ kind: 'source', source: s });
    }
    return items;
  }, [sources, claimCounts, sort, filter]);

  const visibleCount = listItems.filter((i) => i.kind === 'source').length;

  // Subtitle composition: "14 sources · auto-approve · sorted by claims"
  const subtitleParts = [
    `${visibleCount} ${visibleCount === 1 ? 'source' : 'sources'}`,
    FILTER_LABEL[filter],
    SORT_LABEL[sort],
  ].filter(Boolean) as string[];
  const subtitle = subtitleParts.join(' · ');

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to Pulse"
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Pulse</Text>
        </Pressable>
        <Text style={styles.title}>Sources</Text>
        <Text style={styles.subtitle}>{subtitle}</Text>

        {/* Sort segment bar */}
        <View style={styles.sortBar}>
          {SORT_OPTIONS.map((opt) => {
            const active = sort === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => handleSelectSort(opt.key)}
                style={[styles.sortBtn, active && styles.sortBtnActive]}
                accessibilityRole="button"
                accessibilityLabel={`Sort by ${opt.label}`}
                accessibilityState={{ selected: active }}
              >
                <Text
                  style={[styles.sortBtnText, active && styles.sortBtnTextActive]}
                >
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Filter chips — horizontally scrollable */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {FILTER_OPTIONS.map((opt) => {
            const active = filter === opt.key;
            return (
              <Pressable
                key={opt.key}
                onPress={() => handleSelectFilter(opt.key)}
                style={[styles.chip, active && styles.chipActive]}
                accessibilityRole="button"
                accessibilityLabel={`Filter ${opt.label}`}
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.chipText, active && styles.chipTextActive]}>
                  {opt.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {loading && sources.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error && sources.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : visibleCount === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="cube-outline" size={32} color={colors.slate} />
          <Text style={styles.emptyText}>
            {sources.length === 0 ? 'No sources yet' : 'No sources match this filter'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={listItems}
          keyExtractor={(item, idx) =>
            item.kind === 'source' ? item.source.id : `divider-${idx}`
          }
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
          renderItem={({ item }) => {
            if (item.kind === 'divider') {
              return (
                <View style={styles.sectionDivider}>
                  <Text style={styles.sectionDividerText}>{item.label}</Text>
                </View>
              );
            }
            return (
              <SourceRow
                source={item.source}
                claimCount={claimCounts.get(item.source.id) ?? 0}
                onPress={() =>
                  router.push({
                    pathname: '/source/[id]',
                    params: { id: item.source.id },
                  } as any)
                }
              />
            );
          }}
        />
      )}
    </View>
  );
}

// Left border triage: teal for auto-approve, amber for blocked canary,
// subtle gray otherwise. Mirrors the pattern Queue claim cards use so the
// list reads at a glance.
function triageBorderColor(source: Source): string {
  if (source.auto_approve === true) return colors.teal;
  if (source.canary_status === 'blocked') return colors.statusPending;
  return 'rgba(255,255,255,0.08)';
}

const SourceRow = React.memo(function SourceRow({
  source,
  claimCount,
  onPress,
}: {
  source: Source;
  claimCount: number;
  onPress: () => void;
}) {
  const score = Number(source.trust_score);
  const color =
    score >= 7.5
      ? colors.statusApprove
      : score >= 5
      ? colors.statusPending
      : colors.statusReject;
  const pct = Math.max(0, Math.min(10, score)) * 10;
  const borderColor = triageBorderColor(source);
  const isBlocked = source.canary_status === 'blocked';

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        { borderLeftColor: borderColor },
        pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${source.source_name}, trust ${score.toFixed(1)} out of 10, ${claimCount} claim${claimCount === 1 ? '' : 's'}${source.auto_approve ? ', auto-approve' : ''}${isBlocked ? ', blocked' : ''}`}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.rowName} numberOfLines={1}>
          {source.source_name}
        </Text>
        <View style={styles.claimCountChip}>
          <Text style={styles.claimCountText}>{claimCount}</Text>
          <Text style={styles.claimCountLabel}>
            {claimCount === 1 ? 'claim' : 'claims'}
          </Text>
        </View>
        <Text style={[styles.rowScore, { color }]}>{score.toFixed(1)}</Text>
      </View>
      <View style={styles.rowMeta}>
        {source.source_class && (
          <Text style={styles.rowMetaText}>{source.source_class}</Text>
        )}
        {source.domain && (
          <>
            <Text style={styles.rowMetaDot}>·</Text>
            <Text style={styles.rowMetaText} numberOfLines={1}>
              {source.domain}
            </Text>
          </>
        )}
        {source.auto_approve && (
          <>
            <Text style={styles.rowMetaDot}>·</Text>
            <Text style={[styles.rowMetaText, { color: colors.teal }]}>
              auto-approve
            </Text>
          </>
        )}
        {isBlocked && (
          <>
            <Text style={styles.rowMetaDot}>·</Text>
            <Text style={[styles.rowMetaText, { color: colors.statusPending }]}>
              blocked
            </Text>
          </>
        )}
      </View>
      <View style={styles.rowBar}>
        <View
          style={[styles.rowBarFill, { width: `${pct}%`, backgroundColor: color }]}
        />
      </View>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  backText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 16,
    color: colors.alabaster,
    marginLeft: 2,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    marginTop: 4,
  },
  // Sort segment bar
  sortBar: {
    flexDirection: 'row',
    marginTop: spacing.md,
    padding: 3,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    gap: 2,
  },
  sortBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sortBtnActive: {
    backgroundColor: 'rgba(0, 161, 155, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.4)',
  },
  sortBtnText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.slate,
    letterSpacing: 0.2,
  },
  sortBtnTextActive: {
    color: colors.teal,
  },
  // Filter chip row
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: spacing.sm,
    paddingRight: spacing.md,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceElevated,
  },
  chipActive: {
    backgroundColor: 'rgba(0, 161, 155, 0.18)',
    borderColor: colors.teal,
  },
  chipText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.slate,
    letterSpacing: 0.3,
  },
  chipTextActive: {
    color: colors.teal,
  },
  // Auto-sort section divider
  sectionDivider: {
    paddingTop: spacing.sm,
    paddingBottom: 6,
    paddingHorizontal: 2,
  },
  sectionDividerText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  row: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderLeftWidth: 3,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    flex: 1,
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.alabaster,
  },
  rowScore: {
    fontFamily: fonts.mono.semibold,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  claimCountChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  claimCountText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  claimCountLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowMetaText: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  rowMetaDot: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  rowBar: {
    marginTop: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  rowBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
  },
  emptyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
  },
});
