import React, { useState, useCallback } from 'react';
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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEntityDetail } from '../../src/hooks/useEntityDetail';
import { useExploreSearch } from '../../src/hooks/useExploreSearch';
import { HighlightedText } from '../../src/components/HighlightedText';
import { useSimilarEntities } from '../../src/hooks/useSimilarEntities';
import { useEntityActivity } from '../../src/hooks/useEntityActivity';
import { useRecentlyViewed } from '../../src/hooks/useRecentlyViewed';
import { useFreshnessMap, isClaimStale } from '../../src/hooks/useFreshnessMap';
import { useClaimSparkline } from '../../src/hooks/useClaimSparkline';
import { Sparkline } from '../../src/components/Sparkline';
import { useWatchlist } from '../../src/hooks/useWatchlist';
import { EntityMiniMap } from '../../src/components/EntityMiniMap';
import { RetryCard } from '../../src/components/RetryCard';
import { ClaimListItem } from '../../src/components/ClaimListItem';
import { EntityCompareSheet } from '../../src/components/EntityCompareSheet';
import { EntityEditSheet } from '../../src/components/EntityEditSheet';
import { SkeletonDetail } from '../../src/components/Skeleton';
import { useBrandAlert } from '../../src/components/BrandAlert';
import { useBrandToast } from '../../src/components/BrandToast';
import supabase from '../../src/lib/supabase';
import { mergeEntities, type EntityClaim, type EntityConnection } from '@stroom/supabase';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  FadeOutRight,
} from 'react-native-reanimated';
import { ActionSheet, type ActionSheetAction } from '../../src/components/ActionSheet';
import * as Haptics from 'expo-haptics';
import type { ClaimStatus } from '@stroom/types';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

type StatusFilter = 'all' | 'published' | 'draft' | 'pending_review' | 'rejected';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'published', label: 'Published' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_review', label: 'Pending' },
  { key: 'rejected', label: 'Rejected' },
];

