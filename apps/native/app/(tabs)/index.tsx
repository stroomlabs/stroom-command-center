import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { usePulseContext } from '../../src/lib/PulseContext';
import { usePulseDeltas } from '../../src/hooks/usePulseDeltas';
import { usePushNotifications } from '../../src/hooks/usePushNotifications';
import supabase from '../../src/lib/supabase';
import { PulseMetric } from '../../src/components/PulseMetric';
import { GlassCard } from '../../src/components/GlassCard';
import { SkeletonMetricCard } from '../../src/components/Skeleton';
import { GlowSpot } from '../../src/components/GlowSpot';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import { RetryCard } from '../../src/components/RetryCard';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

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
  const navigation = useNavigation();
  const scrollRef = React.useRef<ScrollView>(null);
  const { data, loading, error, refresh, lastUpdatedAt } = usePulseContext();
  const { deltas } = usePulseDeltas();
  const [refreshing, setRefreshing] = React.useState(false);
  const [nowTick, setNowTick] = React.useState(0);

  // Tap-active-tab scroll-to-top — the Tabs navigator fires `tabPress` on
  // the focused screen even when it's already active, so we just listen and
  // snap back to the top.
  React.useEffect(() => {
    const unsub = (navigation as any).addListener?.('tabPress', () => {
      if ((navigation as any).isFocused?.()) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    });
    return unsub;
  }, [navigation]);

  usePushNotifications();

  // Realtime signal for the Claims metric. We listen for Postgres INSERT
  // events on intel.claims and bump `claimFlashKey` to retrigger the
  // PulseMetric border flash + count animation. usePulseData already
  // refreshes on the broadcast channel, which updates data.totalClaims;
  // this subscription only drives the visual pulse.
  const [claimFlashKey, setClaimFlashKey] = React.useState(0);
  React.useEffect(() => {
    const channel = supabase
      .channel('pulse:claims-inserts')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'intel', table: 'claims' },
        () => {
          setClaimFlashKey((k) => k + 1);
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  // LIVE dot — 2s pulse cycle (scale 1 → 1.35 and opacity 1 → 0.55)
  const livePulse = useSharedValue(0);
  React.useEffect(() => {
    livePulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 1000, easing: Easing.inOut(Easing.ease) }),
        withTiming(0, { duration: 1000, easing: Easing.inOut(Easing.ease) })
      ),
      -1,
      false
    );
  }, [livePulse]);
  const liveDotStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + livePulse.value * 0.35 }],
    opacity: 1 - livePulse.value * 0.45,
  }));

  // Re-render the "last updated" label every 30s so the relative time stays fresh
  React.useEffect(() => {
    const id = setInterval(() => setNowTick((t) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <ScreenTransition>
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      {/* Atmospheric glow spots — behind metrics + status breakdown */}
      <GlowSpot size={520} opacity={0.08} top={insets.top + 40} left={-120} breathe />
      <GlowSpot size={360} opacity={0.06} top={insets.top + 480} right={-100} breathe />

      <ScrollView
        ref={scrollRef}
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
          <View style={styles.headerRight}>
            <Pressable
              onPress={() => router.push('/notifications' as any)}
              hitSlop={10}
              style={({ pressed }) => [
                styles.bellBtn,
                pressed && { opacity: 0.6, transform: [{ scale: 0.97 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Open notifications"
            >
              <Ionicons
                name="notifications-outline"
                size={20}
                color={colors.silver}
              />
            </Pressable>
            <View style={styles.liveColumn}>
              <View style={styles.liveIndicator}>
                <Animated.View style={[styles.liveDot, liveDotStyle]} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
              {lastUpdatedAt && (
                <Text style={styles.lastUpdated}>
                  {formatLastUpdated(lastUpdatedAt, nowTick)}
                </Text>
              )}
            </View>
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
            <RetryCard
              message="Couldn't load Pulse"
              detail={error}
              onRetry={refresh}
            />
          </View>
        ) : data ? (
          <>
            {/* Primary metrics — 2-column grid */}
            <View style={styles.grid}>
              <PulseMetric
                label="Claims"
                value={data.totalClaims}
                animate
                flashKey={claimFlashKey}
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

            {/* Since last visit — RPC-backed delta summary */}
            {deltas && (
              <Animated.Text
                entering={FadeIn.duration(240)}
                style={styles.deltaRow}
              >
                Since last visit: +{deltas.claims_ingested.toLocaleString()} claims
                {' · +'}
                {deltas.new_entities.toLocaleString()} entities
                {' · '}
                {deltas.claims_auto_approved.toLocaleString()} auto-approved
              </Animated.Text>
            )}

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
            {lastUpdatedAt && (
              <Text style={styles.timestamp}>
                Last updated {formatLastUpdated(lastUpdatedAt, nowTick)}
              </Text>
            )}
          </>
        ) : null}
      </ScrollView>
    </LinearGradient>
    </ScreenTransition>
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
  headerRight: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingTop: 6,
  },
  bellBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    justifyContent: 'center',
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
    color: colors.teal,
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
  deltaRow: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.silver,
    marginTop: spacing.sm,
    marginBottom: spacing.xs,
    letterSpacing: 0.1,
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
