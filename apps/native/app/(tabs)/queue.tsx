import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
  ScrollView,
  Pressable,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueueClaims } from '../../src/hooks/useQueueClaims';
import { ClaimCard } from '../../src/components/ClaimCard';
import { RejectSheet } from '../../src/components/RejectSheet';
import type { RejectionReason, ClaimStatus } from '@stroom/types';
import type { QueueClaim } from '@stroom/supabase';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

type StatusFilter = 'all' | 'draft' | 'pending_review';

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_review', label: 'Pending Review' },
];

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const { claims, loading, error, refresh, approve, reject } = useQueueClaims();
  const [refreshing, setRefreshing] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');

  const filteredClaims = useMemo(
    () =>
      filter === 'all'
        ? claims
        : claims.filter((c) => c.status === (filter as ClaimStatus)),
    [claims, filter]
  );

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleReject = useCallback(
    (reason: RejectionReason, notes?: string) => {
      if (rejectTarget) {
        reject(rejectTarget, reason, notes);
        setRejectTarget(null);
      }
    },
    [rejectTarget, reject]
  );

  const renderItem = useCallback(
    ({ item }: { item: QueueClaim }) => (
      <ClaimCard
        claim={item}
        onApprove={() => approve(item.id)}
        onReject={() => setRejectTarget(item.id)}
      />
    ),
    [approve]
  );

  const keyExtractor = useCallback((item: QueueClaim) => item.id, []);

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.headerTitle}>Queue</Text>
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{filteredClaims.length}</Text>
        </View>
      </View>
      <Text style={styles.headerSub}>Claims pending governance review</Text>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
      >
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count =
            f.key === 'all'
              ? claims.length
              : claims.filter((c) => c.status === (f.key as ClaimStatus)).length;
          return (
            <Pressable
              key={f.key}
              onPress={() => setFilter(f.key)}
              style={({ pressed }) => [
                styles.filterPill,
                active && styles.filterPillActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Text style={[styles.filterText, active && styles.filterTextActive]}>
                {f.label}
              </Text>
              <Text
                style={[styles.filterCount, active && styles.filterCountActive]}
              >
                {count}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {loading && claims.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : filteredClaims.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.emptyScroll}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
        >
          {error ? (
            <>
              <Text style={styles.emptyIcon}>!</Text>
              <Text style={styles.emptyTitle}>Couldn't load queue</Text>
              <Text style={styles.errorText}>{error}</Text>
            </>
          ) : claims.length === 0 ? (
            <>
              <Text style={styles.emptyIcon}>✓</Text>
              <Text style={styles.emptyTitle}>Queue clear</Text>
              <Text style={styles.emptyBody}>
                No claims pending review. Pull to refresh — new claims will
                also appear here in real time.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.emptyIcon}>·</Text>
              <Text style={styles.emptyTitle}>No matches</Text>
              <Text style={styles.emptyBody}>
                No claims match this filter. Try a different status.
              </Text>
            </>
          )}
        </ScrollView>
      ) : (
        <FlatList
          data={filteredClaims}
          renderItem={renderItem}
          keyExtractor={keyExtractor}
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
          showsVerticalScrollIndicator={false}
        />
      )}

      <RejectSheet
        visible={rejectTarget !== null}
        onDismiss={() => setRejectTarget(null)}
        onReject={handleReject}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  headerTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.alabaster,
    letterSpacing: -0.8,
  },
  countBadge: {
    backgroundColor: colors.tealDim,
    borderRadius: 100,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.2)',
  },
  countText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  headerSub: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  filterRow: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xs,
    gap: spacing.xs,
    marginBottom: spacing.sm,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 7,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  filterPillActive: {
    backgroundColor: colors.tealDim,
    borderColor: colors.teal,
  },
  filterText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.silver,
  },
  filterTextActive: {
    color: colors.teal,
  },
  filterCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
  },
  filterCountActive: {
    color: colors.teal,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyScroll: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
  },
  emptyIcon: {
    fontSize: 48,
    marginBottom: spacing.md,
  },
  emptyTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 22,
    color: colors.alabaster,
    marginBottom: spacing.sm,
  },
  emptyBody: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
    textAlign: 'center',
  },
});