export default function EntityDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { entity, claims, connections, loading, error, refresh } =
    useEntityDetail(id);
  const { similar, dismissLocal } = useSimilarEntities(
    entity?.id,
    entity?.canonical_name ?? entity?.name
  );
  const { rows: activityRows } = useEntityActivity(entity?.id ?? null, 10);
  const { record: recordRecent } = useRecentlyViewed();

  // Record this entity in the "recently viewed" list on each visit so the
  // Explore tab can surface it when the search box is empty.
  React.useEffect(() => {
    if (!entity?.id) return;
    recordRecent({
      id: entity.id,
      name: entity.canonical_name ?? entity.name ?? 'Unnamed',
      type: entity.entity_type ?? entity.entity_class ?? null,
    });
  }, [entity?.id, entity?.canonical_name, entity?.name, entity?.entity_type, recordRecent]);
  const { isWatched, toggle: toggleWatch } = useWatchlist();
  const sparklineData = useClaimSparkline(entity?.id);
  const watching = isWatched(entity?.id ?? '');

  const [compareId, setCompareId] = useState<string | null>(null);
  const [compareSearchOpen, setCompareSearchOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [mergingId, setMergingId] = useState<string | null>(null);
  const [dismissTarget, setDismissTarget] = useState<{
    id: string;
    canonical_name: string | null;
  } | null>(null);
  const { alert } = useBrandAlert();
  const { show: showToast } = useBrandToast();

  const handleDismissDuplicate = useCallback(
    async (
      duplicate: { id: string; canonical_name: string | null },
      reason: 'not_duplicate' | 'similar_name_different_entity' | 'decide_later'
    ) => {
      if (!entity) return;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      // Optimistically remove from local state — Reanimated's exiting layout
      // animation handles the FadeOutRight transition on unmount.
      dismissLocal(duplicate.id);
      try {
        const { error: rpcError } = await supabase
          .schema('intel')
          .rpc('dismiss_merge_suggestion', {
            entity_a_id: entity.id,
            entity_b_id: duplicate.id,
            reason,
            notes: null,
          });
        if (rpcError) throw rpcError;
        showToast(
          'Dismissed. Tap Settings → Dismissed merges to undo.',
          'success'
        );
      } catch (e: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showToast(e?.message ?? 'Dismiss failed', 'error');
        // Refetch so the row reappears if the RPC failed.
        await refresh();
      }
    },
    [entity, dismissLocal, showToast, refresh]
  );

  const dismissActions: ActionSheetAction[] = React.useMemo(() => {
    if (!dismissTarget) return [];
    return [
      {
        label: 'Not a duplicate',
        icon: 'close-circle-outline',
        tone: 'destructive',
        onPress: () => handleDismissDuplicate(dismissTarget, 'not_duplicate'),
      },
      {
        label: 'Different entity, similar name',
        icon: 'people-outline',
        tone: 'default',
        onPress: () =>
          handleDismissDuplicate(
            dismissTarget,
            'similar_name_different_entity'
          ),
      },
      {
        label: 'Decide later — remind me in 30 days',
        icon: 'time-outline',
        tone: 'default',
        onPress: () => handleDismissDuplicate(dismissTarget, 'decide_later'),
      },
    ];
  }, [dismissTarget, handleDismissDuplicate]);

  const handleMerge = useCallback(
    (duplicate: { id: string; canonical_name: string | null }) => {
      if (!entity) return;
      const targetName = entity.canonical_name ?? entity.name ?? 'this entity';
      const dupName = duplicate.canonical_name ?? 'the duplicate entity';
      // Count claims attached to the duplicate so we can show a preview.
      (async () => {
        const { count } = await supabase
          .schema('intel')
          .from('claims')
          .select('id', { count: 'exact', head: true })
          .eq('subject_entity_id', duplicate.id);
        const n = count ?? 0;
        alert(
          'Merge into this entity?',
          `${n} claim${n === 1 ? '' : 's'} will be reassigned from ${dupName} to ${targetName}. The duplicate entity will be archived.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Merge',
              style: 'destructive',
              onPress: async () => {
                setMergingId(duplicate.id);
                try {
                  const moved = await mergeEntities(supabase, {
                    targetEntityId: entity.id,
                    duplicateEntityId: duplicate.id,
                  });
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Success
                  );
                  showToast(
                    `Merged ${moved} claim${moved === 1 ? '' : 's'} from ${dupName}`,
                    'success'
                  );
                  await refresh();
                } catch (e: any) {
                  Haptics.notificationAsync(
                    Haptics.NotificationFeedbackType.Error
                  );
                  showToast(e?.message ?? 'Merge failed', 'error');
                } finally {
                  setMergingId(null);
                }
              },
            },
          ]
        );
      })();
    },
    [entity, alert, showToast, refresh]
  );
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);
  const flatListRef = React.useRef<FlatList>(null);

  // Parallax scroll tracking — header moves at 70% of scroll speed
  const scrollY = useSharedValue(0);
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });
  const headerParallaxStyle = useAnimatedStyle(() => {
    const ty = interpolate(scrollY.value, [0, 200], [0, 60], Extrapolation.CLAMP);
    const opacity = interpolate(scrollY.value, [0, 200], [1, 0.85], Extrapolation.CLAMP);
    return { transform: [{ translateY: ty }], opacity };
  });
  const coverageOffsetRef = React.useRef<number>(0);

  const buildResearchPrompt = useCallback(() => {
    if (!entity) return '';
    const name = entity.canonical_name || entity.name || 'this entity';
    const type = entity.entity_type ?? 'entity';
    const predCounts = new Map<string, number>();
    for (const c of claims) {
      if (!c.predicate) continue;
      const key = c.predicate.split('.').pop() ?? c.predicate;
      predCounts.set(key, (predCounts.get(key) ?? 0) + 1);
    }
    const topPredicates = Array.from(predCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([k, n]) => `${k.replace(/_/g, ' ')} (${n})`)
      .join(', ');
    return [
      `Research ${name} (${type}).`,
      '',
      'Context from our graph:',
      `- ${claims.length} existing claims`,
      topPredicates ? `- Top predicates: ${topPredicates}` : null,
      '',
      'Pull fresh facts we do not already have, surface any contradictions with existing claims, and suggest the highest-value research next steps.',
    ]
      .filter(Boolean)
      .join('\n');
  }, [entity, claims]);

  const handleResearch = useCallback(() => {
    const prompt = buildResearchPrompt();
    if (!prompt) return;
    router.push({
      pathname: '/(tabs)/command',
      params: { prompt },
    } as any);
  }, [buildResearchPrompt, router]);

  const handleScrollToCoverage = useCallback(() => {
    flatListRef.current?.scrollToOffset({
      offset: Math.max(0, coverageOffsetRef.current - 40),
      animated: true,
    });
  }, []);

  const handleToggleTimeline = useCallback(() => {
    setViewMode((prev) => (prev === 'timeline' ? 'list' : 'timeline'));
  }, []);

  const handleCompareFirst = useCallback(() => {
    if (similar.length > 0) setCompareId(similar[0].id);
  }, [similar]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  // Top-predicate drill-down filter — set by tapping a row in the Top
  // Predicates section. Tapping the same row again clears it. This stacks
  // with the status filter chips above.
  const [predicateFilter, setPredicateFilter] = useState<string | null>(null);

  // Freshness map for stale-claim detection. Cached at the module level so
  // this only fires the network call once per app session.
  const freshnessMap = useFreshnessMap();
  const staleCount = React.useMemo(() => {
    if (!freshnessMap) return 0;
    let count = 0;
    for (const c of claims) {
      if (isClaimStale(c.created_at, c.predicate, freshnessMap)) count++;
    }
    return count;
  }, [claims, freshnessMap]);

  const filtered = React.useMemo(() => {
    let rows =
      filter === 'all'
        ? claims
        : claims.filter((c) => c.status === (filter as ClaimStatus));
    if (predicateFilter) {
      rows = rows.filter((c) => c.predicate === predicateFilter);
    }
    return rows;
  }, [claims, filter, predicateFilter]);

  // Timeline sort direction — default Latest first; toggle flips to Earliest.
  const [timelineAsc, setTimelineAsc] = useState(false);

  // Sorted and grouped by month for the timeline view. Mixed array of month
  // headers and claim rows so the FlatList renders them in order.
  type TimelineItem =
    | { kind: 'month'; label: string; key: string }
    | { kind: 'claim'; claim: EntityClaim; isFirst: boolean; isLast: boolean };

  const timelineItems: TimelineItem[] = React.useMemo(() => {
    const sorted = [...filtered].sort((a, b) => {
      const diff =
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      return timelineAsc ? -diff : diff;
    });
    const items: TimelineItem[] = [];
    let lastMonth = '';
    for (let i = 0; i < sorted.length; i++) {
      const d = new Date(sorted[i].created_at);
      const monthKey = `${d.getFullYear()}-${d.getMonth()}`;
      if (monthKey !== lastMonth) {
        lastMonth = monthKey;
        items.push({
          kind: 'month',
          label: d.toLocaleDateString('en-US', {
            month: 'long',
            year: 'numeric',
          }),
          key: `month-${monthKey}`,
        });
      }
      items.push({
        kind: 'claim',
        claim: sorted[i],
        isFirst: i === 0,
        isLast: i === sorted.length - 1,
      });
    }
    return items;
  }, [filtered, timelineAsc]);

  // Flat sorted list for backward-compat references (claim count header).
  const timelineOrdered = React.useMemo(
    () => timelineItems.filter((t): t is TimelineItem & { kind: 'claim' } => t.kind === 'claim').map((t) => t.claim),
    [timelineItems]
  );

  const renderItem = useCallback(
    ({ item }: { item: EntityClaim | TimelineItem }) => {
      // Timeline mode uses the mixed TimelineItem array.
      if (viewMode === 'timeline') {
        const tItem = item as TimelineItem;
        if (tItem.kind === 'month') {
          return (
            <View style={styles.monthHeader}>
              <Text style={styles.monthHeaderText}>{tItem.label}</Text>
            </View>
          );
        }
        const c = tItem.claim;
        return (
          <TimelineRow
            claim={c}
            onPress={() =>
              router.push({
                pathname: '/claim/[id]',
                params: { id: c.id },
              } as any)
            }
            isFirst={tItem.isFirst}
            isLast={tItem.isLast}
          />
        );
      }
      // List mode — item is EntityClaim.
      const claim = item as EntityClaim;
      return (
        <ClaimListItem
          claim={claim}
          onPress={() =>
            router.push({
              pathname: '/claim/[id]',
              params: { id: claim.id },
            } as any)
          }
        />
      );
    },
    [router, viewMode]
  );

  const keyExtractor = useCallback((item: EntityClaim) => item.id, []);

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      {/* Header with back button + edit */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Explore</Text>
        </Pressable>
        {entity && (
          <View style={styles.headerActions}>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                toggleWatch({
                  id: entity.id,
                  canonical_name: entity.canonical_name ?? entity.name ?? 'Unnamed',
                  domain: entity.domain ?? null,
                });
              }}
              hitSlop={10}
              style={({ pressed }) => [
                styles.watchBtn,
                watching && styles.watchBtnActive,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={watching ? 'Unwatch entity' : 'Watch entity'}
            >
              <Ionicons
                name={watching ? 'eye' : 'eye-outline'}
                size={16}
                color={watching ? colors.teal : colors.silver}
              />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setCompareSearchOpen(true);
              }}
              hitSlop={10}
              style={({ pressed }) => [
                styles.watchBtn,
                pressed && { opacity: 0.7 },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Compare with another entity"
            >
              <Ionicons name="git-compare-outline" size={16} color={colors.silver} />
            </Pressable>
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                setEditOpen(true);
              }}
              hitSlop={10}
              style={({ pressed }) => [
                styles.editEntityBtn,
                pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Edit entity"
            >
              <Ionicons name="create-outline" size={18} color={colors.teal} />
              <Text style={styles.editEntityText}>Edit</Text>
            </Pressable>
          </View>
        )}
      </View>

      {loading && !entity ? (
        <SkeletonDetail />
      ) : error ? (
        <View style={styles.emptyWrap}>
          <RetryCard
            message="Couldn't load entity"
            detail={error}
            onRetry={refresh}
          />
        </View>
      ) : !entity ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Entity not found</Text>
        </View>
      ) : (
        <Animated.FlatList
          ref={flatListRef as any}
          onScroll={scrollHandler}
          scrollEventThrottle={16}
          data={(viewMode === 'timeline' ? timelineItems : filtered) as any[]}
          renderItem={renderItem as any}
          keyExtractor={(item: any) =>
            viewMode === 'timeline'
              ? item.kind === 'month'
                ? item.key
                : item.claim.id
              : item.id
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
          ListHeaderComponent={
            <Animated.View style={[styles.headerBlock, headerParallaxStyle]}>
              <Text style={styles.entityName}>
                {entity.canonical_name || entity.name}
              </Text>
              <View style={styles.metaRow}>
                {entity.entity_type && (
                  <View style={styles.typeChip}>
                    <Text style={styles.typeText}>{entity.entity_type}</Text>
                  </View>
                )}
                {entity.domain && (
                  <Text style={styles.domainText}>{entity.domain}</Text>
                )}
              </View>
              {entity.description && (
                <Text style={styles.description}>{entity.description}</Text>
              )}

              {/* Quick actions */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.quickActionRow}
              >
                <QuickActionPill
                  icon="sparkles"
                  label="Research"
                  onPress={handleResearch}
                />
                <QuickActionPill
                  icon="speedometer-outline"
                  label="Coverage"
                  onPress={handleScrollToCoverage}
                />
                <QuickActionPill
                  icon="time-outline"
                  label={viewMode === 'timeline' ? 'List' : 'Timeline'}
                  onPress={handleToggleTimeline}
                  active={viewMode === 'timeline'}
                />
                {similar.length > 0 && (
                  <QuickActionPill
                    icon="git-compare-outline"
                    label="Compare"
                    onPress={handleCompareFirst}
                  />
                )}
              </ScrollView>

              {/* Ask Command */}
              <Pressable
                onPress={() => {
                  const name = entity.canonical_name || entity.name || 'this entity';
                  const type = entity.entity_type ?? 'entity';

                  // Top predicates by frequency for inline context
                  const predCounts = new Map<string, number>();
                  for (const c of claims) {
                    if (!c.predicate) continue;
                    const key = c.predicate.split('.').pop() ?? c.predicate;
                    predCounts.set(key, (predCounts.get(key) ?? 0) + 1);
                  }
                  const topPredicates = Array.from(predCounts.entries())
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([k, n]) => `${k.replace(/_/g, ' ')} (${n})`)
                    .join(', ');

                  // Coverage score using the same formula as CoverageScore
                  const claimCount = claims.length;
                  const uniquePredicates = new Set(
                    claims.map((c) => c.predicate).filter(Boolean)
                  ).size;
                  const corroborated = claims.filter(
                    (c) => (c.corroboration_score ?? 0) >= 1
                  ).length;
                  const latest = claims.reduce<number>((max, c) => {
                    const t = new Date(c.created_at).getTime();
                    return t > max ? t : max;
                  }, 0);
                  const claimScore = Math.min(1, claimCount / 10);
                  const predicateScore = Math.min(1, uniquePredicates / 5);
                  const corrobScore = claimCount > 0 ? corroborated / claimCount : 0;
                  const ageDays =
                    latest > 0 ? (Date.now() - latest) / 86_400_000 : 999;
                  const recencyScore = Math.max(0, 1 - ageDays / 30);
                  const coveragePct = Math.round(
                    ((claimScore + predicateScore + corrobScore + recencyScore) / 4) * 100
                  );

                  const lastUpdated =
                    latest > 0
                      ? new Date(latest).toLocaleDateString('en-US', {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        })
                      : 'never';

                  const promptLines = [
                    `Tell me about ${name}.`,
                    '',
                    'Context from our graph:',
                    `- Type: ${type}`,
                    `- Claims: ${claimCount}`,
                    `- Coverage score: ${coveragePct}%`,
                    topPredicates ? `- Top predicates: ${topPredicates}` : null,
                    `- Last updated: ${lastUpdated}`,
                  ].filter(Boolean);

                  router.push({
                    pathname: '/(tabs)/command',
                    params: { prompt: promptLines.join('\n') },
                  } as any);
                }}
                style={({ pressed }) => [
                  styles.askCommandBtn,
                  pressed && styles.askCommandPressed,
                ]}
              >
                <Ionicons name="sparkles" size={16} color={colors.teal} />
                <Text style={styles.askCommandText}>Ask Command about this entity</Text>
                <Ionicons name="chevron-forward" size={14} color={colors.teal} />
              </Pressable>

              {/* Coverage score */}
              <View
                onLayout={(e) => {
                  coverageOffsetRef.current = e.nativeEvent.layout.y;
                }}
              >
                <CoverageScore claims={claims} staleCount={staleCount} />
              </View>

              {/* Claim distribution by predicate category */}
              <ClaimDistribution claims={claims} />

              {/* Top predicates — tap a row to drill in. Gives the operator
                  instant coverage visibility for this entity. */}
              <TopPredicates
                claims={claims}
                selected={predicateFilter}
                sparklineData={sparklineData}
                onSelect={(key) => {
                  Haptics.selectionAsync();
                  setPredicateFilter((prev) => (prev === key ? null : key));
                }}
              />

              {/* Possible duplicates */}
              {similar.length > 0 && (
                <View style={styles.duplicatesCard}>
                  <View style={styles.duplicatesHeader}>
                    <Ionicons name="git-compare-outline" size={14} color={colors.statusPending} />
                    <Text style={styles.duplicatesTitle}>Possible Duplicates</Text>
                  </View>
                  {similar.map((s) => {
                    const merging = mergingId === s.id;
                    return (
                      <Animated.View
                        key={s.id}
                        exiting={FadeOutRight.duration(200)}
                        style={styles.duplicateRow}
                      >
                        <Pressable
                          onPress={() => setCompareId(s.id)}
                          style={({ pressed }) => [
                            { flex: 1 },
                            pressed && { opacity: 0.7 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Compare ${s.canonical_name ?? 'duplicate'}`}
                        >
                          <Text style={styles.duplicateName} numberOfLines={1}>
                            {s.canonical_name ?? '—'}
                          </Text>
                          <Text style={styles.duplicateMeta}>
                            {s.entity_type ?? 'entity'} · edit distance {s.distance}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => setCompareId(s.id)}
                          hitSlop={8}
                          style={({ pressed }) => [pressed && { opacity: 0.6 }]}
                          accessibilityRole="button"
                          accessibilityLabel="Compare"
                        >
                          <Text style={styles.duplicateCompare}>Compare</Text>
                        </Pressable>
                        <Pressable
                          onPress={() => !merging && handleMerge(s)}
                          disabled={merging || mergingId !== null}
                          style={({ pressed }) => [
                            styles.mergeBtn,
                            (pressed || merging) && { opacity: 0.7 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Merge ${s.canonical_name ?? 'duplicate'} into this entity`}
                        >
                          {merging ? (
                            <ActivityIndicator size="small" color={colors.teal} />
                          ) : (
                            <Ionicons
                              name="git-merge-outline"
                              size={12}
                              color={colors.teal}
                            />
                          )}
                          <Text style={styles.mergeBtnText}>
                            {merging ? 'Merging…' : 'Merge'}
                          </Text>
                        </Pressable>
                        <Pressable
                          onPress={() => {
                            Haptics.selectionAsync();
                            setDismissTarget({
                              id: s.id,
                              canonical_name: s.canonical_name,
                            });
                          }}
                          hitSlop={10}
                          style={({ pressed }) => [
                            styles.dismissBtn,
                            pressed && { opacity: 0.6 },
                          ]}
                          accessibilityRole="button"
                          accessibilityLabel={`Dismiss ${s.canonical_name ?? 'duplicate'}`}
                        >
                          <Ionicons
                            name="close"
                            size={14}
                            color={colors.slate}
                          />
                        </Pressable>
                      </Animated.View>
                    );
                  })}
                </View>
              )}

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{claims.length}</Text>
                  <Text style={styles.statLabel}>CLAIMS</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {claims.filter((c) => c.status === 'published').length}
                  </Text>
                  <Text style={styles.statLabel}>PUBLISHED</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {
                      claims.filter(
                        (c) =>
                          c.status === 'draft' || c.status === 'pending_review'
                      ).length
                    }
                  </Text>
                  <Text style={styles.statLabel}>PENDING</Text>
                </View>
              </View>

              {/* View toggle */}
              <View style={styles.viewToggle}>
                <Pressable
                  onPress={() => setViewMode('list')}
                  style={[
                    styles.viewToggleBtn,
                    viewMode === 'list' && styles.viewToggleBtnActive,
                  ]}
                >
                  <Ionicons
                    name="list-outline"
                    size={14}
                    color={viewMode === 'list' ? colors.teal : colors.slate}
                  />
                  <Text
                    style={[
                      styles.viewToggleText,
                      viewMode === 'list' && styles.viewToggleTextActive,
                    ]}
                  >
                    List
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setViewMode('timeline')}
                  style={[
                    styles.viewToggleBtn,
                    viewMode === 'timeline' && styles.viewToggleBtnActive,
                  ]}
                >
                  <Ionicons
                    name="time-outline"
                    size={14}
                    color={viewMode === 'timeline' ? colors.teal : colors.slate}
                  />
                  <Text
                    style={[
                      styles.viewToggleText,
                      viewMode === 'timeline' && styles.viewToggleTextActive,
                    ]}
                  >
                    Timeline
                  </Text>
                </Pressable>
              </View>

              {/* Timeline sort toggle — Latest / Earliest */}
              {viewMode === 'timeline' && (
                <View style={styles.timelineSortRow}>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTimelineAsc(false);
                    }}
                    style={[
                      styles.viewToggleBtn,
                      !timelineAsc && styles.viewToggleBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.viewToggleText,
                        !timelineAsc && styles.viewToggleTextActive,
                      ]}
                    >
                      Latest
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      Haptics.selectionAsync();
                      setTimelineAsc(true);
                    }}
                    style={[
                      styles.viewToggleBtn,
                      timelineAsc && styles.viewToggleBtnActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.viewToggleText,
                        timelineAsc && styles.viewToggleTextActive,
                      ]}
                    >
                      Earliest
                    </Text>
                  </Pressable>
                </View>
              )}

              {/* Filter pills (list mode only) */}
              {viewMode === 'list' && (
                <FlatList
                  data={FILTERS}
                  keyExtractor={(f) => f.key}
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.filterRow}
                  renderItem={({ item }) => {
                    const active = filter === item.key;
                    return (
                      <Pressable
                        onPress={() => setFilter(item.key)}
                        style={({ pressed }) => [
                          styles.filterPill,
                          active && styles.filterPillActive,
                          pressed && { opacity: 0.7 },
                        ]}
                      >
                        <Text
                          style={[
                            styles.filterText,
                            active && styles.filterTextActive,
                          ]}
                        >
                          {item.label}
                        </Text>
                      </Pressable>
                    );
                  }}
                />
              )}

              <Text style={styles.sectionHeader}>
                {(viewMode === 'timeline' ? timelineOrdered : filtered).length}{' '}
                {viewMode === 'timeline' ? 'events' : 'claims'}
              </Text>
            </Animated.View>
          }
          ListEmptyComponent={
            <View style={styles.listEmpty}>
              <Text style={styles.listEmptyText}>No claims in this view.</Text>
            </View>
          }
          ListFooterComponent={
            <>
              {connections.length > 0 && (
                <View style={styles.connectionsBlock}>
                  <Text style={styles.sectionHeader}>
                    Connections ({connections.length})
                  </Text>
                  {connections.map((c, i) => (
                    <ConnectionRow
                      key={`${c.direction}-${c.otherEntityId}-${c.predicate}-${i}`}
                      connection={c}
                      onPress={() =>
                        router.push({
                          pathname: '/entity/[id]',
                          params: { id: c.otherEntityId },
                        } as any)
                      }
                    />
                  ))}
                  <EntityMiniMap
                    centerName={entity.canonical_name ?? entity.name ?? 'Entity'}
                    connections={connections}
                    onNodePress={(otherId) =>
                      router.push({
                        pathname: '/entity/[id]',
                        params: { id: otherId },
                      } as any)
                    }
                  />
                </View>
              )}
              {activityRows.length > 0 && (
                <View style={styles.activityBlock}>
                  <Text style={styles.sectionHeader}>Activity</Text>
                  {activityRows.map((row) => (
                    <ActivityRow
                      key={row.id}
                      row={row}
                      onPress={() => router.push('/audit' as any)}
                    />
                  ))}
                </View>
              )}
            </>
          }
        />
      )}

      {/* Compare entity search modal */}
      {compareSearchOpen && (
        <CompareSearchModal
          currentId={entity?.id ?? ''}
          onSelect={(selectedId) => {
            setCompareSearchOpen(false);
            setCompareId(selectedId);
          }}
          onDismiss={() => setCompareSearchOpen(false)}
        />
      )}

      <EntityCompareSheet
        visible={compareId !== null}
        current={entity}
        otherId={compareId}
        onDismiss={() => setCompareId(null)}
        onOpenOther={(nextId) =>
          router.push({ pathname: '/entity/[id]', params: { id: nextId } } as any)
        }
      />

      <EntityEditSheet
        visible={editOpen}
        entity={
          entity
            ? {
                id: entity.id,
                canonical_name: entity.canonical_name ?? null,
                canonical_slug: (entity as any).canonical_slug ?? null,
                entity_type: entity.entity_type ?? null,
                domain: entity.domain ?? null,
                description: entity.description ?? null,
              }
            : null
        }
        onDismiss={() => setEditOpen(false)}
        onSaved={() => {
          void refresh();
        }}
      />

      <ActionSheet
        visible={dismissTarget !== null}
        title="Dismiss this duplicate?"
        subtitle={dismissTarget?.canonical_name ?? undefined}
        actions={dismissActions}
        onDismiss={() => setDismissTarget(null)}
      />
    </LinearGradient>
  );
}

function TimelineRow({
  claim,
  onPress,
  isFirst,
  isLast,
}: {
  claim: EntityClaim;
  onPress: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  const date = new Date(claim.created_at);
  const predicate = (claim.predicate ?? 'unknown').split('.').pop() ?? 'unknown';
  const predicateLabel = predicate.replace(/_/g, ' ');
  const value =
    claim.object_entity?.canonical_name ??
    (claim.value_jsonb && typeof claim.value_jsonb === 'object'
      ? (() => {
          const jsonb = claim.value_jsonb as Record<string, unknown>;
          if ('value' in jsonb && typeof jsonb.value !== 'object') return String(jsonb.value);
          if ('name' in jsonb) return String(jsonb.name);
          return null;
        })()
      : null);

  // Status-colored dot — teal for published, amber for draft/pending, gray for superseded/retracted.
  const dotColor =
    claim.status === 'published'
      ? colors.teal
      : claim.status === 'approved'
      ? colors.statusApprove
      : claim.status === 'draft' || claim.status === 'pending_review'
      ? colors.statusPending
      : colors.slate;

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        {!isFirst && (
          <View style={styles.timelineRailLineTop} />
        )}
        <View
          style={[styles.timelineDot, { backgroundColor: dotColor, borderColor: dotColor }]}
        />
        {!isLast && <View style={styles.timelineRailLineBottom} />}
      </View>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [
          styles.timelineCard,
          pressed && { opacity: 0.75 },
        ]}
      >
        <Text style={styles.timelineDate}>
          {date.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric',
          })}
        </Text>
        <Text style={styles.timelinePredicate} numberOfLines={1}>
          {predicateLabel}
        </Text>
        {value && (
          <Text style={styles.timelineValue} numberOfLines={2}>
            {value}
          </Text>
        )}
      </Pressable>
    </View>
  );
}

// Predicate family mapping for the coverage heatmap. Keys are the category
// prefix (before the first dot); multiple prefixes can map to one family.
// Inline entity search modal for picking a compare target. Reuses the
// existing useExploreSearch hook with a focused TextInput.
function CompareSearchModal({
  currentId,
  onSelect,
  onDismiss,
}: {
  currentId: string;
  onSelect: (entityId: string) => void;
  onDismiss: () => void;
}) {
  const [q, setQ] = React.useState('');
  const { results, loading } = useExploreSearch(q);
  const filtered = results.filter((r) => r.id !== currentId);
  const insets = useSafeAreaInsets();

  return (
    <View style={compareSearchStyles.overlay}>
      <View style={[compareSearchStyles.container, { paddingTop: insets.top + spacing.md }]}>
        <View style={compareSearchStyles.header}>
          <View style={compareSearchStyles.inputWrap}>
            <Ionicons name="git-compare-outline" size={16} color={colors.teal} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search entity to compare…"
              placeholderTextColor={colors.slate}
              style={compareSearchStyles.input}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <Pressable onPress={onDismiss} hitSlop={8}>
            <Text style={compareSearchStyles.cancel}>Cancel</Text>
          </Pressable>
        </View>
        <FlatList
          data={filtered}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item.id)}
              style={({ pressed }) => [
                compareSearchStyles.row,
                pressed && { backgroundColor: colors.surfaceCard },
              ]}
            >
              <HighlightedText
                text={item.canonical_name || item.name || 'Unnamed'}
                query={q}
                style={compareSearchStyles.name}
                numberOfLines={1}
              />
              <Text style={compareSearchStyles.meta} numberOfLines={1}>
                {item.entity_type ?? 'entity'}
                {item.domain ? ` · ${item.domain}` : ''}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator color={colors.teal} style={{ marginTop: spacing.xxl }} />
            ) : q.trim().length > 0 ? (
              <Text style={compareSearchStyles.empty}>No entities found</Text>
            ) : (
              <Text style={compareSearchStyles.empty}>Type to search…</Text>
            )
          }
        />
      </View>
    </View>
  );
}

const compareSearchStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
    backgroundColor: 'rgba(5, 5, 7, 0.97)',
  },
  container: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 42,
  },
  input: {
    flex: 1,
    fontFamily: fonts.archivo.medium,
    fontSize: 15,
    color: colors.alabaster,
    paddingVertical: 0,
  },
  cancel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.teal,
  },
  row: {
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  name: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.alabaster,
  },
  meta: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 3,
  },
  empty: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});

const FAMILY_MAP: Record<string, string> = {
  identity: 'Identity',
  performance: 'Performance',
  stats: 'Performance',
  relationship: 'Relationships',
  team: 'Relationships',
  economics: 'Economics',
  financial: 'Economics',
  history: 'History',
  career: 'History',
  media: 'Media',
  content: 'Media',
  operational: 'Operational',
  logistics: 'Operational',
};
const FAMILY_ORDER = [
  'Identity',
  'Performance',
  'Relationships',
  'Economics',
  'History',
  'Media',
  'Operational',
  'Metadata',
];

function CoverageHeatmap({ claims }: { claims: EntityClaim[] }) {
  const familyCounts = React.useMemo(() => {
    const counts = new Map<string, number>();
    for (const fam of FAMILY_ORDER) counts.set(fam, 0);
    for (const c of claims) {
      if (!c.predicate) continue;
      const prefix = c.predicate.includes('.')
        ? c.predicate.split('.')[0]
        : 'other';
      const family = FAMILY_MAP[prefix] ?? 'Metadata';
      counts.set(family, (counts.get(family) ?? 0) + 1);
    }
    return FAMILY_ORDER.map((fam) => ({ family: fam, count: counts.get(fam) ?? 0 }));
  }, [claims]);

  return (
    <View style={styles.heatmapGrid}>
      {familyCounts.map((f) => {
        const bg =
          f.count === 0
            ? 'rgba(255,255,255,0.04)'
            : f.count <= 3
            ? 'rgba(245, 158, 11, 0.18)'
            : 'rgba(0, 161, 155, 0.22)';
        const fg =
          f.count === 0
            ? colors.slate
            : f.count <= 3
            ? colors.statusPending
            : colors.teal;
        return (
          <View
            key={f.family}
            style={[styles.heatmapCell, { backgroundColor: bg }]}
            accessible
            accessibilityLabel={`${f.family}: ${f.count} claims`}
          >
            <Text style={[styles.heatmapCount, { color: fg }]}>{f.count}</Text>
            <Text style={[styles.heatmapLabel, { color: fg }]} numberOfLines={1}>
              {f.family}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

function CoverageScore({
  claims,
  staleCount,
}: {
  claims: EntityClaim[];
  staleCount: number;
}) {
  const { pct, claimScore, predicateScore, corrobScore, recencyScore } =
    React.useMemo(() => {
      const claimCount = claims.length;
      const uniquePredicates = new Set(
        claims.map((c) => c.predicate).filter(Boolean)
      ).size;
      const corroborated = claims.filter(
        (c) => (c.corroboration_score ?? 0) >= 1
      ).length;
      const latest = claims.reduce<number>((max, c) => {
        const t = new Date(c.created_at).getTime();
        return t > max ? t : max;
      }, 0);

      // Normalized sub-scores (0-1)
      const claimScore = Math.min(1, claimCount / 10);
      const predicateScore = Math.min(1, uniquePredicates / 5);
      const corrobScore = claimCount > 0 ? corroborated / claimCount : 0;
      const ageDays = latest > 0 ? (Date.now() - latest) / 86_400_000 : 999;
      const recencyScore = Math.max(0, 1 - ageDays / 30);

      const avg = (claimScore + predicateScore + corrobScore + recencyScore) / 4;
      return {
        pct: Math.round(avg * 100),
        claimScore,
        predicateScore,
        corrobScore,
        recencyScore,
      };
    }, [claims]);

  const barColor =
    pct >= 75
      ? colors.statusApprove
      : pct >= 40
      ? colors.teal
      : colors.statusPending;

  return (
    <View style={styles.coverageCard}>
      <View style={styles.coverageHeader}>
        <Text style={styles.coverageLabel}>COVERAGE SCORE</Text>
        <Text style={[styles.coveragePct, { color: barColor }]}>{pct}%</Text>
      </View>
      <View style={styles.coverageTrack}>
        <View
          style={[
            styles.coverageFill,
            { width: `${pct}%`, backgroundColor: barColor },
          ]}
        />
      </View>
      <View style={styles.coverageBreakdown}>
        <CoverageFacet label="Claims" score={claimScore} />
        <CoverageFacet label="Variety" score={predicateScore} />
        <CoverageFacet label="Corrob" score={corrobScore} />
        <CoverageFacet label="Recency" score={recencyScore} />
      </View>

      {/* Coverage heatmap — 8-cell grid showing claim depth per family */}
      <CoverageHeatmap claims={claims} />

      {staleCount > 0 && (
        <View style={styles.staleRow}>
          <Ionicons name="time-outline" size={12} color={colors.statusPending} />
          <Text style={styles.staleText}>
            {staleCount} stale claim{staleCount === 1 ? '' : 's'}
          </Text>
        </View>
      )}
    </View>
  );
}

const DISTRIBUTION_COLORS = [
  colors.teal,
  colors.statusInfo,
  colors.statusApprove,
  colors.statusPending,
  colors.statusReject,
  '#A78BFA',
  '#F472B6',
  '#22D3EE',
];

function TopPredicates({
  claims,
  selected,
  onSelect,
  sparklineData,
}: {
  claims: EntityClaim[];
  selected: string | null;
  onSelect: (predicateKey: string) => void;
  sparklineData?: number[];
}) {
  const rows = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const c of claims) {
      if (!c.predicate) continue;
      map.set(c.predicate, (map.get(c.predicate) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([predicate, count]) => ({ predicate, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);
  }, [claims]);

  if (rows.length === 0) return null;
  const max = rows[0].count;

  return (
    <View style={styles.topPredCard}>
      <View style={styles.topPredHeaderRow}>
        <Text style={styles.topPredHeader}>TOP PREDICATES</Text>
        {sparklineData && sparklineData.length > 1 && (
          <Sparkline data={sparklineData} width={80} height={28} />
        )}
        <View style={{ flex: 1 }} />
        {selected && (
          <Pressable
            onPress={() => onSelect(selected)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Clear predicate filter"
          >
            <Text style={styles.topPredClear}>Clear filter</Text>
          </Pressable>
        )}
      </View>
      <View style={{ gap: spacing.sm }}>
        {rows.map((r) => {
          const isSelected = selected === r.predicate;
          const pct = Math.max(2, Math.round((r.count / max) * 100));
          return (
            <Pressable
              key={r.predicate}
              onPress={() => onSelect(r.predicate)}
              style={({ pressed }) => [
                styles.topPredRow,
                isSelected && styles.topPredRowActive,
                pressed && { opacity: 0.75 },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${formatPredicateLabel(r.predicate)}, ${r.count} claim${r.count === 1 ? '' : 's'}${isSelected ? ', selected' : ''}`}
            >
              <View style={styles.topPredTopRow}>
                <Text
                  style={[
                    styles.topPredName,
                    isSelected && { color: colors.teal },
                  ]}
                  numberOfLines={1}
                >
                  {formatPredicateLabel(r.predicate)}
                </Text>
                <Text style={styles.topPredCount}>{r.count}</Text>
              </View>
              <View style={styles.topPredTrack}>
                <View
                  style={[
                    styles.topPredFill,
                    { width: `${pct}%` },
                  ]}
                />
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function formatPredicateLabel(key: string): string {
  // "person.crew_chief_profile" → "Crew chief profile"
  const last = key.includes('.') ? key.split('.').pop()! : key;
  const spaced = last.replace(/_/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1);
}

function ClaimDistribution({ claims }: { claims: EntityClaim[] }) {
  const buckets = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const c of claims) {
      if (!c.predicate) continue;
      // Predicate keys follow "category.subkey" — group by the category
      // prefix, fall back to "other" for bare keys.
      const cat = c.predicate.includes('.')
        ? c.predicate.split('.')[0]
        : 'other';
      map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return Array.from(map.entries())
      .map(([k, v]) => ({ category: k, count: v }))
      .sort((a, b) => b.count - a.count);
  }, [claims]);

  if (buckets.length === 0) return null;
  const total = buckets.reduce((acc, b) => acc + b.count, 0);

  return (
    <View style={styles.distCard}>
      <View style={styles.distHeaderRow}>
        <Text style={styles.distLabel}>CLAIM DISTRIBUTION</Text>
        <Text style={styles.distTotal}>{total}</Text>
      </View>
      <View style={styles.distBars}>
        {buckets.map((b, i) => {
          const pct = Math.round((b.count / total) * 100);
          const color = DISTRIBUTION_COLORS[i % DISTRIBUTION_COLORS.length];
          return (
            <View key={b.category} style={styles.distRow}>
              <Text style={styles.distCat} numberOfLines={1}>
                {b.category.replace(/_/g, ' ')}
              </Text>
              <View style={styles.distTrack}>
                <View
                  style={[
                    styles.distFill,
                    {
                      width: `${Math.max(2, pct)}%`,
                      backgroundColor: color,
                    },
                  ]}
                />
              </View>
              <Text style={styles.distCount}>{b.count}</Text>
              <Text style={styles.distPct}>{pct}%</Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

function CoverageFacet({ label, score }: { label: string; score: number }) {
  return (
    <View style={styles.facetCell}>
      <Text style={styles.facetLabel}>{label}</Text>
      <View style={styles.facetTrack}>
        <View
          style={[styles.facetFill, { width: `${Math.round(score * 100)}%` }]}
        />
      </View>
    </View>
  );
}

function QuickActionPill({
  icon,
  label,
  onPress,
  active,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  active?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.quickPill,
        active && styles.quickPillActive,
        pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
      ]}
    >
      <Ionicons
        name={icon}
        size={13}
        color={active ? colors.teal : colors.silver}
      />
      <Text
        style={[styles.quickPillText, active && { color: colors.teal }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

function ActivityRow({
  row,
  onPress,
}: {
  row: { id: string; action_type: string | null; actor?: string | null; created_at: string; entity_table?: string | null };
  onPress: () => void;
}) {
  const iconName =
    row.action_type === 'approve'
      ? 'checkmark-circle-outline'
      : row.action_type === 'reject'
      ? 'close-circle-outline'
      : row.action_type === 'update'
      ? 'create-outline'
      : row.action_type === 'merge'
      ? 'git-merge-outline'
      : 'time-outline';
  const color =
    row.action_type === 'approve'
      ? colors.statusApprove
      : row.action_type === 'reject'
      ? colors.statusReject
      : row.action_type === 'update'
      ? colors.statusInfo
      : colors.silver;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.activityRow,
        pressed && { opacity: 0.7, transform: [{ scale: 0.98 }] },
      ]}
    >
      <Ionicons name={iconName as any} size={16} color={color} />
      <View style={styles.activityBody}>
        <Text style={styles.activityAction}>
          {(row.action_type ?? 'event').replace(/_/g, ' ')}
          {row.entity_table ? ` · ${row.entity_table}` : ''}
        </Text>
        <Text style={styles.activityMeta} numberOfLines={1}>
          {row.actor ?? 'system'} · {formatRelative(row.created_at)}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={12} color={colors.slate} />
    </Pressable>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

function ConnectionRow({
  connection,
  onPress,
}: {
  connection: EntityConnection;
  onPress: () => void;
}) {
  const predLabel =
    (connection.predicate.includes('.')
      ? connection.predicate.split('.').pop()!
      : connection.predicate)
      .replace(/_/g, ' ');
  const isOutgoing = connection.direction === 'outgoing';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.connRow, pressed && { opacity: 0.75 }]}
    >
      <View style={styles.connDirectionWrap}>
        <Ionicons
          name={isOutgoing ? 'arrow-forward' : 'arrow-back'}
          size={13}
          color={isOutgoing ? colors.teal : colors.statusInfo}
        />
      </View>
      <View style={styles.connBody}>
        <Text style={styles.connName} numberOfLines={1}>
          {connection.otherEntityName}
        </Text>
        <Text style={styles.connPredicate} numberOfLines={1}>
          {predLabel}
        </Text>
      </View>
      <View style={styles.connCountChip}>
        <Text style={styles.connCountText}>{connection.claimCount}</Text>
      </View>
      <Ionicons name="chevron-forward" size={14} color={colors.slate} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  watchBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: 'transparent',
  },
  watchBtnActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealDim,
  },
  editEntityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  editEntityText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.teal,
  },
  backText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 16,
    color: colors.alabaster,
    marginLeft: 2,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  headerBlock: {
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  entityName: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  typeChip: {
    backgroundColor: colors.tealDim,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  typeText: {
    fontFamily: fonts.mono.medium,
    fontSize: 11,
    color: colors.teal,
  },
  domainText: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  quickActionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: spacing.md,
  },
  quickPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  quickPillActive: {
    backgroundColor: colors.tealDim,
    borderColor: colors.teal,
  },
  quickPillText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.silver,
  },
  description: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.silver,
    lineHeight: 20,
    marginBottom: spacing.md,
  },
  askCommandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  askCommandPressed: {
    opacity: 0.7,
    backgroundColor: 'rgba(0, 161, 155, 0.22)',
  },
  askCommandText: {
    flex: 1,
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.teal,
  },
  viewToggle: {
    flexDirection: 'row',
    gap: spacing.xs,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: 3,
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
    alignSelf: 'flex-start',
  },
  viewToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.sm,
  },
  viewToggleBtnActive: {
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  viewToggleText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.slate,
    letterSpacing: 0.3,
  },
  viewToggleTextActive: {
    color: colors.teal,
  },
  timelineSortRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.sm,
  },
  monthHeader: {
    paddingVertical: spacing.sm,
    paddingLeft: 26,
    marginBottom: 2,
  },
  monthHeaderText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 13,
    color: colors.alabaster,
    letterSpacing: 0.2,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timelineRail: {
    width: 14,
    alignItems: 'center',
    position: 'relative',
  },
  timelineRailLineTop: {
    position: 'absolute',
    top: 0,
    height: 10,
    width: 2,
    backgroundColor: colors.teal,
    opacity: 0.4,
  },
  timelineRailLineBottom: {
    position: 'absolute',
    top: 22,
    bottom: -spacing.md,
    width: 2,
    backgroundColor: colors.teal,
    opacity: 0.4,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.teal,
    borderWidth: 2,
    borderColor: colors.teal,
    marginTop: 10,
  },
  timelineCard: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
    gap: 2,
  },
  timelineDate: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.teal,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  timelinePredicate: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
    textTransform: 'capitalize',
    marginTop: 2,
  },
  timelineValue: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.silver,
    lineHeight: 16,
  },
  duplicatesCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  duplicatesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  duplicatesTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.statusPending,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  duplicateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  duplicateName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
  },
  duplicateMeta: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 2,
  },
  duplicateCompare: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.teal,
  },
  mergeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    backgroundColor: colors.tealDim,
    marginLeft: spacing.xs,
  },
  dismissBtn: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },
  mergeBtnText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 10,
    color: colors.teal,
    letterSpacing: 0.3,
  },
  topPredCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  topPredHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  topPredHeader: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
  },
  topPredClear: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.teal,
    letterSpacing: 0.3,
  },
  topPredRow: {
    paddingVertical: 6,
  },
  topPredRowActive: {
    // No background — just the teal predicate text tint handles the state.
  },
  topPredTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
  },
  topPredName: {
    fontFamily: fonts.mono.regular,
    fontSize: 12,
    color: colors.alabaster,
    flex: 1,
    marginRight: spacing.sm,
  },
  topPredCount: {
    fontFamily: fonts.mono.medium,
    fontSize: 12,
    color: colors.silver,
    fontVariant: ['tabular-nums'],
  },
  topPredTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  topPredFill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: 2,
  },
  heatmapGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  heatmapCell: {
    width: '23%',
    minWidth: 70,
    flexGrow: 1,
    borderRadius: radius.sm,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: 'center',
    gap: 2,
  },
  heatmapCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 16,
    fontVariant: ['tabular-nums'],
  },
  heatmapLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 8,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  staleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  staleText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.statusPending,
    letterSpacing: 0.3,
  },
  distCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  distHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  distLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  distTotal: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  distBars: {
    gap: 6,
  },
  distRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  distCat: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.silver,
    width: 80,
    textTransform: 'capitalize',
  },
  distTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  distFill: {
    height: '100%',
    borderRadius: 3,
  },
  distCount: {
    fontFamily: fonts.mono.medium,
    fontSize: 11,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
    width: 24,
    textAlign: 'right',
  },
  distPct: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
    width: 32,
    textAlign: 'right',
  },
  coverageCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  coverageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  coverageLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
  },
  coveragePct: {
    fontFamily: fonts.mono.semibold,
    fontSize: 20,
    fontVariant: ['tabular-nums'],
  },
  coverageTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  coverageFill: {
    height: '100%',
    borderRadius: 3,
  },
  coverageBreakdown: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: 4,
  },
  facetCell: {
    flex: 1,
    gap: 4,
  },
  facetLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  facetTrack: {
    height: 3,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  facetFill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: 2,
  },
  statsRow: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  stat: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  statValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 22,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 1,
  },
  statDivider: {
    width: 1,
    backgroundColor: colors.glassBorder,
    marginVertical: spacing.xs,
  },
  filterRow: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
    marginBottom: spacing.sm,
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
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
  sectionHeader: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.slate,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
    marginTop: spacing.xs,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
  },
  emptyTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 18,
    color: colors.silver,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
    textAlign: 'center',
  },
  activityBlock: {
    marginTop: spacing.lg,
    gap: spacing.xs,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  activityBody: {
    flex: 1,
  },
  activityAction: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.alabaster,
    textTransform: 'capitalize',
  },
  activityMeta: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 1,
  },
  connectionsBlock: {
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  connRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.xs,
  },
  connDirectionWrap: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  connBody: {
    flex: 1,
    gap: 2,
  },
  connName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  connPredicate: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.teal,
    textTransform: 'capitalize',
  },
  connCountChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  connCountText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: colors.silver,
    fontVariant: ['tabular-nums'],
  },
  listEmpty: {
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  listEmptyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
  },
});
