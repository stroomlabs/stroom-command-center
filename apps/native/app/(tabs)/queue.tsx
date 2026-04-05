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
  TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
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
  const { claims, loading, error, refresh, approve, reject, batchApprove } =
    useQueueClaims();
  const [refreshing, setRefreshing] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const filteredClaims = useMemo(() => {
    const byStatus =
      filter === 'all'
        ? claims
        : claims.filter((c) => c.status === (filter as ClaimStatus));
    const q = search.trim().toLowerCase();
    if (!q) return byStatus;
    return byStatus.filter((c) => {
      const name = c.subject_entity?.canonical_name?.toLowerCase() ?? '';
      const pred = (c.predicate ?? '').toLowerCase();
      return name.includes(q) || pred.includes(q);
    });
  }, [claims, filter, search]);

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

  const enterSelectMode = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectMode(true);
  }, []);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelectedIds(new Set());
  }, []);

  const toggleSelect = useCallback((id: string) => {
    Haptics.selectionAsync();
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleBatchApprove = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    await batchApprove(ids);
    exitSelectMode();
  }, [selectedIds, batchApprove, exitSelectMode]);

  const renderItem = useCallback(
    ({ item }: { item: QueueClaim }) => (
      <ClaimCard
        claim={item}
        onApprove={() => approve(item.id)}
        onReject={() => setRejectTarget(item.id)}
        selectMode={selectMode}
        selected={selectedIds.has(item.id)}
        onToggleSelect={() => toggleSelect(item.id)}
      />
    ),
    [approve, selectMode, selectedIds, toggleSelect]
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
        <Pressable
          onLongPress={enterSelectMode}
          delayLongPress={400}
          style={({ pressed }) => [
            styles.countBadge,
            selectMode && styles.countBadgeActive,
            pressed && { opacity: 0.7 },
          ]}
        >
          <Text
            style={[styles.countText, selectMode && styles.countTextActive]}
          >
            {filteredClaims.length}
          </Text>
        </Pressable>
      </View>
      <Text style={styles.headerSub}>Claims pending governance review</Text>

      {/* Search bar */}
      <View style={styles.searchWrap}>
        <Ionicons name="search" size={16} color={colors.slate} />
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Search by entity or predicate…"
          placeholderTextColor={colors.slate}
          style={styles.searchInput}
          autoCorrect={false}
          autoCapitalize="none"
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch('')} hitSlop={8}>
            <Ionicons name="close-circle" size={16} color={colors.slate} />
          </Pressable>
        )}
      </View>

      {/* Filter chips */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.filterScroll}
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

      {selectMode && (
        <View
          style={[
            styles.batchBar,
            { paddingBottom: Math.max(insets.bottom + spacing.sm, spacing.lg) },
          ]}
        >
          <Pressable
            onPress={exitSelectMode}
            style={({ pressed }) => [
              styles.batchCancelBtn,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text style={styles.batchCancelText}>Cancel</Text>
          </Pressable>
          <Pressable
            onPress={handleBatchApprove}
            disabled={selectedIds.size === 0}
            style={({ pressed }) => [
              styles.batchApproveBtn,
              selectedIds.size === 0 && styles.batchApproveDisabled,
              pressed && selectedIds.size > 0 && { opacity: 0.85 },
            ]}
          >
            <Ionicons name="checkmark-done" size={18} color={colors.obsidian} />
            <Text style={styles.batchApproveText}>
              Approve {selectedIds.size || ''}
            </Text>
          </Pressable>
        </View>
      )}
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
  countBadgeActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  countText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  countTextActive: {
    color: colors.obsidian,
  },
  batchBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  batchCancelBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceCard,
    justifyContent: 'center',
    alignItems: 'center',
  },
  batchCancelText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.silver,
  },
  batchApproveBtn: {
    flex: 1,
    flexDirection: 'row',
    gap: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 14,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  batchApproveDisabled: {
    opacity: 0.35,
  },
  batchApproveText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 15,
    color: colors.obsidian,
    letterSpacing: -0.2,
  },
  headerSub: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.alabaster,
    paddingVertical: 0,
  },
  filterScroll: {
    flexGrow: 0,
    height: 44,
    marginBottom: 12,
  },
  filterRow: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    alignItems: 'center',
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minWidth: 72,
    paddingHorizontal: 14,
    paddingVertical: 8,
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
