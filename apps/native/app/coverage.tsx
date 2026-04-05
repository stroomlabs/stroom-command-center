import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import type { CoverageGapEntity } from '@stroom/supabase';
import { useCoverageGaps } from '../src/hooks/useCoverageGaps';
import { useBrandToast } from '../src/components/BrandToast';
import { EmptyState } from '../src/components/EmptyState';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

export default function CoverageGapsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { gaps, loading, error, refresh } = useCoverageGaps(3);
  const { show: showToast } = useBrandToast();
  const [refreshing, setRefreshing] = React.useState(false);

  const copyResearchPrompt = async (entity: CoverageGapEntity) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const name = entity.canonical_name ?? 'this entity';
    const type = entity.entity_type ?? 'entity';
    const prompt = `You are researching the "${type}" entity "${name}" for a knowledge graph.

Current coverage in our graph: ${entity.claim_count} claim${entity.claim_count === 1 ? '' : 's'}.

Please research this entity and return structured facts we should add. For each fact include:
  - claim_text: the statement, phrased precisely
  - source_url: primary source URL (prefer official sites, press releases, gov records)
  - source_name: publisher / outlet
  - confidence: 0–10
  - predicate: short snake_case key (e.g. "founded_at", "headquarters_city")

Focus on biography, affiliations, timeline events, relationships, and recent activity. Prefer primary sources over aggregators. Return the result as a JSON array.`;
    try {
      await Clipboard.setStringAsync(prompt);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast('Prompt copied to clipboard', 'success');
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast('Copy failed', 'error');
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const grouped = useMemo(() => {
    const map = new Map<string, CoverageGapEntity[]>();
    for (const g of gaps) {
      const key = g.entity_type ?? 'uncategorized';
      const arr = map.get(key) ?? [];
      arr.push(g);
      map.set(key, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [gaps]);

  const openEntity = (id: string) => {
    router.push({ pathname: '/entity/[id]', params: { id } } as any);
  };

  const research = (entity: CoverageGapEntity) => {
    Haptics.selectionAsync();
    const name = entity.canonical_name ?? 'this entity';
    router.push({
      pathname: '/(tabs)/command',
      params: { prompt: `What do we know about ${name} and what's missing?` },
    } as any);
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
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Coverage Gaps</Text>
        <Text style={styles.subtitle}>
          {gaps.length} {gaps.length === 1 ? 'entity' : 'entities'} with fewer than 3 claims
        </Text>
      </View>

      {loading && gaps.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error && gaps.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : gaps.length === 0 ? (
        <EmptyState
          icon="analytics"
          title="Full Coverage"
          subtitle="No coverage gaps detected"
        />
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
        >
          {grouped.map(([type, entities]) => (
            <View key={type} style={styles.group}>
              <View style={styles.groupHeader}>
                <Text style={styles.groupLabel}>{type}</Text>
                <Text style={styles.groupCount}>
                  {entities.length} {entities.length === 1 ? 'entity' : 'entities'}
                </Text>
              </View>
              {entities.map((g) => (
                <View key={g.id} style={styles.row}>
                  <Pressable
                    onPress={() => openEntity(g.id)}
                    style={({ pressed }) => [
                      styles.rowBody,
                      pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
                    ]}
                  >
                    <Text style={styles.rowName} numberOfLines={1}>
                      {g.canonical_name ?? 'Unnamed entity'}
                    </Text>
                    <View style={styles.rowMeta}>
                      <View style={styles.countChip}>
                        <Text
                          style={[
                            styles.countText,
                            g.claim_count === 0 && styles.countTextZero,
                          ]}
                        >
                          {g.claim_count}
                        </Text>
                        <Text style={styles.countLabel}>
                          {g.claim_count === 1 ? 'claim' : 'claims'}
                        </Text>
                      </View>
                      {g.entity_type && (
                        <Text style={styles.rowType}>{g.entity_type}</Text>
                      )}
                    </View>
                  </Pressable>
                  <View style={styles.researchActions}>
                    <Pressable
                      onPress={() => research(g)}
                      style={({ pressed }) => [
                        styles.researchBtn,
                        pressed && { opacity: 0.75 },
                      ]}
                    >
                      <Ionicons name="sparkles-outline" size={14} color={colors.teal} />
                      <Text style={styles.researchText}>Research</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => copyResearchPrompt(g)}
                      style={({ pressed }) => [
                        styles.promptBtn,
                        pressed && { opacity: 0.75 },
                      ]}
                      hitSlop={4}
                    >
                      <Ionicons name="copy-outline" size={12} color={colors.teal} />
                      <Text style={styles.promptBtnText}>Prompt</Text>
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          ))}
        </ScrollView>
      )}
    </LinearGradient>
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
    marginTop: 2,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.lg,
  },
  group: {
    gap: spacing.xs,
  },
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 4,
    paddingHorizontal: 2,
  },
  groupLabel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.slate,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  groupCount: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    paddingHorizontal: spacing.md,
  },
  rowBody: {
    flex: 1,
    gap: 4,
  },
  rowName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  countChip: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 4,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  countText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: colors.statusPending,
    fontVariant: ['tabular-nums'],
  },
  countTextZero: {
    color: colors.statusReject,
  },
  countLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  rowType: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    textTransform: 'uppercase',
  },
  researchActions: {
    alignItems: 'flex-end',
    gap: 4,
  },
  researchBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: radius.sm,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  promptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  promptBtnText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.teal,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  researchText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.teal,
    letterSpacing: -0.1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
    textAlign: 'center',
  },
  emptyTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 18,
    color: colors.alabaster,
    marginTop: spacing.sm,
  },
  emptyBody: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    textAlign: 'center',
  },
});
