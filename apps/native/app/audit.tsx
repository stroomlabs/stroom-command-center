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
import { useAuditLog, type AuditLogRow } from '../src/hooks/useAuditLog';
import { EmptyState } from '../src/components/EmptyState';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

export default function AuditTrailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { rows, loading, error, refresh } = useAuditLog(80);
  const [refreshing, setRefreshing] = React.useState(false);

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
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>More</Text>
        </Pressable>
        <Text style={styles.title}>Audit Trail</Text>
        <Text style={styles.subtitle}>
          {rows.length} {rows.length === 1 ? 'entry' : 'entries'} · most recent first
        </Text>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error && rows.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : rows.length === 0 ? (
        <EmptyState
          icon="document-text"
          title="No Audit Events"
          subtitle="Governance actions will appear here"
        />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => <AuditRow row={item} />}
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

function AuditRow({ row }: { row: AuditLogRow }) {
  const actionColor = ACTION_COLORS[row.action_type] ?? colors.slate;
  const actorIcon = ACTOR_ICONS[row.actor] ?? 'ellipse-outline';
  const oldStatus = (row.old_state as any)?.status;
  const newStatus = (row.new_state as any)?.status;

  return (
    <View style={styles.row}>
      <View style={[styles.actionBar, { backgroundColor: actionColor }]} />
      <View style={styles.rowBody}>
        <View style={styles.rowTopLine}>
          <View style={[styles.actionChip, { borderColor: actionColor }]}>
            <Text style={[styles.actionChipText, { color: actionColor }]}>
              {row.action_type}
            </Text>
          </View>
          <View style={styles.actorWrap}>
            <Ionicons name={actorIcon} size={11} color={colors.slate} />
            <Text style={styles.actorText}>{row.actor}</Text>
          </View>
          <View style={{ flex: 1 }} />
          <Text style={styles.timestamp}>{formatRelative(row.created_at)}</Text>
        </View>

        <Text style={styles.label} numberOfLines={2}>
          {row.entity_label ?? row.entity_table ?? 'unknown'}
        </Text>

        {(oldStatus || newStatus) && (
          <View style={styles.stateTransition}>
            {oldStatus && <Text style={styles.stateText}>{oldStatus}</Text>}
            {oldStatus && newStatus && (
              <Ionicons
                name="arrow-forward"
                size={11}
                color={colors.slate}
                style={{ marginHorizontal: 4 }}
              />
            )}
            {newStatus && (
              <Text style={[styles.stateText, { color: actionColor }]}>
                {newStatus}
              </Text>
            )}
          </View>
        )}

        {row.rejection_reason && (
          <Text style={styles.reason} numberOfLines={2}>
            {row.rejection_reason}
            {row.rejection_detail ? ` — ${row.rejection_detail}` : ''}
          </Text>
        )}

        {row.entity_id && (
          <Text style={styles.entityId} numberOfLines={1}>
            {row.entity_table}:{row.entity_id.slice(0, 8)}
          </Text>
        )}
      </View>
    </View>
  );
}

const ACTION_COLORS: Record<string, string> = {
  approve: colors.statusApprove,
  reject: colors.statusReject,
  correct: colors.statusPending,
  supersede: colors.statusInfo,
  retract: colors.statusReject,
  create: colors.teal,
  update: colors.silver,
};

const ACTOR_ICONS: Record<string, keyof typeof Ionicons.glyphMap> = {
  operator: 'person-outline',
  agent: 'sparkles-outline',
  system: 'cog-outline',
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
    color: colors.teal,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    marginTop: 2,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  actionBar: {
    width: 3,
  },
  rowBody: {
    flex: 1,
    padding: spacing.md,
    gap: 6,
  },
  rowTopLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  actionChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  actionChipText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  actorWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  actorText: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  timestamp: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
  },
  label: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  stateTransition: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stateText: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.silver,
    textTransform: 'lowercase',
  },
  reason: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.silver,
    lineHeight: 16,
  },
  entityId: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
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
