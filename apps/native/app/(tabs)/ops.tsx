import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { runAutoGovernance } from '@stroom/supabase';
import * as Haptics from 'expo-haptics';
import supabase from '../../src/lib/supabase';
import { usePulseData } from '../../src/hooks/usePulseData';
import { useGraphHealth } from '../../src/hooks/useGraphHealth';
import { useQueueClaims } from '../../src/hooks/useQueueClaims';
import { useSourcesList, pickUnhealthySources } from '../../src/hooks/useSourcesList';
import { GlowSpot } from '../../src/components/GlowSpot';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import { useBrandAlert } from '../../src/components/BrandAlert';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

interface OpsCardSpec {
  key: string;
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  summary: string;
  route: string;
  tone?: 'default' | 'warn' | 'alert';
}

export default function OpsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { data: pulse, refresh: refreshPulse } = usePulseData();
  const { health, refresh: refreshHealth } = useGraphHealth();
  const { refresh: refreshQueue } = useQueueClaims();
  const { sources } = useSourcesList();
  const unhealthy = useMemo(() => pickUnhealthySources(sources).slice(0, 6), [sources]);
  const { alert } = useBrandAlert();
  const [refreshing, setRefreshing] = React.useState(false);
  const [sweeping, setSweeping] = React.useState(false);
  const [autoApprovedToday, setAutoApprovedToday] = React.useState(0);

  // Count of audit_log rows today where an agent/system actor approved a claim.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from('audit_log')
        .select('id', { count: 'exact', head: false })
        .in('actor', ['agent', 'system'])
        .eq('action_type', 'approve')
        .gte('created_at', start.toISOString());
      if (!cancelled) setAutoApprovedToday((data as any[] | null)?.length ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [sweeping]);

  const handleSweep = async () => {
    if (sweeping) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSweeping(true);
    try {
      const result = await runAutoGovernance(supabase);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alert(
        'Sweep complete',
        `Approved ${result.approved} · Flagged ${result.flagged}${
          result.rejected > 0 ? ` · Rejected ${result.rejected}` : ''
        }`,
        [{ text: 'OK' }]
      );
      // Refresh dependent views
      refreshPulse();
      refreshQueue();
      refreshHealth();
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      alert('Sweep failed', e?.message ?? 'Unknown error');
    } finally {
      setSweeping(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshHealth();
    setRefreshing(false);
  };

  // Count actionable issues using the same thresholds we had on Pulse's Graph
  // Health card so the header summary stays consistent.
  const issueCount = useMemo(() => {
    if (!health) return 0;
    const totalSources = pulse?.totalSources ?? 0;
    const totalEntities = pulse?.totalEntities ?? 0;
    const totalClaims = pulse?.totalClaims ?? 0;
    const pct = (v: number, total: number) => (total > 0 ? (v / total) * 100 : 0);

    let n = 0;
    if (pct(health.stale_sources, totalSources) >= 5) n++;
    if (pct(health.orphaned_entities, totalEntities) >= 2) n++;
    if (pct(health.uncorroborated_claims, totalClaims) >= 30) n++;
    if (pct(health.single_source_claims, totalClaims) >= 40) n++;
    if (pct(health.low_confidence_claims, totalClaims) >= 15) n++;
    if (Number(health.avg_trust_score) < 7) n++;
    if (Number(health.sources_failing) > 0) n++;
    return n;
  }, [health, pulse]);

  const headerSummary =
    health == null
      ? 'Loading health signals…'
      : issueCount === 0
      ? 'All systems nominal'
      : `${issueCount} issue${issueCount === 1 ? '' : 's'} detected`;

  const graphHealthSummary = useMemo(() => {
    if (!health) return 'Loading…';
    const parts: string[] = [];
    parts.push(`${health.stale_sources.toLocaleString()} stale`);
    parts.push(`${health.orphaned_entities.toLocaleString()} orphaned`);
    parts.push(`${health.low_confidence_claims.toLocaleString()} low conf`);
    return parts.join(' · ');
  }, [health]);

  const queueSummary =
    pulse?.queueDepth != null
      ? `${pulse.queueDepth.toLocaleString()} pending review`
      : '—';

  const researchSummary =
    pulse?.researchActive != null
      ? `${pulse.researchActive.toLocaleString()} active jobs`
      : '—';

  const sourcesSummary =
    pulse?.totalSources != null
      ? `${pulse.totalSources.toLocaleString()} tracked`
      : '—';

  const cards: OpsCardSpec[] = [
    {
      key: 'graph-health',
      icon: 'pulse',
      title: 'Graph Health',
      summary: graphHealthSummary,
      route: '/coverage',
      tone: issueCount > 0 ? 'warn' : 'default',
    },
    {
      key: 'audit',
      icon: 'analytics-outline',
      title: 'Audit Trail',
      summary: 'Operator & agent actions',
      route: '/audit',
    },
    {
      key: 'research',
      icon: 'flask-outline',
      title: 'Research Queue',
      summary: researchSummary,
      route: '/research',
    },
    {
      key: 'coverage',
      icon: 'git-network-outline',
      title: 'Coverage Gaps',
      summary: 'Entities with fewer than 3 claims',
      route: '/coverage',
    },
    {
      key: 'sources',
      icon: 'cube-outline',
      title: 'Sources',
      summary: sourcesSummary,
      route: '/sources',
    },
    {
      key: 'policies',
      icon: 'shield-checkmark-outline',
      title: 'Policies',
      summary: 'Auto-governance rules',
      route: '/policies',
    },
  ];

  return (
    <ScreenTransition>
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <GlowSpot size={480} opacity={0.06} top={insets.top + 20} left={-140} />

      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.headerTitle}>Ops</Text>
          <Text style={styles.headerSub}>{headerSummary}</Text>
          {pulse && (
            <Text style={styles.headerDetail}>
              {(health?.stale_sources ?? 0).toLocaleString()} stale sources ·{' '}
              {(health?.orphaned_entities ?? 0).toLocaleString()} orphaned entities
            </Text>
          )}
        </View>
        <Pressable
          onPress={() => router.push('/more' as any)}
          style={({ pressed }) => [styles.gearBtn, pressed && { opacity: 0.6 }]}
          hitSlop={8}
        >
          <Ionicons name="settings-outline" size={20} color={colors.silver} />
        </Pressable>
      </View>

      <ScrollView
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
      >
        {/* Dashboard summary — 2×2 mini metrics */}
        <View style={styles.summaryGrid}>
          <SummaryCell
            label="Queue Depth"
            value={pulse?.queueDepth ?? 0}
            tone={
              (pulse?.queueDepth ?? 0) > 50
                ? 'alert'
                : (pulse?.queueDepth ?? 0) > 10
                ? 'warn'
                : 'ok'
            }
          />
          <SummaryCell
            label="Issues Detected"
            value={issueCount}
            tone={issueCount >= 4 ? 'alert' : issueCount > 0 ? 'warn' : 'ok'}
          />
          <SummaryCell
            label="Sources Stale"
            value={unhealthy.filter((u) => u.issue === 'stale').length}
            tone={
              unhealthy.filter((u) => u.issue === 'stale').length > 3
                ? 'alert'
                : unhealthy.filter((u) => u.issue === 'stale').length > 0
                ? 'warn'
                : 'ok'
            }
          />
          <SummaryCell
            label="Auto-Approved"
            sublabel="today"
            value={autoApprovedToday}
            tone="ok"
          />
        </View>

        {/* Primary action — Run Sweep */}
        <Pressable
          onPress={handleSweep}
          disabled={sweeping}
          style={({ pressed }) => [
            styles.sweepBtn,
            (pressed || sweeping) && { opacity: 0.85 },
          ]}
        >
          {sweeping ? (
            <ActivityIndicator size="small" color={colors.obsidian} />
          ) : (
            <Ionicons name="sparkles" size={18} color={colors.obsidian} />
          )}
          <Text style={styles.sweepText}>
            {sweeping ? 'Sweeping…' : 'Run Governance Sweep'}
          </Text>
        </Pressable>

        {cards.map((card) => (
          <OpsCard
            key={card.key}
            spec={card}
            onPress={() => router.push(card.route as any)}
          />
        ))}

        {/* Source health monitoring */}
        {unhealthy.length > 0 && (
          <View style={styles.healthBlock}>
            <Text style={styles.healthHeader}>SOURCE HEALTH</Text>
            {unhealthy.map((u) => {
              const tone =
                u.issue === 'failing'
                  ? colors.statusReject
                  : u.issue === 'low-trust'
                  ? colors.statusReject
                  : colors.statusPending;
              const label =
                u.issue === 'failing'
                  ? 'FAILING'
                  : u.issue === 'stale'
                  ? 'STALE'
                  : 'LOW TRUST';
              return (
                <View key={u.source.id} style={styles.healthRow}>
                  <View style={[styles.healthDot, { backgroundColor: tone }]} />
                  <View style={styles.healthBody}>
                    <Text style={styles.healthName} numberOfLines={1}>
                      {u.source.source_name}
                    </Text>
                    <Text style={[styles.healthIssue, { color: tone }]}>
                      {label} · trust {Number(u.source.trust_score).toFixed(1)}
                    </Text>
                  </View>
                  <Pressable
                    onPress={() =>
                      router.push({
                        pathname: '/source/[id]',
                        params: { id: u.source.id },
                      } as any)
                    }
                    style={({ pressed }) => [
                      styles.healthCheckBtn,
                      pressed && { opacity: 0.7 },
                    ]}
                  >
                    <Text style={styles.healthCheckText}>Check</Text>
                    <Ionicons name="chevron-forward" size={12} color={colors.teal} />
                  </Pressable>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>
    </LinearGradient>
    </ScreenTransition>
  );
}

type SummaryTone = 'ok' | 'warn' | 'alert';

function SummaryCell({
  label,
  value,
  sublabel,
  tone,
}: {
  label: string;
  value: number;
  sublabel?: string;
  tone: SummaryTone;
}) {
  const dotColor =
    tone === 'alert'
      ? colors.statusReject
      : tone === 'warn'
      ? colors.statusPending
      : colors.statusApprove;
  return (
    <View style={styles.summaryCell}>
      <View style={styles.summaryHeader}>
        <View style={[styles.summaryDot, { backgroundColor: dotColor }]} />
        <Text style={styles.summaryLabel} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text style={styles.summaryValue}>{value.toLocaleString()}</Text>
      {sublabel && <Text style={styles.summarySublabel}>{sublabel}</Text>}
    </View>
  );
}

function OpsCard({
  spec,
  onPress,
}: {
  spec: OpsCardSpec;
  onPress: () => void;
}) {
  const toneBorder =
    spec.tone === 'alert'
      ? colors.statusReject
      : spec.tone === 'warn'
      ? 'rgba(245, 158, 11, 0.45)'
      : 'rgba(0, 161, 155, 0.25)';
  const iconColor =
    spec.tone === 'alert'
      ? colors.statusReject
      : spec.tone === 'warn'
      ? colors.statusPending
      : colors.teal;
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.card,
        { borderColor: toneBorder },
        pressed && { opacity: 0.75, transform: [{ scale: 0.985 }] },
      ]}
    >
      <View style={[styles.cardIcon, { borderColor: toneBorder }]}>
        <Ionicons name={spec.icon} size={18} color={iconColor} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardTitle}>{spec.title}</Text>
        <Text style={styles.cardSummary} numberOfLines={1}>
          {spec.summary}
        </Text>
      </View>
      <Ionicons name="chevron-forward" size={16} color={colors.slate} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
    gap: spacing.md,
  },
  headerTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.alabaster,
    letterSpacing: -0.8,
  },
  headerSub: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.teal,
    marginTop: 4,
    letterSpacing: -0.1,
  },
  headerDetail: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  gearBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  summaryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  summaryCell: {
    flexBasis: '48%',
    flexGrow: 1,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 4,
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  summaryDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  summaryLabel: {
    flex: 1,
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  summaryValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 22,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
    marginTop: 2,
  },
  summarySublabel: {
    fontFamily: fonts.mono.regular,
    fontSize: 9,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sweepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.teal,
    paddingVertical: 16,
    borderRadius: radius.lg,
    marginBottom: spacing.sm,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 6,
  },
  sweepText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 15,
    color: colors.obsidian,
    letterSpacing: -0.2,
  },
  healthBlock: {
    marginTop: spacing.lg,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  healthHeader: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  healthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  healthDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  healthBody: {
    flex: 1,
    gap: 2,
  },
  healthName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
  },
  healthIssue: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  healthCheckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: radius.sm,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  healthCheckText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.teal,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingVertical: spacing.md + 2,
    paddingHorizontal: spacing.md,
    // Atmospheric teal glow on the glass border
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 2,
  },
  cardIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  cardBody: {
    flex: 1,
    gap: 3,
  },
  cardTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.alabaster,
    letterSpacing: -0.2,
  },
  cardSummary: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
  },
});
