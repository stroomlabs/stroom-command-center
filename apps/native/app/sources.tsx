import React, { useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import type { Source } from '@stroom/types';
import { useSourcesList } from '../src/hooks/useSourcesList';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

export default function SourcesListScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { sources, claimCounts, loading, error, refresh } = useSourcesList();
  const [refreshing, setRefreshing] = React.useState(false);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  }, [refresh]);

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
          <Text style={styles.backText}>Pulse</Text>
        </Pressable>
        <Text style={styles.title}>Sources</Text>
        <Text style={styles.subtitle}>
          {sources.length} {sources.length === 1 ? 'source' : 'sources'} · sorted by trust
        </Text>
      </View>

      {loading && sources.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error && sources.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : sources.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="cube-outline" size={32} color={colors.slate} />
          <Text style={styles.emptyText}>No sources yet</Text>
        </View>
      ) : (
        <FlatList
          data={sources}
          keyExtractor={(s) => s.id}
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
          renderItem={({ item }) => (
            <SourceRow
              source={item}
              claimCount={claimCounts.get(item.id) ?? 0}
              onPress={() =>
                router.push({
                  pathname: '/source/[id]',
                  params: { id: item.id },
                } as any)
              }
            />
          )}
        />
      )}
    </LinearGradient>
  );
}

function SourceRow({
  source,
  claimCount,
  onPress,
}: {
  source: Source;
  claimCount: number;
  onPress: () => void;
}) {
  const score = Number(source.trust_score);
  const color =
    score >= 7.5
      ? colors.statusApprove
      : score >= 5
      ? colors.statusPending
      : colors.statusReject;
  const pct = Math.max(0, Math.min(10, score)) * 10;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.row,
        pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
      ]}
    >
      <View style={styles.rowHeader}>
        <Text style={styles.rowName} numberOfLines={1}>
          {source.source_name}
        </Text>
        <View style={styles.claimCountChip}>
          <Text style={styles.claimCountText}>{claimCount}</Text>
          <Text style={styles.claimCountLabel}>
            {claimCount === 1 ? 'claim' : 'claims'}
          </Text>
        </View>
        <Text style={[styles.rowScore, { color }]}>{score.toFixed(1)}</Text>
      </View>
      <View style={styles.rowMeta}>
        {source.source_class && (
          <Text style={styles.rowMetaText}>{source.source_class}</Text>
        )}
        {source.domain && (
          <>
            <Text style={styles.rowMetaDot}>·</Text>
            <Text style={styles.rowMetaText} numberOfLines={1}>
              {source.domain}
            </Text>
          </>
        )}
        {source.auto_approve && (
          <>
            <Text style={styles.rowMetaDot}>·</Text>
            <Text style={[styles.rowMetaText, { color: colors.teal }]}>
              auto-approve
            </Text>
          </>
        )}
      </View>
      <View style={styles.rowBar}>
        <View
          style={[styles.rowBarFill, { width: `${pct}%`, backgroundColor: color }]}
        />
      </View>
    </Pressable>
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
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  row: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 6,
  },
  rowHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  rowName: {
    flex: 1,
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.alabaster,
  },
  rowScore: {
    fontFamily: fonts.mono.semibold,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
  },
  claimCountChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  claimCountText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  claimCountLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowMetaText: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  rowMetaDot: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  rowBar: {
    marginTop: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.05)',
    overflow: 'hidden',
  },
  rowBarFill: {
    height: '100%',
    borderRadius: 2,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
  },
  emptyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
  },
});
