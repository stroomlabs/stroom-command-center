import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Stepper } from '../../src/components/Stepper';
import { haptics } from '../../src/lib/haptics';
import {
  updateSource,
  batchUpdateSiblingSources,
  type SourceClaim,
} from '@stroom/supabase';
import { useSourceDetail } from '../../src/hooks/useSourceDetail';
import {
  useSiblingSources,
  type SiblingSource,
} from '../../src/hooks/useSiblingSources';
import { RetryCard } from '../../src/components/RetryCard';
import { SkeletonDetail } from '../../src/components/Skeleton';
import { StatusBadge } from '../../src/components/StatusBadge';
import {
  ActionSheet,
  type ActionSheetAction,
} from '../../src/components/ActionSheet';
import { useBrandToast } from '../../src/components/BrandToast';
import { useBrandAlert } from '../../src/components/BrandAlert';
import supabase from '../../src/lib/supabase';
import { ScreenCanvas } from '../../src/components/ScreenCanvas';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function SourceDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { source, claims, loading, error, refresh } = useSourceDetail(id);
  const [refreshing, setRefreshing] = React.useState(false);
  const { show: showToast } = useBrandToast();
  const { alert } = useBrandAlert();

  // Local trust draft for the slider — decoupled from server state so the
  // thumb follows the finger, then we commit on release.
  const [trustDraft, setTrustDraft] = React.useState<number | null>(null);
  React.useEffect(() => {
    if (source) setTrustDraft(Number(source.trust_score));
  }, [source?.id, source?.trust_score]);

  const [saving, setSaving] = React.useState(false);

  const commitTrustScore = useCallback(
    async (value: number) => {
      if (!source) return;
      setSaving(true);
      try {
        await updateSource(supabase, source.id, { trust_score: value });
        haptics.success();
        showToast(`Trust score updated to ${value.toFixed(1)}`, 'success');
        await refresh();
      } catch (e: any) {
        haptics.error();
        showToast(e?.message ?? 'Update failed', 'error');
      } finally {
        setSaving(false);
      }
    },
    [source, refresh, showToast]
  );

  const toggleAutoApprove = useCallback(
    async (next: boolean) => {
      if (!source) return;
      haptics.tap.light();
      setSaving(true);
      try {
        await updateSource(supabase, source.id, { auto_approve: next });
        haptics.success();
        showToast(
          next ? 'Auto-approve enabled' : 'Auto-approve disabled',
          'success'
        );
        await refresh();
      } catch (e: any) {
        haptics.error();
        showToast(e?.message ?? 'Update failed', 'error');
      } finally {
        setSaving(false);
      }
    },
    [source, refresh, showToast]
  );

  const currentStatus = (source?.canary_status ?? 'active') as string;
  const isBlocked = currentStatus === 'blocked';

  const setCanaryStatus = useCallback(
    async (next: 'active' | 'blocked') => {
      if (!source) return;
      setSaving(true);
      try {
        await updateSource(supabase, source.id, { canary_status: next });
        haptics.success();
        showToast(
          next === 'blocked' ? 'Source blocked' : 'Source unblocked',
          next === 'blocked' ? 'warn' : 'success'
        );
        await refresh();
      } catch (e: any) {
        haptics.error();
        showToast(e?.message ?? 'Update failed', 'error');
      } finally {
        setSaving(false);
      }
    },
    [source, refresh, showToast]
  );

  const {
    siblings,
    loading: siblingsLoading,
    refresh: refreshSiblings,
  } = useSiblingSources(source?.id ?? null);
  const [applySheetVisible, setApplySheetVisible] = useState(false);

  const runBatch = useCallback(
    async (
      patch: { trust_score?: number; auto_approve?: boolean; canary_status?: string },
      label: string
    ) => {
      const ids = siblings.map((s) => s.id);
      if (ids.length === 0) return;
      setSaving(true);
      try {
        const n = await batchUpdateSiblingSources(supabase, ids, patch);
        haptics.success();
        showToast(`${label} · updated ${n} source${n === 1 ? '' : 's'}`, 'success');
        await Promise.all([refresh(), refreshSiblings()]);
      } catch (e: any) {
        haptics.error();
        showToast(e?.message ?? 'Batch update failed', 'error');
      } finally {
        setSaving(false);
      }
    },
    [siblings, refresh, refreshSiblings, showToast]
  );

  const applyActions: ActionSheetAction[] = React.useMemo(() => {
    if (!source) return [];
    const currentTrust = Number(source.trust_score);
    return [
      {
        label: `Set All Trust to ${currentTrust.toFixed(1)}`,
        icon: 'trending-up-outline',
        tone: 'accent',
        onPress: () =>
          void runBatch(
            { trust_score: currentTrust },
            `Trust set to ${currentTrust.toFixed(1)}`
          ),
      },
      {
        label: 'Enable Auto-Approve on All',
        icon: 'sparkles',
        tone: 'accent',
        onPress: () =>
          void runBatch({ auto_approve: true }, 'Auto-approve enabled'),
      },
      {
        label: 'Disable Auto-Approve on All',
        icon: 'sparkles-outline',
        onPress: () =>
          void runBatch({ auto_approve: false }, 'Auto-approve disabled'),
      },
      {
        label: 'Block All',
        icon: 'ban-outline',
        tone: 'destructive',
        onPress: () =>
          void runBatch({ canary_status: 'blocked' }, 'Blocked'),
      },
    ];
  }, [source, runBatch]);

  const handleBlockPress = useCallback(() => {
    if (!source) return;
    if (isBlocked) {
      void setCanaryStatus('active');
      return;
    }
    alert(
      `Block ${source.source_name}?`,
      'Claims from this source will no longer auto-approve.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Block',
          style: 'destructive',
          onPress: () => void setCanaryStatus('blocked'),
        },
      ]
    );
  }, [source, isBlocked, alert, setCanaryStatus]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

  const openUrl = useCallback((url: string | null | undefined) => {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
  }, []);

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <View style={[styles.topBar, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
      </View>

      {loading && !source ? (
        <SkeletonDetail />
      ) : error ? (
        <View style={styles.centered}>
          <RetryCard
            message="Couldn't load source"
            detail={error}
            onRetry={refresh}
          />
        </View>
      ) : !source ? (
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>Source not found</Text>
        </View>
      ) : (
        <FlatList
          data={claims}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
          ListHeaderComponent={
            <View style={styles.headerBlock}>
              <Text style={styles.sourceName}>{source.source_name}</Text>

              <View style={styles.metaRow}>
                {source.source_class && (
                  <SourceClassBadge sourceClass={source.source_class} />
                )}
                {source.domain && (
                  <Text style={styles.domainText}>{source.domain}</Text>
                )}
                {source.auto_approve && (
                  <View style={styles.autoChip}>
                    <Ionicons name="sparkles" size={10} color={colors.teal} />
                    <Text style={styles.autoText}>auto-approve</Text>
                  </View>
                )}
                {isBlocked && (
                  <View style={styles.blockedChip}>
                    <Ionicons
                      name="ban-outline"
                      size={10}
                      color={colors.statusReject}
                    />
                    <Text style={styles.blockedText}>blocked</Text>
                  </View>
                )}
              </View>

              {/* Trust score bar */}
              <TrustBar score={Number(source.trust_score)} />

              {/* Editable trust score slider */}
              <View style={styles.controlCard}>
                <View style={styles.controlHeader}>
                  <Text style={styles.controlLabel}>ADJUST TRUST</Text>
                  <Text style={styles.controlValue}>
                    {(trustDraft ?? Number(source.trust_score)).toFixed(1)}
                  </Text>
                </View>
                <Stepper
                  value={trustDraft ?? Number(source.trust_score)}
                  min={0}
                  max={10}
                  step={0.1}
                  onChange={setTrustDraft}
                  onCommit={(v) => {
                    // Only hit the server when the value actually moved off
                    // the current trust score — the stepper onChange already
                    // keeps the draft in sync, onCommit fires on every tap
                    // release, and we don't want to spam the RPC on no-op taps.
                    if (Math.abs(v - Number(source.trust_score)) >= 0.05) {
                      void commitTrustScore(v);
                    }
                  }}
                  disabled={saving}
                />
              </View>

              {/* Auto-approve toggle */}
              <View style={styles.controlRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.controlRowLabel}>Auto-Approve</Text>
                  <Text style={styles.controlRowMeta}>
                    Trust claims from this source automatically
                  </Text>
                </View>
                <Switch
                  value={!!source.auto_approve}
                  onValueChange={toggleAutoApprove}
                  trackColor={{ false: colors.surfaceCard, true: colors.teal }}
                  thumbColor={colors.alabaster}
                  ios_backgroundColor={colors.surfaceCard}
                  disabled={saving}
                  accessibilityRole="switch"
                  accessibilityLabel={`Auto-approve: ${source.auto_approve ? 'on' : 'off'}`}
                />
              </View>

              {/* Block / unblock source */}
              <Pressable
                onPress={handleBlockPress}
                disabled={saving}
                style={({ pressed }) => [
                  styles.blockBtn,
                  isBlocked ? styles.unblockBtn : styles.blockBtnDestructive,
                  (pressed || saving) && { opacity: 0.75, transform: [{ scale: 0.97 }] },
                ]}
              >
                <Ionicons
                  name={isBlocked ? 'lock-open-outline' : 'ban-outline'}
                  size={16}
                  color={isBlocked ? colors.teal : colors.statusReject}
                />
                <Text
                  style={[
                    styles.blockBtnText,
                    { color: isBlocked ? colors.teal : colors.statusReject },
                  ]}
                >
                  {isBlocked ? 'Unblock Source' : 'Block Source'}
                </Text>
              </Pressable>

              {/* Related sources — publisher siblings via RPC */}
              {siblings.length > 1 && (
                <View style={styles.siblingsBlock}>
                  <View style={styles.siblingsHeader}>
                    <Text style={styles.siblingsHeaderTitle}>
                      Related Sources
                    </Text>
                    <Text style={styles.siblingsHeaderMeta} numberOfLines={1}>
                      {source.domain ?? siblings[0]?.domain ?? 'publisher'} ·{' '}
                      {siblings.length} sources
                    </Text>
                  </View>
                  {siblings.map((sib) => (
                    <SiblingCard
                      key={sib.id}
                      sibling={sib}
                      isCurrent={sib.id === source.id}
                      onPress={() => {
                        if (sib.id === source.id) return;
                        router.push({
                          pathname: '/source/[id]',
                          params: { id: sib.id },
                        } as any);
                      }}
                    />
                  ))}
                  <Pressable
                    onPress={() => {
                      haptics.tap.light();
                      setApplySheetVisible(true);
                    }}
                    disabled={saving}
                    style={({ pressed }) => [
                      styles.applyAllBtn,
                      (pressed || saving) && {
                        opacity: 0.75,
                        transform: [{ scale: 0.97 }],
                      },
                    ]}
                  >
                    <Ionicons
                      name="layers-outline"
                      size={14}
                      color={colors.obsidian}
                    />
                    <Text style={styles.applyAllText}>Apply to All</Text>
                  </Pressable>
                </View>
              )}
              {siblings.length <= 1 && siblingsLoading && (
                <View style={styles.siblingsLoading}>
                  <ActivityIndicator size="small" color={colors.teal} />
                </View>
              )}

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {Number(source.trust_score).toFixed(1)}
                  </Text>
                  <Text style={styles.statLabel}>TRUST</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>
                    {source.operational_reliability != null
                      ? Number(source.operational_reliability).toFixed(1)
                      : '—'}
                  </Text>
                  <Text style={styles.statLabel}>OPS</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.stat}>
                  <Text style={styles.statValue}>{claims.length}</Text>
                  <Text style={styles.statLabel}>CLAIMS</Text>
                </View>
              </View>

              {source.source_url && (
                <Pressable
                  onPress={() => openUrl(source.source_url)}
                  style={({ pressed }) => [
                    styles.urlCard,
                    pressed && { opacity: 0.7 },
                  ]}
                >
                  <Ionicons name="open-outline" size={14} color={colors.teal} />
                  <Text style={styles.urlText} numberOfLines={1}>
                    {source.source_url}
                  </Text>
                  <Ionicons name="chevron-forward" size={14} color={colors.slate} />
                </Pressable>
              )}

              {source.notes && (
                <Text style={styles.notes}>{source.notes}</Text>
              )}

              <Text style={styles.sectionHeader}>
                {claims.length} {claims.length === 1 ? 'claim' : 'claims'} from this source
              </Text>
            </View>
          }
          renderItem={({ item }) => (
            <ClaimRow
              claim={item}
              onPress={() =>
                router.push({ pathname: '/claim/[id]', params: { id: item.id } } as any)
              }
            />
          )}
          ListEmptyComponent={
            <View style={styles.listEmpty}>
              <Text style={styles.listEmptyText}>No claims from this source yet.</Text>
            </View>
          }
        />
      )}
      <ActionSheet
        visible={applySheetVisible}
        title="Apply to all related sources"
        subtitle={
          source
            ? `${siblings.length} source${siblings.length === 1 ? '' : 's'} under ${
                source.domain ?? 'this publisher'
              }`
            : undefined
        }
        actions={applyActions}
        onDismiss={() => setApplySheetVisible(false)}
      />
    </View>
  );
}

