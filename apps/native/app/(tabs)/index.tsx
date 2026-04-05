import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePulseData } from '../../src/hooks/usePulseData';
import { usePushNotifications } from '../../src/hooks/usePushNotifications';
import { useTopEntities } from '../../src/hooks/useTopEntities';
import { PulseMetric } from '../../src/components/PulseMetric';
import { GlassCard } from '../../src/components/GlassCard';
import { SkeletonMetricCard } from '../../src/components/Skeleton';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

function QuickAction({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.quickActionCard, pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] }]}
    >
      <View style={styles.quickActionIcon}>
        <Ionicons name={icon} size={18} color={colors.teal} />
      </View>
      <Text style={styles.quickActionLabel}>{label}</Text>
    </Pressable>
  );
}

function formatLastUpdated(at: Date, _tick: number): string {
  const diffMs = Date.now() - at.getTime();
  const sec = Math.max(0, Math.floor(diffMs / 1000));
  if (sec < 10) return 'just now';
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return at.toLocaleTimeString();
}

export default function PulseScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data, loading, error, refresh, lastUpdatedAt } = usePulseData();
  const topEntities = useTopEntities(5);
  const [refreshing, setRefreshing] = React.useState(false);
  const [nowTick, setNowTick] = React.useState(0);

  usePushNotifications();

  // Re-render the "last updated" label every 30s so the relative time stays fresh
  React.useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + spacing.lg },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.teal}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Pulse</Text>
          <View style={styles.liveColumn}>
            <View style={styles.liveIndicator}>
              <View style={styles.liveDot} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
            {lastUpdatedAt && (
              <Text style={styles.lastUpdated}>
                {formatLastUpdated(lastUpdatedAt, nowTick)}
              </Text>
            )}
          </View>
        </View>

        <Text style={styles.headerSub}>StroomHelix Intelligence Graph</Text>

        {loading && !data ? (
          <>
            <View style={styles.grid}>
              <SkeletonMetricCard />
              <SkeletonMetricCard />
            </View>
            <View style={styles.grid}>
              <SkeletonMetricCard />
              <SkeletonMetricCard />
            </View>
            <View style={styles.grid}>
              <SkeletonMetricCard />
              <SkeletonMetricCard />
              <SkeletonMetricCard />
            </View>
          </>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : data ? (
          <>
            {/* Primary metrics — 2-column grid */}
            <View style={styles.grid}>
              <PulseMetric
                label="Claims"
                value={data.totalClaims}
                onPress={() => router.push('/(tabs)/explore' as any)}
              />
              <PulseMetric label="Entities" value={data.totalEntities} />
            </View>

            <View style={styles.grid}>
              <PulseMetric
                label="Sources"
                value={data.totalSources}
                onPress={() => router.push('/sources' as any)}
              />
              <PulseMetric
                label="Queue"
                value={data.queueDepth}
                accent={data.queueDepth > 0 ? colors.statusPending : colors.teal}
                onPress={() => router.push('/(tabs)/queue' as any)}
              />
            </View>

            {/* Secondary metrics */}
            <View style={styles.grid}>
              <PulseMetric
                label="Today"
                value={data.claimsToday}
                accent={colors.statusInfo}
                compact
              />
              <PulseMetric
                label="Research"
                value={data.researchActive}
                accent={data.researchActive > 0 ? colors.statusInfo : colors.teal}
                compact
              />
              <PulseMetric
                label="Budget"
                value={data.budgetSpendUsd.toFixed(2)}
                prefix="$"
                compact
              />
            </View>

            {/* Status breakdown */}
            {data.statusBreakdown && Object.keys(data.statusBreakdown).length > 0 && (
              <GlassCard style={styles.breakdownCard}>
                <Text style={styles.breakdownTitle}>Status Breakdown</Text>
                <View style={styles.breakdownGrid}>
                  {Object.entries(data.statusBreakdown)
                    .sort(([, a], [, b]) => (b as number) - (a as number))
                    .map(([status, count]) => (
                      <View key={status} style={styles.breakdownRow}>
                        <View style={styles.breakdownDot}>
                          <View
                            style={[
                              styles.dot,
                              {
                                backgroundColor:
                                  status === 'published'
                                    ? colors.statusApprove
                                    : status === 'draft'
                                    ? colors.statusPending
                                    : status === 'approved'
                                    ? colors.statusInfo
                                    : status === 'superseded'
                                    ? colors.slate
                                    : colors.teal,
                              },
                            ]}
                          />
                          <Text style={styles.breakdownLabel}>
                            {status.replace(/_/g, ' ')}
                          </Text>
                        </View>
                        <Text style={styles.breakdownValue}>
                          {(count as number).toLocaleString()}
                        </Text>
                      </View>
                    ))}
                </View>
              </GlassCard>
            )}

            {/* Top Entities */}
            {(topEntities.entities.length > 0 || topEntities.loading) && (
              <GlassCard style={styles.topEntitiesCard}>
                <Text style={styles.breakdownTitle}>Top Entities</Text>
                {topEntities.loading && topEntities.entities.length === 0 ? (
                  <View style={{ gap: spacing.sm }}>
                    <View style={styles.topEntitySkeletonRow} />
                    <View style={styles.topEntitySkeletonRow} />
                    <View style={styles.topEntitySkeletonRow} />
                  </View>
                ) : (
                  topEntities.entities.map((e, idx) => (
                    <Pressable
                      key={e.id}
                      onPress={() =>
                        router.push({
                          pathname: '/entity/[id]',
                          params: { id: e.id },
                        } as any)
                      }
                      style={({ pressed }) => [
                        styles.topEntityRow,
                        idx > 0 && styles.topEntityRowDivider,
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <Text style={styles.topEntityRank}>{idx + 1}</Text>
                      <View style={styles.topEntityBody}>
                        <Text style={styles.topEntityName} numberOfLines={1}>
                          {e.canonical_name ?? 'Unknown entity'}
                        </Text>
                        {e.entity_type && (
                          <Text style={styles.topEntityType}>{e.entity_type}</Text>
                        )}
                      </View>
                      <Text style={styles.topEntityCount}>{e.claim_count}</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={13}
                        color={colors.slate}
                      />
                    </Pressable>
                  ))
                )}
              </GlassCard>
            )}

            {/* Quick Actions */}
            <Text style={styles.sectionHeader}>QUICK ACTIONS</Text>
            <View style={styles.quickActions}>
              <QuickAction
                icon="layers-outline"
                label="Review Queue"
                onPress={() => router.push('/(tabs)/queue' as any)}
              />
              <QuickAction
                icon="sparkles-outline"
                label="Ask Claude"
                onPress={() => router.push('/(tabs)/command' as any)}
              />
              <QuickAction
                icon="search-outline"
                label="Search Graph"
                onPress={() => router.push('/(tabs)/explore' as any)}
              />
            </View>

            {/* Daily digest link */}
            <Pressable
              onPress={() => router.push('/digest' as any)}
              style={({ pressed }) => [
                styles.digestBtn,
                pressed && { opacity: 0.75 },
              ]}
            >
              <Ionicons name="calendar-outline" size={16} color={colors.teal} />
              <Text style={styles.digestText}>Today's Digest</Text>
              <Ionicons name="chevron-forward" size={14} color={colors.slate} />
            </Pressable>

            {/* Timestamp */}
            <Text style={styles.timestamp}>
              Last updated {new Date().toLocaleTimeString()}
            </Text>
          </>
        ) : null}
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: spacing.xs,
  },
  liveColumn: {
    alignItems: 'flex-end',
    gap: 4,
    paddingTop: 8,
  },
  lastUpdated: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
  },
  headerTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.alabaster,
    letterSpacing: -0.8,
  },
  liveIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 161, 155, 0.1)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 100,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.2)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.teal,
  },
  liveText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.teal,
    letterSpacing: 1.5,
  },
  headerSub: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  loadingWrap: {
    paddingTop: 80,
    alignItems: 'center',
  },
  errorWrap: {
    paddingTop: 40,
    alignItems: 'center',
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
    textAlign: 'center',
  },
  breakdownCard: {
    marginTop: spacing.sm,
  },
  topEntitiesCard: {
    marginTop: spacing.sm,
  },
  topEntityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
  },
  topEntityRowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  topEntityRank: {
    width: 22,
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
    textAlign: 'center',
  },
  topEntityBody: {
    flex: 1,
    gap: 2,
  },
  topEntityName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  topEntityType: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  topEntityCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  topEntitySkeletonRow: {
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  breakdownTitle: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  breakdownGrid: {
    gap: spacing.sm,
  },
  breakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  breakdownDot: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  breakdownLabel: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.silver,
    textTransform: 'capitalize',
  },
  breakdownValue: {
    fontFamily: fonts.mono.medium,
    fontSize: 14,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  timestamp: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    textAlign: 'center',
    marginTop: spacing.lg,
    fontVariant: ['tabular-nums'],
  },
  sectionHeader: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  quickActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  quickActionCard: {
    flex: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.25)',
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    alignItems: 'center',
    gap: 8,
  },
  quickActionIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickActionLabel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.alabaster,
    textAlign: 'center',
    letterSpacing: -0.1,
  },
  digestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    borderRadius: radius.md,
    paddingVertical: 12,
    paddingHorizontal: spacing.md,
    marginTop: spacing.md,
  },
  digestText: {
    flex: 1,
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.teal,
  },
});
