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
import { useNavigation, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { runAutoGovernance } from '@stroom/supabase';
import * as Haptics from 'expo-haptics';
import supabase from '../../src/lib/supabase';
import { usePulseContext } from '../../src/lib/PulseContext';
import { useGraphHealth } from '../../src/hooks/useGraphHealth';
import { useQueueClaims } from '../../src/hooks/useQueueClaims';
import { useSourcesList, pickUnhealthySources } from '../../src/hooks/useSourcesList';
import { GlowSpot } from '../../src/components/GlowSpot';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import { useBrandAlert } from '../../src/components/BrandAlert';
import { EmptyState } from '../../src/components/EmptyState';
import { RetryCard } from '../../src/components/RetryCard';
import { Skeleton } from '../../src/components/Skeleton';
import {
  ActionSheet,
  type ActionSheetAction,
} from '../../src/components/ActionSheet';
import * as Clipboard from 'expo-clipboard';
import { Share } from 'react-native';
import { useBrandToast } from '../../src/components/BrandToast';
import { BackgroundCanvas } from '../../src/components/BackgroundCanvas';
import { CollapsibleSection } from '../../src/components/CollapsibleSection';
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
  const navigation = useNavigation();
  const scrollRef = React.useRef<ScrollView>(null);

  React.useEffect(() => {
    const unsub = (navigation as any).addListener?.('tabPress', () => {
      if ((navigation as any).isFocused?.()) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    });
    return unsub;
  }, [navigation]);
  const { data: pulse, refresh: refreshPulse } = usePulseContext();
  const { health, error: healthError, refresh: refreshHealth } = useGraphHealth();
  const { refresh: refreshQueue } = useQueueClaims();
  const { sources } = useSourcesList();
  const unhealthy = useMemo(() => pickUnhealthySources(sources).slice(0, 6), [sources]);

  // Source freshness alerts — high-trust auto-approve sources that haven't
  // fetched in 7+ days are the biggest risk vector. Surface them above
  // everything else so the operator sees them immediately.
  const staleAutoApprove = useMemo(() => {
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return sources.filter((s) => {
      if (!s.auto_approve) return false;
      const lastFetch = s.last_fetch_at ? new Date(s.last_fetch_at).getTime() : 0;
      return lastFetch > 0 && lastFetch < sevenDaysAgo;
    });
  }, [sources]);

  // Graph snapshot — comprehensive markdown report.
  const [snapshotText, setSnapshotText] = React.useState<string | null>(null);
  const [snapshotSheetVisible, setSnapshotSheetVisible] = React.useState(false);
  const [snapshotLoading, setSnapshotLoading] = React.useState(false);

  const { alert } = useBrandAlert();
  const { show: showToast } = useBrandToast();
  const [menuSource, setMenuSource] = React.useState<{
    id: string;
    source_name: string;
    source_url?: string | null;
  } | null>(null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [sweeping, setSweeping] = React.useState(false);
  const [autoApprovedToday, setAutoApprovedToday] = React.useState(0);
  const [lastSweep, setLastSweep] = React.useState<{
    at: string;
    processed: number;
  } | null>(null);

  // Analytics sections — each loads independently so a slow or failing
  // RPC never blocks the rest of the Ops screen.
  const [ingestion, setIngestion] = React.useState<
    Array<{ day: string; claims_added: number }> | null
  >(null);
  const [ingestionError, setIngestionError] = React.useState<string | null>(null);
  const [ingestionBump, setIngestionBump] = React.useState(0);
  const [sweepHistory, setSweepHistory] = React.useState<
    Array<{
      ran_at: string;
      approved: number;
      flagged: number;
      drafts_remaining: number;
    }> | null
  >(null);
  const [sweepHistoryError, setSweepHistoryError] = React.useState<string | null>(null);
  const [sweepHistoryBump, setSweepHistoryBump] = React.useState(0);
  const [verticals, setVerticals] = React.useState<
    Array<{ domain: string; claim_count: number }> | null
  >(null);
  const [verticalsError, setVerticalsError] = React.useState<string | null>(null);
  const [verticalsBump, setVerticalsBump] = React.useState(0);
  const [tooltip, setTooltip] = React.useState<{
    day: string;
    count: number;
  } | null>(null);

  // Fetch ingestion timeline (14 days)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .schema('intel')
          .rpc('get_ingestion_timeline', {
            days_back: 14,
          });
        if (cancelled) return;
        if (error) throw error;
        setIngestion((data as any[]) ?? []);
        setIngestionError(null);
      } catch (e: any) {
        if (!cancelled) setIngestionError(e?.message ?? 'RPC failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshing, ingestionBump]);

  // Fetch sweep history (last 5)
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .schema('intel')
          .rpc('get_sweep_history', {
            limit_count: 5,
          });
        if (cancelled) return;
        if (error) throw error;
        setSweepHistory((data as any[]) ?? []);
        setSweepHistoryError(null);
      } catch (e: any) {
        if (!cancelled) setSweepHistoryError(e?.message ?? 'RPC failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshing, sweeping, sweepHistoryBump]);

  // Fetch vertical breakdown
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase
          .schema('intel')
          .rpc('get_vertical_breakdown');
        if (cancelled) return;
        if (error) throw error;
        let rows: any[] = [];
        if (Array.isArray(data)) {
          rows = data;
        } else if (data && typeof data === 'object') {
          const inner =
            (data as any).claims_by_domain ??
            (data as any).verticals ??
            (data as any).domains ??
            (data as any).breakdown;
          if (Array.isArray(inner)) {
            rows = inner;
          } else {
            rows = Object.entries(data).map(([k, v]) => ({
              domain: k,
              claim_count: typeof v === 'number' ? v : (v as any)?.claim_count ?? 0,
            }));
          }
        }
        setVerticals(rows);
        setVerticalsError(null);
      } catch (e: any) {
        if (!cancelled) setVerticalsError(e?.message ?? 'RPC failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshing, verticalsBump]);

  // Query audit_log for the most recent sweep — rows tagged
  // metadata->>'batch' = 'true' with action_type = 'auto_approve'. Treat
  // rows within a ~5min burst window of the latest entry as one sweep.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .schema('intel')
        .from('audit_log')
        .select('created_at, metadata')
        .eq('action_type', 'auto_approve')
        .filter('metadata->>batch', 'eq', 'true')
        .order('created_at', { ascending: false })
        .limit(200);

      if (cancelled) return;
      const rows = (data as Array<{ created_at: string }> | null) ?? [];
      if (rows.length === 0) {
        setLastSweep(null);
        return;
      }
      const latest = new Date(rows[0].created_at).getTime();
      const windowStart = latest - 5 * 60_000;
      const processed = rows.filter(
        (r) => new Date(r.created_at).getTime() >= windowStart
      ).length;
      setLastSweep({ at: rows[0].created_at, processed });
    })();
    return () => {
      cancelled = true;
    };
  }, [sweeping, refreshing]);

  // Count of audit_log rows today with action_type = 'auto_approve'. Uses
  // an exact head-only count so we get the full number regardless of page
  // size, and re-runs on sweep + manual refresh so the value stays live.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      const { count } = await supabase
        .schema('intel')
        .from('audit_log')
        .select('id', { count: 'exact', head: true })
        .eq('action_type', 'auto_approve')
        .gte('created_at', start.toISOString());
      if (!cancelled) setAutoApprovedToday(count ?? 0);
    })();
    return () => {
      cancelled = true;
    };
  }, [sweeping, refreshing]);

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
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
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

  const generateSnapshot = React.useCallback(async () => {
    if (snapshotLoading) return;
    setSnapshotLoading(true);
    try {
      const [topEntRes, topSrcRes, domainRes, predCountRes] =
        await Promise.all([
          supabase
            .schema('intel')
            .from('entities')
            .select('canonical_name, entity_type, domain')
            .order('created_at', { ascending: false })
            .limit(10),
          supabase
            .schema('intel')
            .from('sources')
            .select('source_name, trust_score')
            .order('trust_score', { ascending: false })
            .limit(10),
          supabase.schema('intel').rpc('get_vertical_breakdown'),
          supabase
            .schema('intel')
            .from('predicate_registry')
            .select('predicate_key', { count: 'exact', head: true }),
        ]);

      const topEntities = ((topEntRes.data ?? []) as any[])
        .map(
          (e, i) =>
            `${i + 1}. **${e.canonical_name}** (${e.entity_type ?? 'entity'}, ${e.domain ?? 'no domain'})`
        )
        .join('\n');
      const topSources = ((topSrcRes.data ?? []) as any[])
        .map(
          (s, i) =>
            `${i + 1}. ${s.source_name} — trust ${Number(s.trust_score).toFixed(1)}`
        )
        .join('\n');
      // get_vertical_breakdown may return an array, an object with a
      // verticals/domains key, or null. Normalize to an array before sorting.
      let domainArr: any[] = [];
      const rawDomain = domainRes.data;
      if (Array.isArray(rawDomain)) {
        domainArr = rawDomain;
      } else if (rawDomain && typeof rawDomain === 'object') {
        // Try common wrapper keys the RPC might return
        const inner =
          (rawDomain as any).verticals ??
          (rawDomain as any).domains ??
          (rawDomain as any).breakdown;
        if (Array.isArray(inner)) {
          domainArr = inner;
        } else {
          // Object with domain keys → convert { cruise: 120, … } to array
          domainArr = Object.entries(rawDomain).map(([k, v]) => ({
            domain: k,
            claim_count: typeof v === 'number' ? v : (v as any)?.claim_count ?? 0,
          }));
        }
      }
      const domains = domainArr
        .sort((a: any, b: any) => (b.claim_count ?? 0) - (a.claim_count ?? 0))
        .map((d: any) => `- ${d.domain ?? d.vertical ?? 'unknown'}: ${d.claim_count ?? 0}`)
        .join('\n');
      const sweepLines = (sweepHistory ?? [])
        .slice(0, 5)
        .map(
          (s) =>
            `- ${new Date(s.ran_at).toLocaleString()} — ${s.approved} approved, ${s.flagged} flagged`
        )
        .join('\n');

      const md = [
        '# Stroom Command Center — Graph Snapshot',
        '',
        `**Generated:** ${new Date().toLocaleString()}`,
        '',
        '## Graph Totals',
        `- Claims: ${(pulse?.totalClaims ?? 0).toLocaleString()}`,
        `- Entities: ${(pulse?.totalEntities ?? 0).toLocaleString()}`,
        `- Sources: ${(pulse?.totalSources ?? 0).toLocaleString()}`,
        `- Predicates: ${predCountRes.count ?? '?'}`,
        '',
        '## Governance',
        `- Queue depth: ${pulse?.queueDepth ?? 0}`,
        `- Correction rate: ${((pulse?.correctionRate ?? 0) * 100).toFixed(1)}%`,
        `- Research active: ${pulse?.researchActive ?? 0}`,
        `- Claims today: ${pulse?.claimsToday ?? 0}`,
        '',
        '## Top 10 Entities',
        topEntities || '(none)',
        '',
        '## Top 10 Sources by Trust',
        topSources || '(none)',
        '',
        '## Domain Breakdown',
        domains || '(none)',
        '',
        '## Recent Sweeps',
        sweepLines || '(none)',
        '',
        '---',
        '*Generated by Stroom Command Center*',
      ].join('\n');
      setSnapshotText(md);
      setSnapshotSheetVisible(true);
    } catch (e: any) {
      showToast(e?.message ?? 'Snapshot failed', 'error');
    } finally {
      setSnapshotLoading(false);
    }
  }, [pulse, sweepHistory, snapshotLoading, showToast]);

  const snapshotActions: ActionSheetAction[] = React.useMemo(
    () => [
      {
        label: 'Copy to Clipboard',
        icon: 'clipboard-outline',
        onPress: async () => {
          if (snapshotText) {
            await Clipboard.setStringAsync(snapshotText);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            showToast('Copied to clipboard', 'success');
          }
        },
      },
      {
        label: 'Share',
        icon: 'share-outline',
        onPress: async () => {
          if (snapshotText) {
            try {
              await Share.share({ message: snapshotText });
            } catch {
              // User cancelled — no-op.
            }
          }
        },
      },
    ],
    [snapshotText, showToast]
  );

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
    {
      key: 'analytics',
      icon: 'stats-chart-outline',
      title: 'Analytics',
      summary: 'Approvals, velocity, utilization',
      route: '/analytics',
    },
  ];

  return (
    <ScreenTransition>
    <View style={styles.container}>
      <BackgroundCanvas />

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
        <View style={styles.headerBtns}>
          <Pressable
            onPress={generateSnapshot}
            disabled={snapshotLoading}
            style={({ pressed }) => [
              styles.snapshotBtn,
              (pressed || snapshotLoading) && { opacity: 0.6 },
            ]}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Generate graph snapshot"
          >
            {snapshotLoading ? (
              <ActivityIndicator size={14} color={colors.teal} />
            ) : (
              <Ionicons name="camera-outline" size={18} color={colors.teal} />
            )}
          </Pressable>
          <Pressable
            onPress={() => router.push('/more' as any)}
            style={({ pressed }) => [styles.gearBtn, pressed && { opacity: 0.6 }]}
            hitSlop={8}
          >
            <Ionicons name="settings-outline" size={20} color={colors.silver} />
          </Pressable>
        </View>
      </View>

      <ScrollView
        ref={scrollRef}
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
        {healthError && (
          <RetryCard
            message="Couldn't load graph health"
            detail={healthError}
            onRetry={refreshHealth}
            compact
          />
        )}

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
            value={health?.stale_sources ?? 0}
            tone={
              (health?.stale_sources ?? 0) > 3
                ? 'alert'
                : (health?.stale_sources ?? 0) > 0
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

        {/* Last sweep indicator */}
        <View style={styles.lastSweepRow}>
          <Ionicons
            name={lastSweep ? 'time-outline' : 'information-circle-outline'}
            size={12}
            color={colors.slate}
          />
          <Text style={styles.lastSweepText}>
            {lastSweep
              ? `Last sweep ${formatRelative(lastSweep.at)} · ${lastSweep.processed} processed`
              : 'No sweep run yet'}
          </Text>
        </View>

        {/* Source Freshness Alerts — auto-approve sources that haven't
            fetched in 7+ days. Highest-risk items surface first. */}
        {staleAutoApprove.length > 0 && (
          <View style={styles.sourceAlertsCard}>
            <View style={styles.sourceAlertsHeader}>
              <Ionicons name="warning-outline" size={14} color={colors.statusPending} />
              <Text style={styles.sourceAlertsTitle}>
                Source Alerts · {staleAutoApprove.length}
              </Text>
            </View>
            {staleAutoApprove.slice(0, 5).map((s) => {
              const daysSince = Math.floor(
                (Date.now() - new Date(s.last_fetch_at!).getTime()) / 86_400_000
              );
              return (
                <Pressable
                  key={s.id}
                  onPress={() =>
                    router.push({
                      pathname: '/source/[id]',
                      params: { id: s.id },
                    } as any)
                  }
                  style={({ pressed }) => [
                    styles.sourceAlertRow,
                    pressed && { opacity: 0.75 },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`${s.source_name}, last fetched ${daysSince} days ago`}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sourceAlertName} numberOfLines={1}>
                      {s.source_name}
                    </Text>
                    <Text style={styles.sourceAlertMeta}>
                      Last fetched {daysSince}d ago · trust{' '}
                      {Number(s.trust_score).toFixed(1)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={colors.slate}
                  />
                </Pressable>
              );
            })}
          </View>
        )}

        {cards.map((card) => (
          <OpsCard
            key={card.key}
            spec={card}
            onPress={() => router.push(card.route as any)}
          />
        ))}

        {/* Ingestion Activity */}
        <CollapsibleSection sectionKey="ingestion" title="Ingestion Activity">
          <IngestionActivity
            data={ingestion}
            error={ingestionError}
            onRetry={() => setIngestionBump((b) => b + 1)}
            tooltip={tooltip}
            onTooltipChange={setTooltip}
          />
        </CollapsibleSection>

        {/* Sweep History */}
        <CollapsibleSection sectionKey="sweepHistory" title="Sweep History">
          <SweepHistorySection
            data={sweepHistory}
            error={sweepHistoryError}
            onRetry={() => setSweepHistoryBump((b) => b + 1)}
          />
        </CollapsibleSection>

        {/* Vertical Breakdown */}
        <CollapsibleSection sectionKey="verticals" title="Coverage by Vertical">
          <VerticalBreakdownSection
            data={verticals}
            error={verticalsError}
            onRetry={() => setVerticalsBump((b) => b + 1)}
          />
        </CollapsibleSection>

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
                <Pressable
                  key={u.source.id}
                  onPress={() =>
                    router.push({
                      pathname: '/source/[id]',
                      params: { id: u.source.id },
                    } as any)
                  }
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setMenuSource(u.source);
                  }}
                  delayLongPress={350}
                  style={({ pressed }) => [
                    styles.healthRow,
                    pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
                  ]}
                >
                  <View style={[styles.healthDot, { backgroundColor: tone }]} />
                  <View style={styles.healthBody}>
                    <Text style={styles.healthName} numberOfLines={1}>
                      {u.source.source_name}
                    </Text>
                    <Text style={[styles.healthIssue, { color: tone }]}>
                      {label} · trust {Number(u.source.trust_score).toFixed(1)}
                    </Text>
                  </View>
                  <View style={styles.healthCheckBtn}>
                    <Text style={styles.healthCheckText}>Check</Text>
                    <Ionicons name="chevron-forward" size={12} color={colors.teal} />
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </ScrollView>

      <ActionSheet
        visible={menuSource !== null}
        title={menuSource?.source_name ?? 'Source'}
        subtitle={menuSource?.source_url ?? undefined}
        actions={
          menuSource
            ? [
                {
                  label: 'View Details',
                  icon: 'information-circle-outline',
                  tone: 'accent',
                  onPress: () => {
                    Haptics.selectionAsync();
                    router.push({
                      pathname: '/source/[id]',
                      params: { id: menuSource.id },
                    } as any);
                  },
                },
                {
                  label: 'Copy Source URL',
                  icon: 'link-outline',
                  onPress: async () => {
                    if (!menuSource.source_url) return;
                    await Clipboard.setStringAsync(menuSource.source_url);
                    Haptics.selectionAsync();
                    showToast('URL copied', 'success');
                  },
                },
              ]
            : []
        }
        onDismiss={() => setMenuSource(null)}
      />

      <ActionSheet
        visible={snapshotSheetVisible}
        title="Graph Snapshot"
        subtitle="Choose how to save the report"
        actions={snapshotActions}
        onDismiss={() => setSnapshotSheetVisible(false)}
      />
    </View>
    </ScreenTransition>
  );
}

