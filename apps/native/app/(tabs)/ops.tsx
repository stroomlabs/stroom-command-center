import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { usePulseData } from '../../src/hooks/usePulseData';
import { useGraphHealth } from '../../src/hooks/useGraphHealth';
import { GlowSpot } from '../../src/components/GlowSpot';
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
  const { data: pulse } = usePulseData();
  const { health, refresh: refreshHealth } = useGraphHealth();
  const [refreshing, setRefreshing] = React.useState(false);

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
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            tintColor={colors.teal}
          />
        }
      >
        {cards.map((card) => (
          <OpsCard
            key={card.key}
            spec={card}
            onPress={() => router.push(card.route as any)}
          />
        ))}
      </ScrollView>
    </LinearGradient>
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
