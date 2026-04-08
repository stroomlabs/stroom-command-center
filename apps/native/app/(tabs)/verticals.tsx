import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { ScreenCanvas } from '../../src/components/ScreenCanvas';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import { GlassCard } from '../../src/components/GlassCard';
import { EmptyState } from '../../src/components/EmptyState';
import { useVerticalSummary, type VerticalSummaryRow } from '../../src/hooks/useVerticalSummary';
import {
  VERTICAL_BUCKETS,
  bucketForDomain,
  setVerticalSelection,
  type VerticalKey,
} from '../../src/lib/verticals';
import { haptics } from '../../src/lib/haptics';
import { colors, fonts, spacing, radius } from '../../src/constants/brand';

// Aggregated bucket totals for a single grouped card.
interface BucketAggregate {
  key: VerticalKey;
  label: string;
  icon: string;
  entityCount: number;
  claimCount: number;
  queueDepth: number;
  lastActivityAt: string | null;
  domainCount: number;
}

// Cards are rendered in this order. 'all' is intentionally excluded — the
// Verticals tab only shows the four grouped verticals.
const CARD_ORDER: VerticalKey[] = [
  'racing',
  'intelligence',
  'vacations',
  'parks',
];

export default function VerticalsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { rows, loading, error, refresh } = useVerticalSummary();
  const [refreshing, setRefreshing] = React.useState(false);

  const aggregates = useMemo(() => groupByBucket(rows), [rows]);

  const handleRefresh = async () => {
    haptics.tap.light();
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleCardPress = async (key: VerticalKey) => {
    haptics.tap.medium();
    // Persist the selection first, then navigate to Pulse. The Pulse
    // screen reads the selection from AsyncStorage via useVerticalSelection
    // and refetches with the new domains[] filter automatically.
    await setVerticalSelection(key);
    router.push('/(tabs)' as any);
  };

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <ScreenTransition>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + spacing.lg,
              paddingBottom: insets.bottom + spacing.xl,
            },
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
          <Text style={styles.headerTitle}>Verticals</Text>
          <Text style={styles.headerSub}>
            Grouped view of the StroomHelix intelligence graph
          </Text>

          {loading && aggregates.length === 0 ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color={colors.teal} />
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : aggregates.length === 0 ? (
            <EmptyState
              icon="grid-outline"
              title="No vertical data"
              subtitle="get_vertical_summary returned no rows"
              compact
            />
          ) : (
            <View style={styles.grid}>
              {aggregates.map((bucket) => (
                <VerticalCard
                  key={bucket.key}
                  bucket={bucket}
                  onPress={() => handleCardPress(bucket.key)}
                />
              ))}
            </View>
          )}
        </ScrollView>
      </ScreenTransition>
    </View>
  );
}

// Group raw per-domain rows into the four grouped buckets.
function groupByBucket(rows: VerticalSummaryRow[]): BucketAggregate[] {
  const byBucket = new Map<VerticalKey, BucketAggregate>();

  for (const key of CARD_ORDER) {
    const bucket = VERTICAL_BUCKETS[key];
    byBucket.set(key, {
      key,
      label: bucket.label,
      icon: bucket.icon,
      entityCount: 0,
      claimCount: 0,
      queueDepth: 0,
      lastActivityAt: null,
      domainCount: 0,
    });
  }

  for (const row of rows) {
    const bucketKey = bucketForDomain(row.domain);
    if (!bucketKey || bucketKey === 'all') continue;
    const agg = byBucket.get(bucketKey);
    if (!agg) continue;
    agg.entityCount += row.entity_count;
    agg.claimCount += row.claim_count;
    agg.queueDepth += row.queue_depth;
    agg.domainCount += 1;
    // Keep the most recent last_activity across all grouped domains
    if (row.last_activity_at) {
      if (
        !agg.lastActivityAt ||
        new Date(row.last_activity_at) > new Date(agg.lastActivityAt)
      ) {
        agg.lastActivityAt = row.last_activity_at;
      }
    }
  }

  return Array.from(byBucket.values());
}

