import React from 'react';
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { haptics } from '../../src/lib/haptics';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  useAnimatedScrollHandler,
  interpolate,
  Extrapolation,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
} from 'react-native-reanimated';
import { usePulseContext } from '../../src/lib/PulseContext';
import { VERTICAL_BUCKETS, VERTICAL_ORDER } from '../../src/lib/verticals';
import { useGraphHealth } from '../../src/hooks/useGraphHealth';
import { useWatchlist, type WatchedEntity } from '../../src/hooks/useWatchlist';
import { useClaimSparkline } from '../../src/hooks/useClaimSparkline';
import { Sparkline } from '../../src/components/Sparkline';
import { ScreenCanvas } from '../../src/components/ScreenCanvas';
import { ScreenWatermark } from '../../src/components/ScreenWatermark';
import { useOfflineSync } from '../../src/lib/OfflineSyncContext';
import { usePulseDeltas } from '../../src/hooks/usePulseDeltas';
import { usePushNotifications } from '../../src/hooks/usePushNotifications';
import supabase from '../../src/lib/supabase';
import { runAutoGovernance } from '@stroom/supabase';
import * as Clipboard from 'expo-clipboard';
import { useBrandToast } from '../../src/components/BrandToast';
import { PulseMetric } from '../../src/components/PulseMetric';
import { GlassCard } from '../../src/components/GlassCard';
import { SkeletonMetricCard } from '../../src/components/Skeleton';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import { RetryCard } from '../../src/components/RetryCard';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

function QuickActionPill({
  icon,
  label,
  onPress,
  disabled,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        quickActionStyles.pill,
        (pressed || disabled) && {
          opacity: disabled ? 0.5 : 0.75,
          transform: [{ scale: 0.97 }],
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={14} color={colors.teal} />
      <Text style={quickActionStyles.label}>{label}</Text>
    </Pressable>
  );
}

const quickActionStyles = StyleSheet.create({
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.teal,
    backgroundColor: 'rgba(0, 161, 155, 0.08)',
  },
  label: {
    fontFamily: fonts.archivo.bold,
    fontSize: 12,
    color: colors.teal,
    letterSpacing: 0.3,
  },
});

// iOS Maps-style vertical toggle pill. Inactive is a 28pt icon-only circle;
// active expands smoothly to ~90pt wide showing icon + label. Width and
// label opacity are driven by reanimated shared values so transitions
// between the old/new active pill happen in the same 200ms tick.
const PILL_INACTIVE_SIZE = 28;
const PILL_ACTIVE_WIDTH = 90;

function VerticalPill({
  label,
  icon,
  active,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  active: boolean;
  onPress: () => void;
}) {
  const width = useSharedValue(active ? PILL_ACTIVE_WIDTH : PILL_INACTIVE_SIZE);
  const labelOpacity = useSharedValue(active ? 1 : 0);

  React.useEffect(() => {
    width.value = withTiming(active ? PILL_ACTIVE_WIDTH : PILL_INACTIVE_SIZE, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
    labelOpacity.value = withTiming(active ? 1 : 0, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [active, width, labelOpacity]);

  const containerStyle = useAnimatedStyle(() => ({
    width: width.value,
  }));
  const labelStyle = useAnimatedStyle(() => ({
    opacity: labelOpacity.value,
  }));

  return (
    <Animated.View
      style={[
        verticalPillStyles.pill,
        active && verticalPillStyles.pillActive,
        containerStyle,
      ]}
    >
      <Pressable
        onPress={onPress}
        style={verticalPillStyles.press}
        accessibilityRole="button"
        accessibilityState={{ selected: active }}
        accessibilityLabel={`Filter Pulse by ${label}`}
        hitSlop={4}
      >
        <Ionicons
          name={icon}
          size={14}
          color={active ? colors.teal : colors.silver}
        />
        {active && (
          <Animated.Text
            numberOfLines={1}
            allowFontScaling={false}
            style={[verticalPillStyles.label, labelStyle]}
          >
            {label}
          </Animated.Text>
        )}
      </Pressable>
    </Animated.View>
  );
}

const verticalPillStyles = StyleSheet.create({
  pill: {
    height: PILL_INACTIVE_SIZE,
    borderRadius: PILL_INACTIVE_SIZE / 2,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceElevated,
    overflow: 'hidden',
  },
  pillActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealDim,
  },
  press: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6,
  },
  label: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.teal,
    letterSpacing: 0.2,
  },
});

