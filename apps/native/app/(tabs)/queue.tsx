import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Pressable,
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueueClaims } from '../../src/hooks/useQueueClaims';
import supabase from '../../src/lib/supabase';
import { ClaimCard } from '../../src/components/ClaimCard';
import { RejectSheet } from '../../src/components/RejectSheet';
import { SkeletonClaimCard } from '../../src/components/Skeleton';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import { EmptyState } from '../../src/components/EmptyState';
import {
  ActionSheet,
  type ActionSheetAction,
} from '../../src/components/ActionSheet';
import type { RejectionReason, ClaimStatus } from '@stroom/types';
import type { QueueClaim } from '@stroom/supabase';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

type StatusFilter = 'all' | 'draft' | 'pending_review';
type SortKey = 'smart' | 'newest' | 'oldest' | 'risk' | 'low_trust';

const SORT_LABELS: Record<SortKey, string> = {
  smart: 'Smart (risk · importance · age)',
  newest: 'Newest first',
  oldest: 'Oldest first',
  risk: 'Highest risk',
  low_trust: 'Lowest trust source',
};

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_review', label: 'Pending Review' },
];

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const { claims, loading, error, refresh, approve, reject, batchApprove } =
    useQueueClaims();
  const [refreshing, setRefreshing] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('smart');
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [importance, setImportance] = useState<Map<string, number>>(new Map());

  // Fetch total claim count per subject entity for the current queue —
  // powers the "importance" dimension of the Smart sort. Cheap approximation:
  // one count query per unique entity id. Only refreshes when the set of
  // entity ids changes.
  const subjectEntityIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const c of claims) {
      if (c.subject_entity_id) ids.add(c.subject_entity_id);
    }
    return Array.from(ids);
  }, [claims]);

  React.useEffect(() => {
    if (subjectEntityIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries: [string, number][] = await Promise.all(
        subjectEntityIds.map(async (id) => {
          try {
            const { count } = await supabase
              .from('claims')
              .select('id', { count: 'exact', head: true })
              .eq('subject_entity_id', id);
            return [id, count ?? 0] as [string, number];
          } catch {
            return [id, 0] as [string, number];
          }
        })
      );
      if (!cancelled) setImportance(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectEntityIds]);
  const glow = useSharedValue(0);
  const isHot = claims.length > 100;

  React.useEffect(() => {
    if (isHot) {
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(glow);
      glow.value = withTiming(0, { duration: 200 });
    }
  }, [isHot, glow]);

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.25 + glow.value * 0.55,
    shadowRadius: 4 + glow.value * 10,
    transform: [{ scale: 1 + glow.value * 0.06 }],
  }));
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredClaims = useMemo(() => {
    const byStatus =
      filter === 'all'
        ? claims
        : claims.filter((c) => c.status === (filter as ClaimStatus));
    const q = search.trim().toLowerCase();
    const bySearch = q
      ? byStatus.filter((c) => {
          const name = c.subject_entity?.canonical_name?.toLowerCase() ?? '';
          const pred = (c.predicate ?? '').toLowerCase();
          return name.includes(q) || pred.includes(q);
        })
      : byStatus;

    // Risk score: larger = higher risk. Low trust/confidence/corroboration add.
    const riskScore = (c: typeof bySearch[number]) => {
      const trust = Number(c.source?.trust_score ?? 0);
      const conf = Number(c.confidence_score ?? 0);
      const corr = Number(c.corroboration_score ?? 0);
      return (10 - trust) + (10 - conf) + (corr === 0 ? 5 : 0);
    };

    const copy = [...bySearch];
    switch (sort) {
      case 'smart': {
        // Smart: high-risk first → entity importance → oldest first.
        copy.sort((a, b) => {
          const dr = riskScore(b) - riskScore(a);
          if (dr !== 0) return dr;
          const ia = importance.get(a.subject_entity_id ?? '') ?? 0;
          const ib = importance.get(b.subject_entity_id ?? '') ?? 0;
          if (ib !== ia) return ib - ia;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        break;
      }
      case 'oldest':
        copy.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        break;
      case 'risk':
        copy.sort((a, b) => riskScore(b) - riskScore(a));
        break;
      case 'low_trust':
        copy.sort(
          (a, b) =>
            Number(a.source?.trust_score ?? 0) - Number(b.source?.trust_score ?? 0)
        );
        break;
      case 'newest':
      default:
        copy.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
    return copy;
  }, [claims, filter, search, sort, importance]);

  const sortActions: ActionSheetAction[] = (Object.keys(SORT_LABELS) as SortKey[]).map(
    (key) => ({
      label: SORT_LABELS[key],
      icon: key === sort ? 'checkmark' : undefined,
      tone: key === sort ? 'accent' : 'default',
      onPress: () => {
        Haptics.selectionAsync();
        setSort(key);
      },
    })
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleReject = useCallback(
    (reason: RejectionReason, notes?: string) => {
      if (rejectTarget) {
        reject(rejectTarget, reason, notes);
        setRejectTarget(null);
      }
    },
    [rejectTarget, reject]
  );

  const enterSelectMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBatchApprove = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await batchApprove(ids);
    exitSelectMode();
  }, [selectedIds, batchApprove, exitSelectMode]);

  const renderItem = useCallback(
    ({ item }: { item: QueueClaim }) => (
      <ClaimCard
        claim={item}
        onApprove={() => approve(item.id)}
        onReject={() => setRejectTarget(item.id)}
        selectMode={selectMode}
        selected={selectedIds.has(item.id)}
        onToggleSelect={() => toggleSelect(item.id)}
      />
    ),
    [approve, selectMode, selectedIds, toggleSelect]
  );

  const keyExtractor = useCallback((item: QueueClaim) => item.id, []);

  return (
    <ScreenTransition>
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.headerTitle}>Queue</Text>
        <Animated.View style={isHot ? [styles.badgeGlowWrap, badgeAnimatedStyle] : undefined}>
          <Pressable
            onLongPress={enterSelectMode}
            delayLongPress={400}
            style={({ pressed }) => [
              styles.countBadge,
              selectMode && styles.countBadgeActive,
              isHot && !selectMode && styles.countBadgeHot,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              style={[
                styles.countText,
                selectMode && styles.countTextActive,
                isHot && !selectMode && styles.countTextHot,
              ]}
            >
              {filteredClaims.length}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
      <Text style={styles.headerSub}>Claims pending governance review</Text>

      {/* Search bar + sort */}
      <View style={styles.searchRow}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color={colors.slate} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search by entity or predicate…"
            placeholderTextColor={colors.slate}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch('')} hitSlop={8}>
              <Ionicons name="close-circle" size={16} color={colors.slate} />
            </Pressable>
          )}
        </View>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setSortSheetVisible(true);
          }}
          style={({ pressed }) => [styles.sortBtn, pressed && { opacity: 0.7 }]}
          hitSlop={6}
        >
          <Ionicons name="swap-vertical" size={16} color={colors.teal} />
        </Pressable>
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count =
            f.key === 'all'
              ? claims.length
              : claims.filter((c) => c.status === (f.key as ClaimStatus)).length;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={({ pressed }) => [
                styles.filterPill,
                active && styles.filterPillActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {f.label}
              </Text>
              <Text
                style={[styles.filterCount, active && styles.filterCountActive]}
              >
                {count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && claims.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonClaimCard />
          <SkeletonClaimCard />
          <SkeletonClaimCard />
          <SkeletonClaimCard />
        </ScrollView>
      ) : filteredClaims.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
        >
          {error ? (
            <EmptyState
              icon="alert-circle"
              title="Couldn't load queue"
              subtitle={error}
            />
          ) : claims.length === 0 ? (
            <EmptyState
              icon="checkmark-circle"
              title="Queue Clear"
              subtitle="All claims have been processed"
            />
          ) : (
            <EmptyState
              icon="funnel"
              title="No matches"
              subtitle="No claims match this filter. Try a different status."
            />
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={filteredClaims}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
        />
      )}

      <RejectSheet
        visible={rejectTarget !== null}
        onDismiss={() => setRejectTarget(null)}
        onReject={handleReject}
      />

      <ActionSheet
        visible={sortSheetVisible}
        title="Sort Queue"
        subtitle={`Currently: ${SORT_LABELS[sort]}`}
        actions={sortActions}
        onDismiss={() => setSortSheetVisible(false)}
      />

      {selectMode && (
        <View
          style={[
            styles.batchBar,
            { paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.lg) },
          ]}
        >
          <Pressable
            onPress={exitSelectMode}
            style={({ pressed }) => [
              styles.batchCancelBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.batchCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleBatchApprove}
            disabled={selectedIds.size === 0}
            style={({ pressed }) => [
              styles.batchApproveBtn,
              selectedIds.size === 0 && styles.batchApproveDisabled,
              pressed && selectedIds.size > 0 && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="checkmark-done" size={18} color={colors.obsidian} />
            <Text style={styles.batchApproveText}>
              Approve {selectedIds.size || ''}
            </Text>
          </Pressable>
        </View>
      )}
    </LinearGradient>
    </ScreenTransition>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  headerTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.alabaster,
    letterSpacing: -0.8,
  },
  countBadge: {
    backgroundColor: colors.tealDim,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.2)',
  },
  countBadgeActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  countBadgeHot: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderColor: colors.statusReject,
  },
  badgeGlowWrap: {
    borderRadius: 100,
    shadowColor: colors.statusReject,
    shadowOffset: { width: 0, height: 0 },
    // shadowOpacity and shadowRadius are driven by the animated style
  },
  countText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  countTextActive: {
    color: colors.obsidian,
  },
  countTextHot: {
    color: colors.statusReject,
  },
  batchBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  batchCancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchCancelText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.silver,
  },
  batchApproveBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  batchApproveDisabled: {
    opacity: 0.35,
  },
  batchApproveText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 15,
    color: colors.obsidian,
    letterSpacing: -0.2,
  },
  headerSub: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
  },
  sortBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.alabaster,
    paddingVertical: 0,
  },
  filterScroll: {
    flexGrow: 0,
    height: 44,
    marginBottom: 12,
  },
  filterRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  filterPillActive: {
    backgroundColor: colors.tealDim,
    borderColor: colors.teal,
  },
  filterText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.silver,
  },
  filterTextActive: {
    color: colors.teal,
  },
  filterCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
  },
  filterCountActive: {
    color: colors.teal,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 22,
    color: colors.alabaster,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
    textAlign: 'center',
  },
});
