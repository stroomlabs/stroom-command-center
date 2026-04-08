import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import Animated, { FadeOutRight } from 'react-native-reanimated';
import { BackgroundCanvas } from '../src/components/BackgroundCanvas';
import { EmptyState } from '../src/components/EmptyState';
import { useBrandToast } from '../src/components/BrandToast';
import supabase from '../src/lib/supabase';
import { useAuth } from '../src/lib/auth';
import { colors, fonts, spacing, radius } from '../src/constants/brand';

interface MergeDismissalRow {
  id: string;
  entity_a_id: string;
  entity_b_id: string;
  reason: string;
  dismissed_at: string;
  expires_at: string | null;
  reopened_at: string | null;
  entity_a?: { canonical_name: string | null } | null;
  entity_b?: { canonical_name: string | null } | null;
}

const REASON_LABELS: Record<string, string> = {
  not_duplicate: 'Not a duplicate',
  similar_name_different_entity: 'Different entity',
  decide_later: 'Decide later',
};

export default function DismissedMergesScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user } = useAuth();
  const { show: showToast } = useBrandToast();

  const [rows, setRows] = useState<MergeDismissalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchRows = useCallback(async () => {
    if (!user?.id) {
      setRows([]);
      setLoading(false);
      return;
    }
    setError(null);
    try {
      const { data, error: queryError } = await supabase
        .schema('intel')
        .from('merge_dismissals')
        .select(
          `id, entity_a_id, entity_b_id, reason, dismissed_at, expires_at, reopened_at,
           entity_a:entities!merge_dismissals_entity_a_id_fkey(canonical_name),
           entity_b:entities!merge_dismissals_entity_b_id_fkey(canonical_name)`
        )
        .is('reopened_at', null)
        .eq('dismissed_by', user.id)
        .order('dismissed_at', { ascending: false });
      if (queryError) throw queryError;
      setRows((data ?? []) as unknown as MergeDismissalRow[]);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load dismissals');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchRows();
  }, [fetchRows]);

  const handleReopen = useCallback(
    async (dismissalId: string) => {
      Haptics.selectionAsync();
      // Optimistically remove
      setRows((prev) => prev.filter((r) => r.id !== dismissalId));
      try {
        const { error: rpcError } = await supabase
          .schema('intel')
          .rpc('reopen_merge_dismissal', { dismissal_id: dismissalId });
        if (rpcError) throw rpcError;
        showToast('Dismissal reopened', 'success');
      } catch (e: any) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
        showToast(e?.message ?? 'Reopen failed', 'error');
        // Refetch on failure so the row reappears.
        await fetchRows();
      }
    },
    [showToast, fetchRows]
  );

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchRows();
  }, [fetchRows]);

  return (
    <LinearGradient
      colors={['#000000', '#0A0D0F']}
      style={styles.container}
    >
      <BackgroundCanvas />

      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={10}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.silver} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Dismissed merges</Text>
          <Text style={styles.subtitle}>
            {rows.length} active dismissal{rows.length === 1 ? '' : 's'}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingBottom: insets.bottom + spacing.xl },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.teal}
          />
        }
      >
        {loading && rows.length === 0 ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" color={colors.teal} />
          </View>
        ) : error ? (
          <View style={styles.errorWrap}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : rows.length === 0 ? (
          <EmptyState
            icon="checkmark-done"
            title="No dismissed merges"
            subtitle="Duplicates you dismiss from entity detail will appear here"
            compact
          />
        ) : (
          rows.map((r) => {
            const aName = r.entity_a?.canonical_name ?? '—';
            const bName = r.entity_b?.canonical_name ?? '—';
            const dismissedAt = formatRelative(r.dismissed_at);
            const reasonLabel =
              REASON_LABELS[r.reason] ?? r.reason.replace(/_/g, ' ');
            return (
              <Animated.View
                key={r.id}
                exiting={FadeOutRight.duration(200)}
                style={styles.row}
              >
                <View style={styles.rowBody}>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/entity/[id]',
                        params: { id: r.entity_a_id },
                      } as any)
                    }
                  >
                    <Text style={styles.entityName} numberOfLines={1}>
                      {aName}
                    </Text>
                  </Pressable>
                  <View style={styles.vsRow}>
                    <View style={styles.vsLine} />
                    <Text style={styles.vsText}>vs</Text>
                    <View style={styles.vsLine} />
                  </View>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/entity/[id]',
                        params: { id: r.entity_b_id },
                      } as any)
                    }
                  >
                    <Text style={styles.entityName} numberOfLines={1}>
                      {bName}
                    </Text>
                  </Pressable>
                  <View style={styles.metaRow}>
                    <View style={styles.reasonBadge}>
                      <Text style={styles.reasonBadgeText}>{reasonLabel}</Text>
                    </View>
                    <Text style={styles.timestamp}>{dismissedAt}</Text>
                  </View>
                </View>
                <Pressable
                  onPress={() => handleReopen(r.id)}
                  style={({ pressed }) => [
                    styles.reopenBtn,
                    pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Reopen dismissal of ${aName} and ${bName}`}
                >
                  <Ionicons
                    name="refresh"
                    size={13}
                    color={colors.teal}
                  />
                  <Text style={styles.reopenBtnText}>Reopen</Text>
                </Pressable>
              </Animated.View>
            );
          })
        )}
      </ScrollView>
    </LinearGradient>
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
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  backBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 24,
    color: colors.alabaster,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    marginTop: 2,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.sm,
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  entityName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  vsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 2,
  },
  vsLine: {
    flex: 1,
    height: 1,
    backgroundColor: colors.glassBorder,
  },
  vsText: {
    fontFamily: fonts.mono.regular,
    fontSize: 9,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 6,
  },
  reasonBadge: {
    backgroundColor: colors.tealDim,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  reasonBadgeText: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    color: colors.teal,
  },
  timestamp: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  reopenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    backgroundColor: colors.tealDim,
  },
  reopenBtnText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 11,
    color: colors.teal,
    letterSpacing: 0.3,
  },
});
