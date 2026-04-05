import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useEntityDetail } from '../../src/hooks/useEntityDetail';
import { useSimilarEntities } from '../../src/hooks/useSimilarEntities';
import { ClaimListItem } from '../../src/components/ClaimListItem';
import { EntityCompareSheet } from '../../src/components/EntityCompareSheet';
import type { EntityClaim, EntityConnection } from '@stroom/supabase';
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
  const { similar } = useSimilarEntities(
    entity?.id,
    entity?.canonical_name ?? entity?.name
  );
  const [compareId, setCompareId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'list' | 'timeline'>('list');
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const filtered =
    filter === 'all'
      ? claims
      : claims.filter((c) => c.status === (filter as ClaimStatus));

  // Sorted by created_at descending for the timeline view
  const timelineOrdered = React.useMemo(
    () =>
      [...filtered].sort(
        (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      ),
    [filtered]
  );

  const renderItem = useCallback(
    ({ item, index }: { item: EntityClaim; index: number }) => {
      const handlePress = () =>
        router.push({
          pathname: '/claim/[id]',
          params: { id: item.id },
        } as any);
      if (viewMode === 'timeline') {
        return (
          <TimelineRow
            claim={item}
            onPress={handlePress}
            isFirst={index === 0}
            isLast={index === timelineOrdered.length - 1}
          />
        );
      }
      return <ClaimListItem claim={item} onPress={handlePress} />;
    },
    [router, viewMode, timelineOrdered.length]
  );

  const keyExtractor = useCallback((item: EntityClaim) => item.id, []);

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      {/* Header with back button */}
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Explore</Text>
        </Pressable>
      </View>

      {loading && !entity ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !entity ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyTitle}>Entity not found</Text>
        </View>
      ) : (
        <FlatList
          data={viewMode === 'timeline' ? timelineOrdered : filtered}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
          ListHeaderComponent={
            <View style={styles.headerBlock}>
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

              {/* Ask Command */}
              <Pressable
                onPress={() => {
                  const name = entity.canonical_name || entity.name || 'this entity';
                  router.push({
                    pathname: '/(tabs)/command',
                    params: { prompt: `Tell me about ${name}` },
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
              <CoverageScore claims={claims} />

              {/* Possible duplicates */}
              {similar.length > 0 && (
                <View style={styles.duplicatesCard}>
                  <View style={styles.duplicatesHeader}>
                    <Ionicons name="git-compare-outline" size={14} color={colors.statusPending} />
                    <Text style={styles.duplicatesTitle}>Possible Duplicates</Text>
                  </View>
                  {similar.map((s) => (
                    <Pressable
                      key={s.id}
                      onPress={() => setCompareId(s.id)}
                      style={({ pressed }) => [
                        styles.duplicateRow,
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.duplicateName} numberOfLines={1}>
                          {s.canonical_name ?? '—'}
                        </Text>
                        <Text style={styles.duplicateMeta}>
                          {s.entity_type ?? 'entity'} · edit distance {s.distance}
                        </Text>
                      </View>
                      <Text style={styles.duplicateCompare}>Compare</Text>
                      <Ionicons name="chevron-forward" size={12} color={colors.slate} />
                    </Pressable>
                  ))}
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
            </View>
          }
          ListEmptyComponent={
            <View style={styles.listEmpty}>
              <Text style={styles.listEmptyText}>No claims in this view.</Text>
            </View>
          }
          ListFooterComponent={
            connections.length > 0 ? (
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
              </View>
            ) : null
          }
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

  return (
    <View style={styles.timelineRow}>
      <View style={styles.timelineRail}>
        <View
          style={[
            styles.timelineRailLine,
            { top: 0, height: isFirst ? '50%' : '100%' },
            isFirst && { top: '50%' },
          ]}
        />
        <View style={styles.timelineDot} />
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

function CoverageScore({ claims }: { claims: EntityClaim[] }) {
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
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
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
    fontSize: 28,
    color: colors.alabaster,
    letterSpacing: -0.6,
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
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timelineRail: {
    width: 14,
    alignItems: 'center',
    position: 'relative',
  },
  timelineRailLine: {
    position: 'absolute',
    width: 2,
    backgroundColor: colors.glassBorder,
  },
  timelineRailLineBottom: {
    position: 'absolute',
    top: 16,
    bottom: -spacing.md,
    width: 2,
    backgroundColor: colors.glassBorder,
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.teal,
    borderWidth: 2,
    borderColor: colors.obsidian,
    marginTop: 8,
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