const SiblingCard = React.memo(function SiblingCard({
  sibling,
  isCurrent,
  onPress,
}: {
  sibling: SiblingSource;
  isCurrent: boolean;
  onPress: () => void;
}) {
  const blocked = sibling.canary_status === 'blocked';
  const trustColor =
    sibling.trust_score >= 7.5
      ? colors.statusApprove
      : sibling.trust_score >= 5
      ? colors.teal
      : colors.statusPending;
  return (
    <Pressable
      onPress={onPress}
      disabled={isCurrent}
      style={({ pressed }) => [
        styles.siblingCard,
        isCurrent && styles.siblingCardCurrent,
        pressed && !isCurrent && { opacity: 0.8, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={styles.siblingMain}>
        <View style={styles.siblingTopRow}>
          <Text style={styles.siblingName} numberOfLines={1}>
            {sibling.source_name}
          </Text>
          {isCurrent && (
            <Ionicons
              name="checkmark-circle"
              size={14}
              color={colors.teal}
            />
          )}
        </View>
        <View style={styles.siblingMetaRow}>
          <Text style={[styles.siblingTrust, { color: trustColor }]}>
            {sibling.trust_score.toFixed(1)}
          </Text>
          <Text style={styles.siblingDot}>·</Text>
          <Text style={styles.siblingClaims}>
            {sibling.claim_count.toLocaleString()} claims
          </Text>
          {sibling.auto_approve && (
            <View style={styles.siblingAutoBadge}>
              <Text style={styles.siblingAutoText}>AUTO</Text>
            </View>
          )}
          {blocked && (
            <View style={styles.siblingBlockedBadge}>
              <Text style={styles.siblingBlockedText}>BLOCKED</Text>
            </View>
          )}
        </View>
      </View>
      {!isCurrent && (
        <Ionicons name="chevron-forward" size={14} color={colors.slate} />
      )}
    </Pressable>
  );
});

// Colored source class badge — matches the Stroom Source Control dashboard
// palette. Falls back to the neutral teal chip for unknown classes.
function SourceClassBadge({ sourceClass }: { sourceClass: string }) {
  const palette = classPalette(sourceClass);
  return (
    <View
      style={[
        styles.classBadge,
        {
          backgroundColor: palette.bg,
          borderColor: palette.border,
        },
      ]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Source class: ${sourceClass.replace(/_/g, ' ')}`}
    >
      <Text style={[styles.classBadgeText, { color: palette.fg }]}>
        {sourceClass.replace(/_/g, ' ').toUpperCase()}
      </Text>
    </View>
  );
}

function classPalette(cls: string): { bg: string; border: string; fg: string } {
  const key = cls.toLowerCase();
  if (key.includes('corporate') || key.includes('ir')) {
    return {
      bg: 'rgba(34, 197, 94, 0.12)',
      border: 'rgba(34, 197, 94, 0.35)',
      fg: colors.statusApprove,
    };
  }
  if (key.includes('news') || key.includes('media')) {
    return {
      bg: 'rgba(59, 130, 246, 0.14)',
      border: 'rgba(59, 130, 246, 0.4)',
      fg: colors.statusInfo,
    };
  }
  if (key.includes('premium') || key.includes('data')) {
    return {
      bg: 'rgba(167, 139, 250, 0.14)',
      border: 'rgba(167, 139, 250, 0.4)',
      fg: '#A78BFA',
    };
  }
  if (key.includes('social') || key.includes('community')) {
    return {
      bg: 'rgba(244, 114, 182, 0.14)',
      border: 'rgba(244, 114, 182, 0.4)',
      fg: '#F472B6',
    };
  }
  if (key.includes('government') || key.includes('regulatory')) {
    return {
      bg: 'rgba(245, 158, 11, 0.14)',
      border: 'rgba(245, 158, 11, 0.4)',
      fg: colors.statusPending,
    };
  }
  // Default: brand teal chip
  return {
    bg: colors.tealDim,
    border: 'rgba(0, 161, 155, 0.35)',
    fg: colors.teal,
  };
}

function TrustBar({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(10, score));
  const pct = (clamped / 10) * 100;
  const color =
    clamped >= 7.5
      ? colors.statusApprove
      : clamped >= 5
      ? colors.statusPending
      : colors.statusReject;
  return (
    <View style={styles.trustBarWrap}>
      <View style={styles.trustBarTrack}>
        <View
          style={[
            styles.trustBarFill,
            { width: `${pct}%`, backgroundColor: color },
          ]}
        />
      </View>
      <View style={styles.trustBarLabels}>
        <Text style={styles.trustLabel}>TRUST SCORE</Text>
        <Text style={[styles.trustValue, { color }]}>{clamped.toFixed(1)} / 10</Text>
      </View>
    </View>
  );
}

function ClaimRow({
  claim,
  onPress,
}: {
  claim: SourceClaim;
  onPress: () => void;
}) {
  const subject = claim.subject_entity?.canonical_name ?? 'Unknown';
  const predicate = (claim.predicate ?? 'unknown').split('.').pop() ?? 'unknown';
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.claimRow,
        pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
      ]}
    >
      <View style={styles.claimTop}>
        <StatusBadge status={claim.status} />
        <Text style={styles.claimAge}>{formatAge(claim.created_at)}</Text>
      </View>
      <Text style={styles.claimSubject} numberOfLines={1}>
        {subject}
      </Text>
      <Text style={styles.claimPredicate} numberOfLines={1}>
        {predicate.replace(/_/g, ' ')}
      </Text>
    </Pressable>
  );
}

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
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
  sourceName: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
    marginBottom: spacing.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
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
    textTransform: 'uppercase',
  },
  classBadge: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  classBadgeText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    letterSpacing: 0.8,
  },
  blockedChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  blockedText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.statusReject,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  controlCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  controlHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  controlLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
  },
  controlValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 18,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  controlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  controlRowLabel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  controlRowMeta: {
    fontFamily: fonts.archivo.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  blockBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    marginBottom: spacing.md,
  },
  blockBtnDestructive: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.35)',
  },
  unblockBtn: {
    backgroundColor: colors.tealDim,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  blockBtnText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    letterSpacing: 0.2,
  },
  siblingsBlock: {
    marginBottom: spacing.md,
    gap: 6,
  },
  siblingsHeader: {
    marginBottom: spacing.xs,
  },
  siblingsHeaderTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    color: colors.alabaster,
    letterSpacing: -0.2,
  },
  siblingsHeaderMeta: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  siblingsLoading: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  siblingCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  siblingCardCurrent: {
    borderColor: colors.teal,
    backgroundColor: colors.tealDim,
  },
  siblingMain: {
    flex: 1,
    gap: 4,
  },
  siblingTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  siblingName: {
    flex: 1,
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
  },
  siblingMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  siblingTrust: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  siblingDot: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  siblingClaims: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  siblingAutoBadge: {
    backgroundColor: 'rgba(34, 197, 94, 0.14)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.4)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  siblingAutoText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    color: colors.statusApprove,
    letterSpacing: 0.8,
  },
  siblingBlockedBadge: {
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: 4,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  siblingBlockedText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    color: colors.statusReject,
    letterSpacing: 0.8,
  },
  applyAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
    marginTop: spacing.xs,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 3,
  },
  applyAllText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 13,
    color: colors.obsidian,
    letterSpacing: 0.3,
  },
  domainText: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  autoChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(0, 161, 155, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.25)',
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  autoText: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    color: colors.teal,
    textTransform: 'uppercase',
  },
  trustBarWrap: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  trustBarTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  trustBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  trustBarLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  trustLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
  },
  trustValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
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
    fontSize: 20,
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
  urlCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    marginBottom: spacing.md,
  },
  urlText: {
    flex: 1,
    fontFamily: fonts.mono.regular,
    fontSize: 12,
    color: colors.silver,
  },
  notes: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.silver,
    lineHeight: 18,
    marginBottom: spacing.md,
  },
  sectionHeader: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.slate,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginTop: spacing.sm,
    marginBottom: spacing.sm,
  },
  claimRow: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 4,
  },
  claimTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  claimAge: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  claimSubject: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  claimPredicate: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.teal,
    textTransform: 'capitalize',
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
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
  },
  emptyTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 18,
    color: colors.silver,
  },
});
