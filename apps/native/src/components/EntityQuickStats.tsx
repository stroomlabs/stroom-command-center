import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Modal, Dimensions } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import supabase from '../lib/supabase';
import { colors, fonts, spacing, radius } from '../constants/brand';

// Floating quick-stats card that appears near a long-press location on any
// entity name. Shows core entity metrics without navigating away from the
// current screen. Dismiss by tapping anywhere outside.
interface EntityQuickStatsProps {
  entityId: string | null;
  entityName?: string;
  y?: number; // pageY from the gesture event
  onDismiss: () => void;
}

interface QuickStats {
  domain: string | null;
  claimCount: number;
  publishedCount: number;
  topPredicates: string[];
  coveragePct: number;
}

export function EntityQuickStats({
  entityId,
  entityName,
  y = 300,
  onDismiss,
}: EntityQuickStatsProps) {
  const [stats, setStats] = useState<QuickStats | null>(null);

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;

    (async () => {
      const [entRes, claimsRes] = await Promise.all([
        supabase
          .schema('intel')
          .from('entities')
          .select('domain')
          .eq('id', entityId)
          .single(),
        supabase
          .schema('intel')
          .from('claims')
          .select('predicate, status')
          .eq('subject_entity_id', entityId),
      ]);

      if (cancelled) return;
      const claims = (claimsRes.data ?? []) as Array<{
        predicate: string;
        status: string;
      }>;
      const predCounts = new Map<string, number>();
      let published = 0;
      for (const c of claims) {
        if (c.status === 'published') published++;
        if (c.predicate) {
          predCounts.set(c.predicate, (predCounts.get(c.predicate) ?? 0) + 1);
        }
      }
      const topPreds = Array.from(predCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 3)
        .map(([k]) => {
          const last = k.includes('.') ? k.split('.').pop()! : k;
          return last.replace(/_/g, ' ');
        });
      const uniquePreds = new Set(claims.map((c) => c.predicate).filter(Boolean)).size;
      const coveragePct = Math.round(
        ((Math.min(1, claims.length / 10) + Math.min(1, uniquePreds / 5)) / 2) * 100
      );

      if (!cancelled) {
        setStats({
          domain: (entRes.data as any)?.domain ?? null,
          claimCount: claims.length,
          publishedCount: published,
          topPredicates: topPreds,
          coveragePct,
        });
      }
    })();

    return () => { cancelled = true; };
  }, [entityId]);

  if (!entityId) return null;

  // Position the card near the press, clamped to screen bounds.
  const screenH = Dimensions.get('window').height;
  const cardTop = Math.min(Math.max(y - 80, 60), screenH - 260);

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={[styles.card, { top: cardTop }]}
        >
          <Text style={styles.name} numberOfLines={1}>
            {entityName ?? 'Entity'}
          </Text>
          {stats ? (
            <>
              {stats.domain && (
                <View style={styles.domainBadge}>
                  <Text style={styles.domainText}>{stats.domain}</Text>
                </View>
              )}
              <View style={styles.statsRow}>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{stats.claimCount}</Text>
                  <Text style={styles.statLabel}>claims</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={styles.statValue}>{stats.publishedCount}</Text>
                  <Text style={styles.statLabel}>published</Text>
                </View>
                <View style={styles.statCell}>
                  <Text style={[styles.statValue, { color: colors.teal }]}>
                    {stats.coveragePct}%
                  </Text>
                  <Text style={styles.statLabel}>coverage</Text>
                </View>
              </View>
              {stats.topPredicates.length > 0 && (
                <Text style={styles.preds} numberOfLines={1}>
                  {stats.topPredicates.join(' · ')}
                </Text>
              )}
            </>
          ) : (
            <Text style={styles.loading}>Loading…</Text>
          )}
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
  },
  card: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    backgroundColor: 'rgba(31, 31, 31, 0.95)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    padding: spacing.md,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  name: {
    fontFamily: fonts.archivo.bold,
    fontSize: 16,
    color: colors.alabaster,
    marginBottom: 6,
  },
  domainBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.tealDim,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
    marginBottom: spacing.sm,
  },
  domainText: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    color: colors.teal,
  },
  statsRow: {
    flexDirection: 'row',
    gap: spacing.md,
    marginBottom: spacing.sm,
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 18,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  preds: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.silver,
    textAlign: 'center',
  },
  loading: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    textAlign: 'center',
    paddingVertical: spacing.md,
  },
});