type SummaryTone = 'ok' | 'warn' | 'alert';

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
}

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

const OpsCard = React.memo(function OpsCard({
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
        pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
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
});

const DAY_ABBREV = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function IngestionActivity({
  data,
  error,
  onRetry,
  tooltip,
  onTooltipChange,
}: {
  data: Array<{ day: string; claims_added: number }> | null;
  error: string | null;
  onRetry: () => void;
  tooltip: { day: string; count: number } | null;
  onTooltipChange: (t: { day: string; count: number } | null) => void;
}) {
  const CHART_HEIGHT = 100;
  const BAR_GAP = 4;

  if (error) {
    return (
      <View style={styles.analyticsCard}>
        <View style={styles.analyticsHeaderRow}>
          <Text style={styles.analyticsHeader}>Ingestion Activity</Text>
          <View style={styles.analyticsChip}>
            <Text style={styles.analyticsChipText}>14d</Text>
          </View>
        </View>
        <RetryCard
          message="Couldn't load ingestion timeline"
          detail={error}
          onRetry={onRetry}
          compact
        />
      </View>
    );
  }

  if (data === null) {
    return (
      <View style={styles.analyticsCard}>
        <View style={styles.analyticsHeaderRow}>
          <Text style={styles.analyticsHeader}>Ingestion Activity</Text>
          <View style={styles.analyticsChip}>
            <Text style={styles.analyticsChipText}>14d</Text>
          </View>
        </View>
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Skeleton height={12} width={'40%'} />
          <Skeleton height={60} width={'100%'} />
          <Skeleton height={12} width={'55%'} />
        </View>
      </View>
    );
  }

  const max = data.reduce((m, b) => Math.max(m, b.claims_added ?? 0), 0);

  return (
    <View style={styles.analyticsCard}>
      <View style={styles.analyticsHeaderRow}>
        <Text style={styles.analyticsHeader}>Ingestion Activity</Text>
        <View style={styles.analyticsChip}>
          <Text style={styles.analyticsChipText}>14d</Text>
        </View>
      </View>

      {data.length === 0 ? (
        <EmptyState
          icon="trending-up"
          title="No Ingestion Data"
          subtitle="Claims will appear here as they land"
          compact
        />
      ) : (
        <>
          {tooltip && (
            <View style={styles.chartTooltip}>
              <Text style={styles.chartTooltipText}>
                {tooltip.day} · {tooltip.count} claims
              </Text>
            </View>
          )}
          <View
            style={[styles.chartRow, { height: CHART_HEIGHT + 20 }]}
            accessible
            accessibilityRole="image"
            accessibilityLabel={`Ingestion chart: ${data.length} day trend, ${data.reduce(
              (sum, b) => sum + (b.claims_added ?? 0),
              0
            )} total claims`}
          >
            {data.map((b, i) => {
              const pct = max > 0 ? (b.claims_added ?? 0) / max : 0;
              const dayLabel = (() => {
                try {
                  const d = new Date(b.day);
                  return DAY_ABBREV[d.getDay()];
                } catch {
                  return '';
                }
              })();
              const active = tooltip?.day === dayLabel;
              return (
                <Pressable
                  key={`ingest-${b.day ?? 'unknown'}-${i}`}
                  onPress={() =>
                    onTooltipChange(
                      active
                        ? null
                        : {
                            day: dayLabel,
                            count: b.claims_added ?? 0,
                          }
                    )
                  }
                  style={[
                    styles.chartBarCol,
                    { marginHorizontal: BAR_GAP / 2 },
                  ]}
                >
                  <View style={{ height: CHART_HEIGHT, justifyContent: 'flex-end' }}>
                    <View
                      style={[
                        styles.chartBar,
                        {
                          height: Math.max(2, pct * CHART_HEIGHT),
                          backgroundColor: active ? colors.teal : 'rgba(0,161,155,0.7)',
                        },
                      ]}
                    />
                  </View>
                  <Text style={styles.chartDayLabel}>{dayLabel}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

function SweepHistorySection({
  data,
  error,
  onRetry,
}: {
  data: Array<{
    ran_at: string;
    approved: number;
    flagged: number;
    drafts_remaining: number;
  }> | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsHeader}>Sweep History</Text>
        <RetryCard
          message="Couldn't load sweep history"
          detail={error}
          onRetry={onRetry}
          compact
        />
      </View>
    );
  }

  if (data === null) {
    return (
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsHeader}>Sweep History</Text>
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Skeleton height={12} width={'40%'} />
          <Skeleton height={60} width={'100%'} />
          <Skeleton height={12} width={'55%'} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.analyticsCard}>
      <Text style={styles.analyticsHeader}>Sweep History</Text>
      {data.length === 0 ? (
        <EmptyState
          icon="sparkles"
          title="No Sweeps Yet"
          subtitle="Governance sweep runs will appear here"
          compact
        />
      ) : (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {data.map((s, i) => (
            <View key={`sweep-${s.ran_at ?? 'unknown'}-${i}`} style={styles.sweepHistoryRow}>
              <Text style={styles.sweepHistoryTime}>
                {formatRelative(s.ran_at)}
              </Text>
              <View style={styles.sweepHistoryStats}>
                <Text style={[styles.sweepHistoryStat, { color: colors.statusApprove }]}>
                  {s.approved ?? 0} approved
                </Text>
                <Text style={[styles.sweepHistoryStat, { color: colors.statusPending }]}>
                  {s.flagged ?? 0} flagged
                </Text>
                <Text style={[styles.sweepHistoryStat, { color: colors.slate }]}>
                  {s.drafts_remaining ?? 0} left
                </Text>
              </View>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

function VerticalBreakdownSection({
  data,
  error,
  onRetry,
}: {
  data: Array<{ domain: string; claim_count: number }> | null;
  error: string | null;
  onRetry: () => void;
}) {
  if (error) {
    return (
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsHeader}>Coverage by Vertical</Text>
        <RetryCard
          message="Couldn't load vertical breakdown"
          detail={error}
          onRetry={onRetry}
          compact
        />
      </View>
    );
  }

  if (data === null) {
    return (
      <View style={styles.analyticsCard}>
        <Text style={styles.analyticsHeader}>Coverage by Vertical</Text>
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          <Skeleton height={12} width={'40%'} />
          <Skeleton height={60} width={'100%'} />
          <Skeleton height={12} width={'55%'} />
        </View>
      </View>
    );
  }

  // Cap to top 6 and collapse the rest into "Other".
  const sorted = [...data].sort((a, b) => (b.claim_count ?? 0) - (a.claim_count ?? 0));
  const top = sorted.slice(0, 6);
  const rest = sorted.slice(6);
  const otherCount = rest.reduce((acc, r) => acc + (r.claim_count ?? 0), 0);
  const rows =
    otherCount > 0
      ? [...top, { domain: 'Other', claim_count: otherCount }]
      : top;
  const max = rows.reduce((m, r) => Math.max(m, r.claim_count ?? 0), 0);

  return (
    <View style={styles.analyticsCard}>
      <Text style={styles.analyticsHeader}>Coverage by Vertical</Text>
      {rows.length === 0 ? (
        <EmptyState
          icon="layers"
          title="No Vertical Data"
          subtitle="Domain breakdown will appear here"
          compact
        />
      ) : (
        <View style={{ gap: spacing.sm, marginTop: spacing.sm }}>
          {rows.map((r, i) => {
            const pct = max > 0 ? (r.claim_count ?? 0) / max : 0;
            return (
              <View key={`vertical-${r.domain ?? 'unknown'}-${i}`} style={styles.verticalRow}>
                <Text style={styles.verticalLabel} numberOfLines={1}>
                  {r.domain}
                </Text>
                <View style={styles.verticalBarTrack}>
                  <View
                    style={[
                      styles.verticalBarFill,
                      { width: `${Math.max(2, pct * 100)}%` },
                    ]}
                  />
                </View>
                <Text style={styles.verticalCount}>
                  {(r.claim_count ?? 0).toLocaleString()}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
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
    color: colors.teal,
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
  headerBtns: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  snapshotBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
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
  sourceAlertsCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.35)',
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sourceAlertsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing.sm,
  },
  sourceAlertsTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.statusPending,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  sourceAlertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  sourceAlertName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
  },
  sourceAlertMeta: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.statusPending,
    marginTop: 2,
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
  analyticsCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: spacing.xs,
  },
  analyticsHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  analyticsHeader: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
    letterSpacing: -0.2,
  },
  analyticsChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0,161,155,0.35)',
  },
  analyticsChipText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.teal,
    letterSpacing: 0.5,
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginTop: spacing.sm,
  },
  chartBarCol: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  chartBar: {
    width: '100%',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  chartDayLabel: {
    fontFamily: fonts.mono.regular,
    fontSize: 9,
    color: colors.slate,
  },
  chartTooltip: {
    alignSelf: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.teal,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    marginTop: spacing.xs,
  },
  chartTooltipText: {
    fontFamily: fonts.mono.medium,
    fontSize: 11,
    color: colors.teal,
  },
  sweepHistoryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  sweepHistoryTime: {
    fontFamily: fonts.mono.medium,
    fontSize: 11,
    color: colors.silver,
    flex: 1,
  },
  sweepHistoryStats: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sweepHistoryStat: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  verticalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  verticalLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.silver,
    width: 90,
    textTransform: 'capitalize',
  },
  verticalBarTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.04)',
    overflow: 'hidden',
  },
  verticalBarFill: {
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: 3,
  },
  verticalCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: colors.alabaster,
    width: 44,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  lastSweepRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: -spacing.xs,
    marginBottom: spacing.sm,
  },
  lastSweepText: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
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