function VerticalCard({
  bucket,
  onPress,
}: {
  bucket: BucketAggregate;
  onPress: () => void;
}) {
  const relative = bucket.lastActivityAt
    ? formatRelative(bucket.lastActivityAt)
    : '—';
  const hasBacklog = bucket.queueDepth > 0;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.cardWrap,
        pressed && styles.cardPressed,
      ]}
      accessibilityRole="button"
      accessibilityLabel={`${bucket.label} vertical. ${bucket.entityCount} entities, ${bucket.claimCount} claims, ${bucket.queueDepth} in queue. Tap to filter Pulse.`}
    >
      <GlassCard
        style={{
          ...styles.card,
          borderLeftWidth: 3,
          borderLeftColor: colors.teal,
        }}
      >
        {/* Header row: icon + label + chevron */}
        <View style={styles.cardHeader}>
          <View style={styles.cardIconWrap}>
            <Ionicons
              name={bucket.icon as any}
              size={16}
              color={colors.teal}
            />
          </View>
          <Text style={styles.cardLabel}>{bucket.label}</Text>
          <View style={{ flex: 1 }} />
          {hasBacklog && (
            <View style={styles.badge}>
              <View style={styles.badgeDot} />
              <Text style={styles.badgeText}>{bucket.queueDepth}</Text>
            </View>
          )}
          <Ionicons name="chevron-forward" size={14} color={colors.slate} />
        </View>

        {/* Metric row */}
        <View style={styles.metricRow}>
          <View style={styles.metric}>
            <Text style={styles.metricValue}>
              {bucket.entityCount.toLocaleString()}
            </Text>
            <Text style={styles.metricLabel}>ENTITIES</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text style={styles.metricValue}>
              {bucket.claimCount.toLocaleString()}
            </Text>
            <Text style={styles.metricLabel}>CLAIMS</Text>
          </View>
          <View style={styles.metricDivider} />
          <View style={styles.metric}>
            <Text
              style={[
                styles.metricValue,
                hasBacklog && { color: colors.statusPending },
              ]}
            >
              {bucket.queueDepth.toLocaleString()}
            </Text>
            <Text style={styles.metricLabel}>QUEUE</Text>
          </View>
        </View>

        {/* Footer row */}
        <View style={styles.cardFooter}>
          <Text style={styles.footerText}>
            {bucket.domainCount} domain{bucket.domainCount === 1 ? '' : 's'}
          </Text>
          <Text style={styles.footerDot}>·</Text>
          <Text style={styles.footerText}>Last activity {relative}</Text>
        </View>
      </GlassCard>
    </Pressable>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  });
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    paddingHorizontal: spacing.lg,
  },
  headerTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
    marginBottom: spacing.xs,
  },
  headerSub: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    marginBottom: spacing.xl,
  },
  grid: {
    gap: spacing.md,
  },
  loadingWrap: {
    paddingTop: spacing.xxl,
    alignItems: 'center',
  },
  errorWrap: {
    paddingTop: spacing.xl,
    alignItems: 'center',
  },
  errorText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.statusReject,
  },
  cardWrap: {
    // Press feedback is applied via the inner GlassCard, so the wrapper
    // just needs a subtle scale on press.
  },
  cardPressed: {
    opacity: 0.88,
    transform: [{ scale: 0.985 }],
  },
  card: {
    padding: spacing.md,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  cardIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.tealDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardLabel: {
    fontFamily: fonts.archivo.bold,
    fontSize: 16,
    color: colors.alabaster,
    letterSpacing: -0.2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    backgroundColor: 'rgba(220, 38, 38, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.35)',
  },
  badgeDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.statusReject,
  },
  badgeText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.statusReject,
  },
  metricRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    fontFamily: fonts.archivo.black,
    fontSize: 22,
    color: colors.alabaster,
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
  metricLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.8,
    marginTop: 2,
  },
  metricDivider: {
    width: 1,
    height: 28,
    backgroundColor: colors.glassBorder,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  footerText: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
  },
  footerDot: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    opacity: 0.5,
  },
});
