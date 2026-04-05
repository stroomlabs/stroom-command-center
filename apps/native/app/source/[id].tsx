import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { SourceClaim } from '@stroom/supabase';
import { useSourceDetail } from '../../src/hooks/useSourceDetail';
import { RetryCard } from '../../src/components/RetryCard';
import { StatusBadge } from '../../src/components/StatusBadge';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function SourceDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { source, claims, loading, error, refresh } = useSourceDetail(id);
  const [refreshing, setRefreshing] = React.useState(false);

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
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
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
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
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
                  <View style={styles.typeChip}>
                    <Text style={styles.typeText}>{source.source_class}</Text>
                  </View>
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
              </View>

              {/* Trust score bar */}
              <TrustBar score={Number(source.trust_score)} />

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
    </LinearGradient>
  );
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