function WatchlistCard({
  entity,
  claimCount,
  onPress,
}: {
  entity: WatchedEntity;
  claimCount: number;
  onPress: () => void;
}) {
  const sparkData = useClaimSparkline(entity.id);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        watchStyles.card,
        pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${entity.canonical_name}, ${claimCount} claims`}
    >
      <View style={watchStyles.cardTopRow}>
        <Text style={watchStyles.name} numberOfLines={1}>
          {entity.canonical_name}
        </Text>
        {sparkData.length > 1 && (
          <Sparkline data={sparkData} width={48} height={20} />
        )}
      </View>
      <View style={watchStyles.meta}>
        {entity.domain && (
          <View style={watchStyles.domainBadge}>
            <Text style={watchStyles.domainText}>{entity.domain}</Text>
          </View>
        )}
        <Text style={watchStyles.count}>
          {claimCount.toLocaleString()}
        </Text>
      </View>
    </Pressable>
  );
}

function WatchlistSection() {
  const router = useRouter();
  const { list } = useWatchlist();
  const [counts, setCounts] = React.useState<Map<string, number>>(new Map());

  React.useEffect(() => {
    if (list.length === 0) return;
    let cancelled = false;
    Promise.all(
      list.map(async (e) => {
        const { count } = await supabase
          .schema('intel')
          .from('claims')
          .select('id', { count: 'exact', head: true })
          .eq('subject_entity_id', e.id);
        return [e.id, count ?? 0] as [string, number];
      })
    ).then((entries) => {
      if (!cancelled) setCounts(new Map(entries));
    });
    return () => { cancelled = true; };
  }, [list]);

  if (list.length === 0) return null;

  return (
    <View style={watchStyles.wrap}>
      <Text style={watchStyles.header}>WATCHING</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={watchStyles.scroll}
      >
        {list.map((e) => (
          <WatchlistCard
            key={e.id}
            entity={e}
            claimCount={counts.get(e.id) ?? 0}
            onPress={() =>
              router.push({
                pathname: '/entity/[id]',
                params: { id: e.id },
              } as any)
            }
          />
        ))}
      </ScrollView>
    </View>
  );
}

const watchStyles = StyleSheet.create({
  wrap: {
    marginTop: spacing.sm,
  },
  header: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  scroll: {
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    minWidth: 120,
    maxWidth: 180,
  },
  cardTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  name: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
    marginBottom: 4,
  },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  domainBadge: {
    backgroundColor: colors.tealDim,
    borderRadius: radius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  domainText: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    color: colors.teal,
  },
  count: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: colors.silver,
    fontVariant: ['tabular-nums'],
  },
});

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
  const {
    data,
    loading,
    error,
    refresh,
    lastUpdatedAt,
    verticalKey,
    setVertical,
  } = usePulseContext();

  // Bump the claim flash key whenever the vertical selection changes so
  // the metric cards fire their teal glow pulse on the new values.
  React.useEffect(() => {
    setClaimFlashKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verticalKey]);
  const { health } = useGraphHealth();

  // Pull-down stats peek — reveals a hidden panel above the content when
  // the user overscrolls past 80px. The panel slides down proportionally
  // and snaps back on release.
  const overscrollY = useSharedValue(0);
  const peekScrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      // Negative contentOffset.y means overscroll on iOS
      overscrollY.value = Math.max(0, -e.contentOffset.y);
    },
  });
  const peekPanelStyle = useAnimatedStyle(() => {
    const ty = interpolate(
      overscrollY.value,
      [0, 80, 160],
      [-60, 0, 10],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      overscrollY.value,
      [0, 60, 80],
      [0, 0, 1],
      Extrapolation.CLAMP
    );
    return { transform: [{ translateY: ty }], opacity };
  });
  const { pendingCount: pendingSyncCount, syncNow } = useOfflineSync();
  const { show: showToast } = useBrandToast();
  const { deltas } = usePulseDeltas();
  const [sweeping, setSweeping] = React.useState(false);
  const [lastSweepResult, setLastSweepResult] = React.useState<{
    approved: number;
    flagged: number;
    rejected: number;
  } | null>(null);

  const handleSweep = React.useCallback(async () => {
    if (sweeping) return;
    haptics.tap.medium();
    setSweeping(true);
    try {
      const result = await runAutoGovernance(supabase);
      setLastSweepResult(result);
      haptics.success();
      // Pulse refetch so totalClaims + queueDepth (and the Queue tab
      // badge via PulseContext) reflect the post-sweep state.
      await refresh();
    } catch {
      haptics.error();
    } finally {
      setSweeping(false);
    }
  }, [sweeping, refresh]);
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
  //
  // The channel name needs a per-mount unique suffix because Supabase
  // Realtime's channel registry is keyed by name. Under React Strict
  // Mode (dev), the component mounts → cleans up → remounts; the
  // cleanup's removeChannel is async, so the second mount can hit a
  // channel that's still in the "subscribed" state in the registry,
  // triggering "cannot add callbacks after subscribe()". A unique
  // suffix per mount sidesteps the collision.
  const [claimFlashKey, setClaimFlashKey] = React.useState(0);
  const claimChannelNameRef = React.useRef(
    `pulse:claims-inserts:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  React.useEffect(() => {
    const channel = supabase
      .channel(claimChannelNameRef.current)
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
    haptics.tap.light();
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <ScreenWatermark />
      <ScreenTransition>

      {/* Pull-down stats peek panel — hidden above the scroll area */}
      <Animated.View style={[peekStyles.panel, peekPanelStyle]} pointerEvents="none">
        <View style={peekStyles.row}>
          <View style={peekStyles.pill}>
            <Text style={peekStyles.pillLabel}>CORRECTION</Text>
            <Text style={peekStyles.pillValue}>
              {((data?.correctionRate ?? 0) * 100).toFixed(1)}%
            </Text>
          </View>
          <View style={peekStyles.pill}>
            <Text style={peekStyles.pillLabel}>AVG TRUST</Text>
            <Text style={peekStyles.pillValue}>
              {health ? Number(health.avg_trust_score ?? 0).toFixed(1) : '—'}
            </Text>
          </View>
          <View style={peekStyles.pill}>
            <Text style={peekStyles.pillLabel}>PREDICATES</Text>
            <Text style={peekStyles.pillValue}>
              {(data?.totalSources ?? 0).toLocaleString()}
            </Text>
          </View>
          <View style={peekStyles.pill}>
            <Text style={peekStyles.pillLabel}>CLAIMS/DAY</Text>
            <Text style={peekStyles.pillValue}>
              {data?.claimsToday ?? 0}
            </Text>
          </View>
        </View>
      </Animated.View>

      <Animated.ScrollView
        ref={scrollRef as any}
        onScroll={peekScrollHandler}
        scrollEventThrottle={16}
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

        {/* Vertical toggle — 6 buckets (All / Racing / Sports / Cruises /
            Parks / Other), persisted to AsyncStorage. Changing the selection
            refetches get_command_pulse with the new domains[] filter and
            triggers a pulse-flash on the metric grid.
            iOS Maps pattern: inactive pills collapse to a 28pt icon-only
            circle, the active pill expands to ~90pt to show its label. All
            6 pills fit on a 375pt screen without horizontal scrolling. */}
        <View style={styles.verticalRow}>
          {VERTICAL_ORDER.map((key) => {
            const bucket = VERTICAL_BUCKETS[key];
            const active = verticalKey === key;
            return (
              <VerticalPill
                key={key}
                label={bucket.label}
                icon={bucket.icon as keyof typeof Ionicons.glyphMap}
                active={active}
                onPress={() => {
                  if (active) return;
                  haptics.tap.light();
                  void setVertical(key);
                }}
              />
            );
          })}
        </View>

        {pendingSyncCount > 0 && (
          <Pressable
            onPress={syncNow}
            accessibilityRole="button"
            accessibilityLabel={`${pendingSyncCount} pending action${pendingSyncCount === 1 ? '' : 's'} waiting to sync. Tap to retry.`}
            style={({ pressed }) => [
              styles.pendingSyncBanner,
              pressed && { opacity: 0.8, transform: [{ scale: 0.99 }] },
            ]}
          >
            <Ionicons
              name="cloud-upload-outline"
              size={14}
              color={colors.statusPending}
            />
            <Text style={styles.pendingSyncText}>
              {pendingSyncCount} pending action{pendingSyncCount === 1 ? '' : 's'} — tap to sync
            </Text>
          </Pressable>
        )}

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
                borderAccent={colors.teal}
                onPress={() => router.push('/(tabs)/explore' as any)}
              />
              <PulseMetric
                label="Entities"
                value={data.totalEntities}
                borderAccent="#6366F1"
                onPress={() => router.push('/(tabs)/explore' as any)}
              />
            </View>

            <View style={styles.grid}>
              <PulseMetric
                label="Sources"
                value={data.totalSources}
                borderAccent="#22C55E"
                onPress={() => router.push('/sources' as any)}
              />
              <PulseMetric
                label="Queue"
                value={data.queueDepth}
                accent={data.queueDepth > 0 ? colors.statusPending : colors.teal}
                borderAccent={data.queueDepth > 0 ? '#FBBF24' : colors.slate}
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

            {/* Quick sweep — same RPC as Ops, surfaced on Pulse so the
                most-used action is one tap from the home tab. */}
            <Pressable
              onPress={handleSweep}
              disabled={sweeping}
              style={({ pressed }) => [
                styles.sweepBtn,
                (pressed || sweeping) && { opacity: 0.75, transform: [{ scale: 0.98 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Run governance sweep"
            >
              {sweeping ? (
                <ActivityIndicator size="small" color={colors.teal} />
              ) : (
                <Ionicons name="sparkles" size={16} color={colors.teal} />
              )}
              <Text style={styles.sweepBtnText}>
                {sweeping ? 'Running sweep…' : 'Run Sweep'}
              </Text>
            </Pressable>
            {lastSweepResult && !sweeping && (
              <Animated.Text
                entering={FadeIn.duration(240)}
                style={styles.sweepResult}
              >
                ✓ {lastSweepResult.approved} approved ·{' '}
                {lastSweepResult.flagged} flagged
                {lastSweepResult.rejected > 0
                  ? ` · ${lastSweepResult.rejected} rejected`
                  : ''}
              </Animated.Text>
            )}

            {/* Quick Actions — one-tap pills for the three most common
                operator moves. "New Sweep" shares the same RPC as the
                full sweep button above; the other two are navigation
                and an inline clipboard export. */}
            <View style={styles.quickActionsRow}>
              <QuickActionPill
                icon="search-outline"
                label="Explore"
                onPress={() => {
                  haptics.tap.light();
                  router.push('/(tabs)/explore' as any);
                }}
              />
              <QuickActionPill
                icon="sparkles-outline"
                label="New Sweep"
                onPress={handleSweep}
                disabled={sweeping}
              />
              <QuickActionPill
                icon="share-outline"
                label="Export"
                onPress={async () => {
                  haptics.tap.light();
                  try {
                    const lines = [
                      'STROOM COMMAND CENTER — GRAPH SUMMARY',
                      `Generated: ${new Date().toLocaleString()}`,
                      '',
                      '── Graph totals ──',
                      `Claims:    ${(data.totalClaims ?? 0).toLocaleString()}`,
                      `Entities:  ${(data.totalEntities ?? 0).toLocaleString()}`,
                      `Sources:   ${(data.totalSources ?? 0).toLocaleString()}`,
                      '',
                      '── Governance ──',
                      `Queue depth:     ${data.queueDepth ?? 0}`,
                      `Correction rate: ${((data.correctionRate ?? 0) * 100).toFixed(1)}%`,
                      `Research active: ${data.researchActive ?? 0}`,
                      `Claims today:    ${data.claimsToday ?? 0}`,
                    ];
                    await Clipboard.setStringAsync(lines.join('\n'));
                    haptics.success();
                    showToast('Copied to clipboard', 'success');
                  } catch (e: any) {
                    showToast(e?.message ?? 'Export failed', 'error');
                  }
                }}
              />
            </View>

            {/* Watched entities — personal dashboard of entities the
                operator cares about, populated from the entity detail
                Watch toggle. */}
            <WatchlistSection />

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
      </Animated.ScrollView>
    </ScreenTransition>
    </View>
  );
}

const peekStyles = StyleSheet.create({
  panel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: '#050507',
  },
  row: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  pillLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 8,
    color: colors.slate,
    letterSpacing: 0.8,
    marginBottom: 2,
  },
  pillValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    color: colors.silver,
    fontVariant: ['tabular-nums'],
  },
});

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
    marginBottom: spacing.md,
  },
  verticalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.lg,
  },
  pendingSyncBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginTop: -spacing.md,
    marginBottom: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    backgroundColor: 'rgba(245, 158, 11, 0.10)',
  },
  pendingSyncText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.statusPending,
    letterSpacing: 0.1,
    flex: 1,
  },
  grid: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 12,
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
  sweepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: 'rgba(0, 161, 155, 0.08)',
    borderWidth: 1,
    borderColor: colors.teal,
    marginTop: spacing.sm,
  },
  sweepBtnText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 13,
    color: colors.teal,
    letterSpacing: 0.3,
  },
  sweepResult: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.silver,
    textAlign: 'center',
    marginTop: 6,
    marginBottom: spacing.xs,
  },
  quickActionsRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
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
