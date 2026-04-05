import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ResearchQueueItem } from '@stroom/types';
import { useResearchQueue } from '../src/hooks/useResearchQueue';
import { EmptyState } from '../src/components/EmptyState';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

export default function ResearchQueueScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { items, loading, error, refresh } = useResearchQueue(80);
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const totalCost = items.reduce(
    (sum, i) => sum + (i.actual_cost_usd ?? i.estimated_cost_usd ?? 0),
    0
  );

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>More</Text>
        </Pressable>
        <Text style={styles.title}>Research Queue</Text>
        <Text style={styles.subtitle}>
          {items.length} {items.length === 1 ? 'item' : 'items'} · $
          {totalCost.toFixed(2)} total
        </Text>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error && items.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="flask"
          title="No Active Research"
          subtitle="Research batches will appear here"
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <ResearchRow item={item} />}
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
        />
      )}
    </LinearGradient>
  );
}

function ResearchRow({ item }: { item: ResearchQueueItem }) {
  const statusColor = STATUS_COLORS[item.status] ?? colors.slate;
  const priorityColor = PRIORITY_COLORS[item.priority] ?? colors.slate;
  const cost = item.actual_cost_usd ?? item.estimated_cost_usd ?? null;
  const isEstimated = item.actual_cost_usd == null && item.estimated_cost_usd != null;

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
        <Text style={[styles.statusText, { color: statusColor }]}>
          {item.status.replace(/_/g, ' ')}
        </Text>
        <View style={[styles.priorityChip, { borderColor: priorityColor }]}>
          <Text style={[styles.priorityText, { color: priorityColor }]}>
            {item.priority}
          </Text>
        </View>
        <View style={{ flex: 1 }} />
        <Text style={styles.sourceText}>{item.source}</Text>
      </View>

      <Text style={styles.prompt} numberOfLines={3}>
        {item.prompt}
      </Text>

      <View style={styles.metaRow}>
        {cost != null && (
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>{isEstimated ? 'EST' : 'COST'}</Text>
            <Text style={styles.metaValue}>${cost.toFixed(4)}</Text>
          </View>
        )}
        {item.claims_staged != null && item.claims_staged > 0 && (
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>CLAIMS</Text>
            <Text style={styles.metaValue}>{item.claims_staged}</Text>
          </View>
        )}
        {item.sources_discovered != null && item.sources_discovered > 0 && (
          <View style={styles.metaCell}>
            <Text style={styles.metaLabel}>SOURCES</Text>
            <Text style={styles.metaValue}>{item.sources_discovered}</Text>
          </View>
        )}
        <View style={{ flex: 1 }} />
        <Text style={styles.age}>{formatAge(item)}</Text>
      </View>

      {item.error_message && (
        <Text style={styles.errorLine} numberOfLines={2}>
          {item.error_message}
        </Text>
      )}
    </View>
  );
}

const STATUS_COLORS: Record<string, string> = {
  queued: colors.slate,
  cost_estimated: colors.statusInfo,
  in_progress: colors.statusPending,
  completed: colors.statusApprove,
  failed: colors.statusReject,
  cancelled: colors.slate,
};

const PRIORITY_COLORS: Record<string, string> = {
  urgent: colors.statusReject,
  normal: colors.teal,
  backfill: colors.slate,
};

function formatAge(item: ResearchQueueItem): string {
  const iso = item.completed_at ?? item.started_at ?? item.created_at;
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

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
    color: colors.alabaster,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    marginTop: 4,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  statusText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  priorityChip: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  priorityText: {
    fontFamily: fonts.mono.regular,
    fontSize: 9,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  sourceText: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    textTransform: 'uppercase',
  },
  prompt: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.silver,
    lineHeight: 18,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  metaCell: {
    gap: 2,
  },
  metaLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.8,
  },
  metaValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  age: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
  },
  errorLine: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.statusReject,
    lineHeight: 15,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.sm,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
  },
  emptyTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 16,
    color: colors.silver,
  },
});
