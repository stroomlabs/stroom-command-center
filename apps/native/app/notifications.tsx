import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import supabase from '../src/lib/supabase';
import { ScreenCanvas } from '../src/components/ScreenCanvas';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

type NotificationKind =
  | 'claim_ingested'
  | 'claim_approved'
  | 'claim_rejected'
  | 'claim_auto_approved'
  | 'source_alert'
  | 'research_complete';

interface NotificationItem {
  id: string;
  kind: NotificationKind;
  title: string;
  subtitle: string | null;
  created_at: string;
  route: string | null;
  routeParams?: Record<string, string>;
}

const KIND_META: Record<
  NotificationKind,
  {
    icon: React.ComponentProps<typeof Ionicons>['name'];
    color: string;
    label: string;
  }
> = {
  claim_ingested: {
    icon: 'cube-outline',
    color: colors.teal,
    label: 'Claim ingested',
  },
  claim_approved: {
    icon: 'checkmark-circle-outline',
    color: colors.statusApprove,
    label: 'Claim approved',
  },
  claim_auto_approved: {
    icon: 'sparkles',
    color: colors.statusApprove,
    label: 'Auto-approved',
  },
  claim_rejected: {
    icon: 'close-circle-outline',
    color: colors.statusReject,
    label: 'Claim rejected',
  },
  source_alert: {
    icon: 'warning-outline',
    color: colors.statusPending,
    label: 'Source alert',
  },
  research_complete: {
    icon: 'flask-outline',
    color: colors.statusInfo,
    label: 'Research complete',
  },
};

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

function groupByDay(items: NotificationItem[]): Array<{
  label: string;
  items: NotificationItem[];
}> {
  const map = new Map<string, NotificationItem[]>();
  const now = new Date();
  const startOfToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  ).getTime();
  const startOfYesterday = startOfToday - 86_400_000;
  for (const item of items) {
    const t = new Date(item.created_at).getTime();
    let bucket: string;
    if (t >= startOfToday) bucket = 'Today';
    else if (t >= startOfYesterday) bucket = 'Yesterday';
    else bucket = 'Earlier';
    const arr = map.get(bucket) ?? [];
    arr.push(item);
    map.set(bucket, arr);
  }
  const order = ['Today', 'Yesterday', 'Earlier'];
  return order
    .filter((k) => map.has(k))
    .map((k) => ({ label: k, items: map.get(k)! }));
}

export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      // Governance events from audit_log (last 50) — approvals, rejections,
      // auto-approvals, corrections, etc.
      const { data: auditRows } = await supabase
        .schema('intel')
        .from('audit_log')
        .select('id, action_type, entity_table, entity_id, created_at, metadata')
        .order('created_at', { ascending: false })
        .limit(50);

      // Recently ingested claims — last 20 drafts/pending for context.
      const { data: claimRows } = await supabase
        .schema('intel')
        .from('claims')
        .select(
          'id, predicate, status, created_at, subject_entity:entities!claims_subject_entity_id_fkey(canonical_name)'
        )
        .order('created_at', { ascending: false })
        .limit(20);

      // Recently flagged/failing sources.
      const { data: sourceRows } = await supabase
        .schema('intel')
        .from('sources')
        .select('id, source_name, trust_score, updated_at')
        .lt('trust_score', 5)
        .order('updated_at', { ascending: false })
        .limit(10);

      // Completed research rows.
      const { data: researchRows } = await supabase
        .schema('intel')
        .from('research_queue')
        .select('id, topic, status, completed_at, updated_at')
        .eq('status', 'completed')
        .order('completed_at', { ascending: false })
        .limit(10);

      const merged: NotificationItem[] = [];

      for (const row of (auditRows ?? []) as any[]) {
        if (row.entity_table !== 'claims' || !row.entity_id) continue;
        const kind: NotificationKind =
          row.action_type === 'auto_approve'
            ? 'claim_auto_approved'
            : row.action_type === 'approve'
            ? 'claim_approved'
            : row.action_type === 'reject'
            ? 'claim_rejected'
            : 'claim_ingested';
        merged.push({
          id: `audit:${row.id}`,
          kind,
          title: KIND_META[kind].label,
          subtitle: (row.action_type ?? '').replace(/_/g, ' '),
          created_at: row.created_at,
          route: '/claim/[id]',
          routeParams: { id: row.entity_id },
        });
      }

      for (const row of (claimRows ?? []) as any[]) {
        if (row.status !== 'draft' && row.status !== 'pending_review') continue;
        merged.push({
          id: `claim:${row.id}`,
          kind: 'claim_ingested',
          title: 'New claim',
          subtitle:
            (row.subject_entity?.canonical_name ?? 'Unknown entity') +
            ' · ' +
            (row.predicate ?? 'unknown'),
          created_at: row.created_at,
          route: '/claim/[id]',
          routeParams: { id: row.id },
        });
      }

      for (const row of (sourceRows ?? []) as any[]) {
        merged.push({
          id: `source:${row.id}`,
          kind: 'source_alert',
          title: 'Low trust source',
          subtitle: `${row.source_name} · trust ${Number(row.trust_score).toFixed(1)}`,
          created_at: row.updated_at,
          route: '/source/[id]',
          routeParams: { id: row.id },
        });
      }

      for (const row of (researchRows ?? []) as any[]) {
        merged.push({
          id: `research:${row.id}`,
          kind: 'research_complete',
          title: 'Research complete',
          subtitle: row.topic ?? 'research task',
          created_at: row.completed_at ?? row.updated_at,
          route: '/research',
        });
      }

      merged.sort(
        (a, b) =>
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      );

      setItems(merged.slice(0, 60));
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load notifications');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const grouped = useMemo(() => groupByDay(items), [items]);

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Pulse</Text>
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>Recent activity across the graph</Text>
      </View>

      {loading && items.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : items.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="notifications-outline" size={40} color={colors.slate} />
          <Text style={styles.emptyText}>No recent notifications.</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.scroll}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                load();
              }}
              tintColor={colors.teal}
            />
          }
        >
          {grouped.map((group) => (
            <View key={group.label} style={styles.group}>
              <Text style={styles.groupLabel}>{group.label.toUpperCase()}</Text>
              {group.items.map((item) => {
                const meta = KIND_META[item.kind];
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      if (!item.route) return;
                      router.push(
                        item.routeParams
                          ? ({
                              pathname: item.route,
                              params: item.routeParams,
                            } as any)
                          : (item.route as any)
                      );
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      pressed && {
                        opacity: 0.75,
                        transform: [{ scale: 0.97 }],
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.iconWrap,
                        { borderColor: meta.color, backgroundColor: `${meta.color}14` },
                      ]}
                    >
                      <Ionicons name={meta.icon} size={14} color={meta.color} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.rowTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      {item.subtitle ? (
                        <Text style={styles.rowSubtitle} numberOfLines={1}>
                          {item.subtitle}
                        </Text>
                      ) : null}
                    </View>
                    <Text style={styles.rowTime}>
                      {formatRelative(item.created_at)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
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
    fontSize: 14,
    color: colors.slate,
    marginTop: 4,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
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
  emptyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
  },
  group: {
    gap: spacing.xs,
  },
  groupLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
    marginBottom: spacing.xs,
    marginLeft: 2,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  rowSubtitle: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  rowTime: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
  },
});
