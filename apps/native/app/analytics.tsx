import React, { useEffect, useMemo, useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import supabase from '../src/lib/supabase';
import { GlowSpot } from '../src/components/GlowSpot';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

interface DayBucket {
  date: string;
  label: string;
  count: number;
}

interface TopEntity {
  id: string;
  name: string;
  edits: number;
}

interface AnalyticsData {
  approvedByDay: DayBucket[];
  avgDraftToApprovedHours: number | null;
  topEntities: TopEntity[];
  sourceUtilizationPct: number;
  sourcesActive: number;
  sourcesTotal: number;
}

const MS_PER_DAY = 86_400_000;

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function shortDayLabel(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short' });
}

export default function AnalyticsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = React.useCallback(async () => {
    try {
      const now = new Date();
      const sevenDaysAgo = new Date(now.getTime() - 7 * MS_PER_DAY);
      const thirtyDaysAgo = new Date(now.getTime() - 30 * MS_PER_DAY);

      // 1) Approvals per day (last 7 days) — read from audit_log
      const { data: approvals } = await supabase
        .from('audit_log')
        .select('created_at, action_type')
        .in('action_type', ['approve', 'auto_approve'])
        .gte('created_at', sevenDaysAgo.toISOString());

      const buckets: DayBucket[] = [];
      for (let i = 6; i >= 0; i--) {
        const day = startOfDay(new Date(now.getTime() - i * MS_PER_DAY));
        buckets.push({
          date: day.toISOString().slice(0, 10),
          label: shortDayLabel(day),
          count: 0,
        });
      }
      for (const row of (approvals as any[]) ?? []) {
        const dayKey = new Date(row.created_at).toISOString().slice(0, 10);
        const b = buckets.find((x) => x.date === dayKey);
        if (b) b.count += 1;
      }

      // 2) Governance velocity — avg delta between created_at and updated_at
      //    for claims in 'approved' or 'published' status from the last 30d.
      const { data: velocityRows } = await supabase
        .from('claims')
        .select('created_at, updated_at, status')
        .in('status', ['approved', 'published'])
        .gte('updated_at', thirtyDaysAgo.toISOString())
        .limit(500);

      let avgHours: number | null = null;
      const vrows = (velocityRows as any[]) ?? [];
      if (vrows.length > 0) {
        const deltas = vrows
          .map((r) => {
            const a = new Date(r.created_at).getTime();
            const b = new Date(r.updated_at).getTime();
            return b - a;
          })
          .filter((d) => d > 0);
        if (deltas.length > 0) {
          const avgMs = deltas.reduce((s, d) => s + d, 0) / deltas.length;
          avgHours = avgMs / (1000 * 60 * 60);
        }
      }

      // 3) Top 5 most-edited entities — count audit_log rows that target
      //    claims whose subject_entity_id is the entity. Approximation: pull
      //    recent claim-targeted audit rows, join via claim lookup, bucket.
      const { data: editRows } = await supabase
        .from('audit_log')
        .select('entity_id, action_type')
        .eq('entity_table', 'claims')
        .in('action_type', ['update', 'correct'])
        .gte('created_at', thirtyDaysAgo.toISOString())
        .limit(500);

      const claimIds = Array.from(
        new Set(((editRows as any[]) ?? []).map((r) => r.entity_id).filter(Boolean))
      );

      let topEntities: TopEntity[] = [];
      if (claimIds.length > 0) {
        const { data: claimRows } = await supabase
          .from('claims')
          .select(
            'id, subject_entity_id, subject_entity:entities!claims_subject_entity_id_fkey(canonical_name)'
          )
          .in('id', claimIds);

        const entityMap = new Map<
          string,
          { id: string; name: string; edits: number }
        >();
        const claimToEntity = new Map<string, { id: string; name: string }>();
        for (const c of (claimRows as any[]) ?? []) {
          if (!c.subject_entity_id) continue;
          claimToEntity.set(c.id, {
            id: c.subject_entity_id,
            name: c.subject_entity?.canonical_name ?? 'Unnamed',
          });
        }
        for (const row of (editRows as any[]) ?? []) {
          const ent = claimToEntity.get(row.entity_id);
          if (!ent) continue;
          const existing = entityMap.get(ent.id);
          if (existing) existing.edits += 1;
          else entityMap.set(ent.id, { id: ent.id, name: ent.name, edits: 1 });
        }
        topEntities = Array.from(entityMap.values())
          .sort((a, b) => b.edits - a.edits)
          .slice(0, 5);
      }

      // 4) Source utilization — sources with at least one claim in the last
      //    30 days / total sources.
      const { count: totalSources } = await supabase
        .from('sources')
        .select('id', { count: 'exact', head: true });

      const { data: recentClaimSources } = await supabase
        .from('claims')
        .select('source_id')
        .gte('created_at', thirtyDaysAgo.toISOString())
        .limit(2000);

      const activeSourceIds = new Set(
        ((recentClaimSources as any[]) ?? [])
          .map((r) => r.source_id)
          .filter(Boolean)
      );
      const sourcesActive = activeSourceIds.size;
      const sourcesTotal = totalSources ?? 0;
      const sourceUtilizationPct =
        sourcesTotal > 0
          ? Math.round((sourcesActive / sourcesTotal) * 100)
          : 0;

      setData({
        approvedByDay: buckets,
        avgDraftToApprovedHours: avgHours,
        topEntities,
        sourceUtilizationPct,
        sourcesActive,
        sourcesTotal,
      });
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const maxDay = useMemo(
    () =>
      data?.approvedByDay.reduce((m, b) => Math.max(m, b.count), 0) ?? 0,
    [data]
  );

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <GlowSpot size={420} opacity={0.06} top={insets.top + 40} left={-100} breathe />

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Ops</Text>
        </Pressable>
        <Text style={styles.title}>Analytics</Text>
        <Text style={styles.subtitle}>Governance pulse over the last 30 days</Text>
      </View>

      {loading && !data ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : data ? (
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
          {/* Approvals per day */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>APPROVALS · LAST 7 DAYS</Text>
            <View style={styles.barsRow}>
              {data.approvedByDay.map((b) => {
                const pct = maxDay > 0 ? b.count / maxDay : 0;
                return (
                  <View key={b.date} style={styles.barCol}>
                    <Text style={styles.barCount}>{b.count}</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[
                          styles.barFill,
                          {
                            height: `${Math.max(4, pct * 100)}%`,
                            backgroundColor:
                              pct > 0 ? colors.teal : 'rgba(255,255,255,0.06)',
                          },
                        ]}
                      />
                    </View>
                    <Text style={styles.barLabel}>{b.label}</Text>
                  </View>
                );
              })}
            </View>
          </View>

          {/* Velocity */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>GOVERNANCE VELOCITY</Text>
            <View style={styles.velocityRow}>
              <Text style={styles.velocityValue}>
                {data.avgDraftToApprovedHours == null
                  ? '—'
                  : data.avgDraftToApprovedHours < 1
                  ? `${Math.round(data.avgDraftToApprovedHours * 60)}m`
                  : data.avgDraftToApprovedHours < 48
                  ? `${data.avgDraftToApprovedHours.toFixed(1)}h`
                  : `${(data.avgDraftToApprovedHours / 24).toFixed(1)}d`}
              </Text>
              <Text style={styles.velocityHint}>
                avg draft → approved, last 30d
              </Text>
            </View>
          </View>

          {/* Top edited entities */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>TOP EDITED ENTITIES · 30 DAYS</Text>
            {data.topEntities.length === 0 ? (
              <Text style={styles.emptyText}>No edits in the last 30 days.</Text>
            ) : (
              data.topEntities.map((e, i) => (
                <Pressable
                  key={e.id}
                  onPress={() =>
                    router.push({ pathname: '/entity/[id]', params: { id: e.id } } as any)
                  }
                  style={({ pressed }) => [
                    styles.topRow,
                    pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <Text style={styles.topRank}>{i + 1}</Text>
                  <Text style={styles.topName} numberOfLines={1}>
                    {e.name}
                  </Text>
                  <Text style={styles.topCount}>{e.edits}</Text>
                  <Ionicons name="chevron-forward" size={12} color={colors.slate} />
                </Pressable>
              ))
            )}
          </View>

          {/* Source utilization */}
          <View style={styles.card}>
            <Text style={styles.cardLabel}>SOURCE UTILIZATION · 30 DAYS</Text>
            <View style={styles.utilRow}>
              <Text style={styles.utilPct}>{data.sourceUtilizationPct}%</Text>
              <Text style={styles.utilHint}>
                {data.sourcesActive} of {data.sourcesTotal} sources active
              </Text>
            </View>
            <View style={styles.utilTrack}>
              <View
                style={[
                  styles.utilFill,
                  { width: `${Math.max(2, data.sourceUtilizationPct)}%` },
                ]}
              />
            </View>
          </View>
        </ScrollView>
      ) : null}
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
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
  },
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
  },
  barsRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 140,
    gap: 6,
  },
  barCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  barCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.silver,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    width: '100%',
    height: 100,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.02)',
    borderRadius: 4,
    overflow: 'hidden',
  },
  barFill: {
    width: '100%',
    borderRadius: 4,
  },
  barLabel: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
  },
  velocityRow: {
    alignItems: 'baseline',
    flexDirection: 'row',
    gap: spacing.sm,
  },
  velocityValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 32,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  velocityHint: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    flex: 1,
  },
  emptyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    paddingVertical: spacing.sm,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  topRank: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    color: colors.teal,
    width: 18,
    textAlign: 'center',
  },
  topName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
    flex: 1,
  },
  topCount: {
    fontFamily: fonts.mono.medium,
    fontSize: 12,
    color: colors.silver,
    fontVariant: ['tabular-nums'],
  },
  utilRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: spacing.sm,
    justifyContent: 'space-between',
  },
  utilPct: {
    fontFamily: fonts.mono.semibold,
    fontSize: 28,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  utilHint: {
    fontFamily: fonts.archivo.regular,
    fontSize: 11,
    color: colors.slate,
  },
  utilTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  utilFill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: 3,
  },
});
