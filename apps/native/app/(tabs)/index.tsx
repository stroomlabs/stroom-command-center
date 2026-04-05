import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { usePulseData } from '../../src/hooks/usePulseData';
import { usePushNotifications } from '../../src/hooks/usePushNotifications';
import { PulseMetric } from '../../src/components/PulseMetric';
import { GlassCard } from '../../src/components/GlassCard';
import { colors, fonts, spacing, gradient } from '../../src/constants/brand';

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
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.teal} size="large" />
          </View>
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
});
