import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueueClaims } from '../../src/hooks/useQueueClaims';
import { ClaimCard } from '../../src/components/ClaimCard';
import { RejectSheet } from '../../src/components/RejectSheet';
import type { RejectionReason } from '@stroom/types';
import type { QueueClaim } from '@stroom/supabase';
import { colors, fonts, spacing, gradient } from '../../src/constants/brand';

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const { claims, loading, error, refresh, approve, reject } = useQueueClaims();
  const [refreshing, setRefreshing] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);

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
          <Text style={styles.countText}>{claims.length}</Text>
        </View>
      </View>
      <Text style={styles.headerSub}>Claims pending governance review</Text>

      {loading && claims.length === 0 ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error && claims.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : claims.length === 0 ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyIcon}>✓</Text>
          <Text style={styles.emptyTitle}>Queue clear</Text>
          <Text style={styles.emptyBody}>
            No claims pending review. New claims will appear here in real time.
          </Text>
        </View>
      ) : (
        <FlatList
          data={claims}
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
    marginBottom: spacing.lg,
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
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
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
