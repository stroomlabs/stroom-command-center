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
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQueueClaims } from '../../src/hooks/useQueueClaims';
import supabase from '../../src/lib/supabase';
import { useNavigation, useRouter } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { ClaimCard } from '../../src/components/ClaimCard';
import { ClaimPreviewSheet } from '../../src/components/ClaimPreviewSheet';
import { useExistingClaimMap } from '../../src/hooks/useExistingClaimMap';
import { EntityQuickStats } from '../../src/components/EntityQuickStats';
import { useKeyboardShortcuts } from '../../src/hooks/useKeyboardShortcuts';
import { RejectSheet } from '../../src/components/RejectSheet';
import { SkeletonClaimCard } from '../../src/components/Skeleton';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import { EmptyState } from '../../src/components/EmptyState';
import { RetryCard } from '../../src/components/RetryCard';
import { UndoToast } from '../../src/components/UndoToast';
import {
  ActionSheet,
  type ActionSheetAction,
} from '../../src/components/ActionSheet';
import type { RejectionReason, ClaimStatus } from '@stroom/types';
import type { QueueClaim } from '@stroom/supabase';
import { ScreenCanvas } from '../../src/components/ScreenCanvas';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

type StatusFilter = 'all' | 'draft' | 'pending_review';
type SortKey = 'smart' | 'newest' | 'oldest' | 'risk' | 'low_trust';

const SORT_LABELS: Record<SortKey, string> = {
  smart: 'Smart (risk · importance · age)',
  newest: 'Newest first',
  oldest: 'Oldest first',
  risk: 'Highest risk',
  low_trust: 'Lowest trust source',
};

const FILTERS: { key: StatusFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_review', label: 'Pending Review' },
];

export default function QueueScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const flatListRef = React.useRef<FlatList>(null);
  const {
    claims,
    loading,
    error,
    refresh,
    approve,
    reject,
    batchApprove,
    deferApprove,
    deferReject,
    pendingUndo,
    undoPending,
    flushPending,
  } = useQueueClaims();
  const existingClaimMap = useExistingClaimMap(claims);

  React.useEffect(() => {
    const unsub = (navigation as any).addListener?.('tabPress', () => {
      if ((navigation as any).isFocused?.()) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    });
    return unsub;
  }, [navigation]);
  const [refreshing, setRefreshing] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<string | null>(null);
  const [filter, setFilter] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('smart');
  const [sortSheetVisible, setSortSheetVisible] = useState(false);
  const [focusedIndex, setFocusedIndex] = useState(-1);
  const [showKbLegend, setShowKbLegend] = useState(false);
  const [importance, setImportance] = useState<Map<string, number>>(new Map());

  // Fetch total claim count per subject entity for the current queue —
  // powers the "importance" dimension of the Smart sort. Cheap approximation:
  // one count query per unique entity id. Only refreshes when the set of
  // entity ids changes.
  const subjectEntityIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const c of claims) {
      if (c.subject_entity_id) ids.add(c.subject_entity_id);
    }
    return Array.from(ids);
  }, [claims]);

  React.useEffect(() => {
    if (subjectEntityIds.length === 0) return;
    let cancelled = false;
    (async () => {
      const entries: [string, number][] = await Promise.all(
        subjectEntityIds.map(async (id) => {
          try {
            const { count } = await supabase
              .schema('intel')
              .from('claims')
              .select('id', { count: 'exact', head: true })
              .eq('subject_entity_id', id);
            return [id, count ?? 0] as [string, number];
          } catch {
            return [id, 0] as [string, number];
          }
        })
      );
      if (!cancelled) setImportance(new Map(entries));
    })();
    return () => {
      cancelled = true;
    };
  }, [subjectEntityIds]);
  const glow = useSharedValue(0);
  const isHot = claims.length > 100;

  React.useEffect(() => {
    if (isHot) {
      glow.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
          withTiming(0, { duration: 900, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(glow);
      glow.value = withTiming(0, { duration: 200 });
    }
  }, [isHot, glow]);

  const badgeAnimatedStyle = useAnimatedStyle(() => ({
    shadowOpacity: 0.25 + glow.value * 0.55,
    shadowRadius: 4 + glow.value * 10,
    transform: [{ scale: 1 + glow.value * 0.06 }],
  }));
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [domainFilter, setDomainFilter] = useState<string | null>(null);

  // Distinct domains present in the current queue — rendered as a
  // horizontally scrollable chip bar below the status filters.
  const availableDomains = useMemo(() => {
    const set = new Set<string>();
    for (const c of claims) {
      const d = c.subject_entity?.domain;
      if (d) set.add(d);
    }
    return Array.from(set).sort();
  }, [claims]);

  // Drop a stale domain filter if no claims in the current queue match it
  // (e.g. after a refresh).
  React.useEffect(() => {
    if (domainFilter && !availableDomains.includes(domainFilter)) {
      setDomainFilter(null);
    }
  }, [availableDomains, domainFilter]);

  // Compact top sort toggle — Smart (risk-weighted default), Newest, Oldest.
  // The full ActionSheet still exists for power users who want low_trust
  // or explicit Risk sorts.
  const TOP_SORTS: { key: SortKey; label: string }[] = [
    { key: 'smart', label: 'Risk' },
    { key: 'newest', label: 'Newest' },
    { key: 'oldest', label: 'Oldest' },
  ];

  const activeFilterCount =
    (filter === 'all' ? 0 : 1) + (domainFilter ? 1 : 0);

  const filteredClaims = useMemo(() => {
    const byStatus =
      filter === 'all'
        ? claims
        : claims.filter((c) => c.status === (filter as ClaimStatus));
    const byDomain = domainFilter
      ? byStatus.filter((c) => c.subject_entity?.domain === domainFilter)
      : byStatus;
    const q = search.trim().toLowerCase();
    const bySearch = q
      ? byDomain.filter((c) => {
          const name = c.subject_entity?.canonical_name?.toLowerCase() ?? '';
          const pred = (c.predicate ?? '').toLowerCase();
          return name.includes(q) || pred.includes(q);
        })
      : byDomain;

    // Risk score: larger = higher risk. Low trust/confidence/corroboration add.
    const riskScore = (c: typeof bySearch[number]) => {
      const trust = Number(c.source?.trust_score ?? 0);
      const conf = Number(c.confidence_score ?? 0);
      const corr = Number(c.corroboration_score ?? 0);
      return (10 - trust) + (10 - conf) + (corr === 0 ? 5 : 0);
    };

    const copy = [...bySearch];
    switch (sort) {
      case 'smart': {
        // Smart: high-risk first → entity importance → oldest first.
        copy.sort((a, b) => {
          const dr = riskScore(b) - riskScore(a);
          if (dr !== 0) return dr;
          const ia = importance.get(a.subject_entity_id ?? '') ?? 0;
          const ib = importance.get(b.subject_entity_id ?? '') ?? 0;
          if (ib !== ia) return ib - ia;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });
        break;
      }
      case 'oldest':
        copy.sort(
          (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        );
        break;
      case 'risk':
        copy.sort((a, b) => riskScore(b) - riskScore(a));
        break;
      case 'low_trust':
        copy.sort(
          (a, b) =>
            Number(a.source?.trust_score ?? 0) - Number(b.source?.trust_score ?? 0)
        );
        break;
      case 'newest':
      default:
        copy.sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
    }
    return copy;
  }, [claims, filter, domainFilter, search, sort, importance]);

  const sortActions: ActionSheetAction[] = (Object.keys(SORT_LABELS) as SortKey[]).map(
    (key) => ({
      label: SORT_LABELS[key],
      icon: key === sort ? 'checkmark' : undefined,
      tone: key === sort ? 'accent' : 'default',
      onPress: () => {
        Haptics.selectionAsync();
        setSort(key);
      },
    })
  );

  const handleRefresh = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const handleReject = useCallback(
    (reason: RejectionReason, notes?: string) => {
      // Batch path — batchRejectIds is set when a group's Reject All opens
      // the same RejectSheet modal. Apply the chosen reason to every claim.
      if (batchRejectIds && batchRejectIds.length > 0) {
        for (const id of batchRejectIds) {
          recordProcessed(id, 'rejected');
          deferReject(id, reason, notes);
        }
        setBatchRejectIds(null);
        setRejectTarget(null);
        return;
      }
      if (rejectTarget) {
        recordProcessed(rejectTarget, 'rejected');
        deferReject(rejectTarget, reason, notes);
        setRejectTarget(null);
      }
    },
    [rejectTarget, deferReject, recordProcessed, batchRejectIds]
  );

  // Approve All for a grouped header — processes claims sequentially so we
  // can update the progress counter between each commit.
  const handleGroupApproveAll = useCallback(
    async (groupKey: string, claimIds: string[]) => {
      setBatchProgress({ groupKey, kind: 'approve', done: 0, total: claimIds.length });
      for (let i = 0; i < claimIds.length; i++) {
        recordProcessed(claimIds[i], 'approved');
        deferApprove(claimIds[i]);
        setBatchProgress({ groupKey, kind: 'approve', done: i + 1, total: claimIds.length });
        // Tiny yield so the progress counter re-renders between commits.
        if (i < claimIds.length - 1) {
          await new Promise<void>((r) => setTimeout(r, 50));
        }
      }
      setBatchProgress(null);
    },
    [deferApprove, recordProcessed]
  );

  // Grouped items — inject GroupHeader rows into the flat list so the
  // operator can batch-act on claims from the same entity + source.
  type ListItem =
    | { kind: 'header'; groupKey: string; entityName: string; sourceName: string; claimIds: string[]; count: number }
    | { kind: 'claim'; claim: QueueClaim };

  const groupedItems: ListItem[] = React.useMemo(() => {
    // Build groups keyed by entity+source.
    const groups = new Map<string, { entityName: string; sourceName: string; ids: string[] }>();
    const groupKeyOf = (c: QueueClaim) =>
      `${c.subject_entity_id ?? ''}|${c.asserted_source_id ?? c.source?.id ?? ''}`;
    for (const c of filteredClaims) {
      const key = groupKeyOf(c);
      let g = groups.get(key);
      if (!g) {
        g = {
          entityName: c.subject_entity?.canonical_name ?? 'Unknown entity',
          sourceName: c.source?.source_name ?? 'Unknown source',
          ids: [],
        };
        groups.set(key, g);
      }
      g.ids.push(c.id);
    }
    // Only promote groups with 3+ claims to visible headers.
    const bigGroups = new Set<string>();
    for (const [key, g] of groups) {
      if (g.ids.length >= 3) bigGroups.add(key);
    }
    // Walk sorted claims and emit header before each big-group's first claim.
    const emitted = new Set<string>();
    const items: ListItem[] = [];
    for (const c of filteredClaims) {
      const key = groupKeyOf(c);
      if (bigGroups.has(key) && !emitted.has(key)) {
        emitted.add(key);
        const g = groups.get(key)!;
        items.push({
          kind: 'header',
          groupKey: key,
          entityName: g.entityName,
          sourceName: g.sourceName,
          claimIds: g.ids,
          count: g.ids.length,
        });
      }
      items.push({ kind: 'claim', claim: c });
    }
    return items;
  }, [filteredClaims]);

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

  const [menuClaim, setMenuClaim] = useState<QueueClaim | null>(null);
  const [quickStatsEntity, setQuickStatsEntity] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [previewClaim, setPreviewClaim] = useState<QueueClaim | null>(null);

  // Batch action state for entity+source groups. When a group's Approve All
  // or Reject All button fires we keep a progress counter so the button can
  // render "Approving 4/7..." while the sequential commits run.
  const [batchProgress, setBatchProgress] = useState<{
    groupKey: string;
    kind: 'approve' | 'reject';
    done: number;
    total: number;
  } | null>(null);

  // When a group's Reject All is pressed we need a rejection reason before
  // firing. Store the group's claim ids and open the existing RejectSheet;
  // handleReject below checks this state first so the same sheet supports
  // single and batch rejection flows.
  const [batchRejectIds, setBatchRejectIds] = useState<string[] | null>(null);

  // Keyboard shortcuts — iPad / hardware-keyboard support. Only the claim
  // items in groupedItems are focusable (headers are skipped).
  const claimItemsOnly = React.useMemo(
    () => groupedItems.filter((r) => r.kind === 'claim'),
    [groupedItems]
  );
  useKeyboardShortcuts(
    React.useMemo(
      () => ({
        j: () =>
          setFocusedIndex((i) =>
            Math.min(i + 1, claimItemsOnly.length - 1)
          ),
        k: () => setFocusedIndex((i) => Math.max(i - 1, 0)),
        a: () => {
          const row = claimItemsOnly[focusedIndex];
          if (row?.kind === 'claim') {
            recordProcessed(row.claim.id, 'approved');
            deferApprove(row.claim.id);
          }
        },
        r: () => {
          const row = claimItemsOnly[focusedIndex];
          if (row?.kind === 'claim') setRejectTarget(row.claim.id);
        },
        enter: () => {
          const row = claimItemsOnly[focusedIndex];
          if (row?.kind === 'claim') {
            router.push({
              pathname: '/claim/[id]',
              params: { id: row.claim.id },
            } as any);
          }
        },
        escape: () => {
          if (rejectTarget) setRejectTarget(null);
          else if (previewClaim) setPreviewClaim(null);
          else if (menuClaim) setMenuClaim(null);
          else setFocusedIndex(-1);
        },
      }),
      [
        claimItemsOnly,
        focusedIndex,
        deferApprove,
        recordProcessed,
        rejectTarget,
        previewClaim,
        menuClaim,
        router,
      ]
    )
  );

  // Recently processed — a session-only audit trail of the last ~10 claims
  // the operator approved or rejected. Not persisted; cleared when they
  // leave the Queue tab. Gives them a quick "what did I just do?" check
  // without switching to the full Ops audit log.
  type RecentlyProcessed = {
    id: string;
    subject: string;
    predicate: string;
    status: 'approved' | 'rejected';
    at: number;
  };
  const [recentlyProcessed, setRecentlyProcessed] = useState<
    RecentlyProcessed[]
  >([]);
  const [recentExpanded, setRecentExpanded] = useState(false);

  // Index claims by id so we can look up metadata when the decision fires
  // (the claim may already have been optimistically removed from the list).
  const claimsById = React.useMemo(() => {
    const m = new Map<string, QueueClaim>();
    for (const c of claims) m.set(c.id, c);
    return m;
  }, [claims]);

  const recordProcessed = useCallback(
    (claimId: string, status: 'approved' | 'rejected') => {
      const c = claimsById.get(claimId);
      if (!c) return;
      const entry: RecentlyProcessed = {
        id: claimId,
        subject: c.subject_entity?.canonical_name ?? 'Unknown entity',
        predicate: (c.predicate ?? 'unknown').split('.').pop() ?? 'unknown',
        status,
        at: Date.now(),
      };
      setRecentlyProcessed((prev) => [entry, ...prev].slice(0, 10));
    },
    [claimsById]
  );

  // Clear the list when the Queue tab loses focus (operator navigates to
  // another tab). useFocusEffect fires on focus; we return a cleanup that
  // runs on blur.
  React.useEffect(() => {
    const unsub = (navigation as any).addListener?.('blur', () => {
      setRecentlyProcessed([]);
      setRecentExpanded(false);
    });
    return unsub;
  }, [navigation]);

  const renderItem = useCallback(
    ({ item }: { item: QueueClaim }) => (
      <ClaimCard
        claim={item}
        query={search}
        updatesExisting={existingClaimMap.has(item.id)}
        onApprove={() => {
          recordProcessed(item.id, 'approved');
          deferApprove(item.id);
        }}
        onReject={() => setRejectTarget(item.id)}
        onLongPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
          setMenuClaim(item);
        }}
        onDoublePress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          setPreviewClaim(item);
        }}
        selectMode={selectMode}
        selected={selectedIds.has(item.id)}
        onToggleSelect={() => toggleSelect(item.id)}
      />
    ),
    [deferApprove, selectMode, selectedIds, toggleSelect, search, recordProcessed]
  );

  const claimMenuActions: ActionSheetAction[] = React.useMemo(() => {
    if (!menuClaim) return [];
    const claimText = [
      menuClaim.subject_entity?.canonical_name ?? 'Unknown entity',
      menuClaim.predicate ?? '',
      menuClaim.object_entity?.canonical_name ??
        JSON.stringify(menuClaim.value_jsonb ?? {}),
    ]
      .filter(Boolean)
      .join(' · ');
    return [
      {
        label: 'Approve',
        icon: 'checkmark-circle-outline',
        tone: 'accent',
        onPress: () => {
          deferApprove(menuClaim.id);
        },
      },
      {
        label: 'Reject',
        icon: 'close-circle-outline',
        tone: 'destructive',
        onPress: () => {
          setRejectTarget(menuClaim.id);
        },
      },
      {
        label: 'View Full Claim',
        icon: 'open-outline',
        onPress: () => {
          Haptics.selectionAsync();
          router.push({
            pathname: '/claim/[id]',
            params: { id: menuClaim.id },
          } as any);
        },
      },
      {
        label: 'Entity Quick Stats',
        icon: 'analytics-outline',
        onPress: () => {
          if (menuClaim.subject_entity_id) {
            setQuickStatsEntity({
              id: menuClaim.subject_entity_id,
              name: menuClaim.subject_entity?.canonical_name ?? 'Entity',
            });
          }
        },
      },
      {
        label: 'Copy Claim Text',
        icon: 'copy-outline',
        onPress: async () => {
          await Clipboard.setStringAsync(claimText);
          Haptics.selectionAsync();
        },
      },
    ];
  }, [menuClaim, deferApprove, router]);

  const keyExtractor = useCallback((item: QueueClaim) => item.id, []);

  return (
    <ScreenTransition>
    <View style={styles.container}>
      <ScreenCanvas />
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.headerTitle}>Queue</Text>
        <Animated.View style={isHot ? [styles.badgeGlowWrap, badgeAnimatedStyle] : undefined}>
          <Pressable
            onLongPress={enterSelectMode}
            delayLongPress={400}
            style={({ pressed }) => [
              styles.countBadge,
              selectMode && styles.countBadgeActive,
              isHot && !selectMode && styles.countBadgeHot,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              style={[
                styles.countText,
                selectMode && styles.countTextActive,
                isHot && !selectMode && styles.countTextHot,
              ]}
            >
              {filteredClaims.length}
            </Text>
          </Pressable>
        </Animated.View>
      </View>
      <View style={kbStyles.subRow}>
        <Text style={styles.headerSub}>Claims pending governance review</Text>
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setShowKbLegend((v) => !v);
          }}
          style={({ pressed }) => [
            kbStyles.hintBadge,
            pressed && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Toggle keyboard shortcuts legend"
        >
          <Text style={kbStyles.hintText}>⌨</Text>
        </Pressable>
      </View>
      {showKbLegend && (
        <View style={kbStyles.legend}>
          <Text style={kbStyles.legendRow}>
            <Text style={kbStyles.legendKey}>J/K</Text> Move focus
            <Text style={kbStyles.legendKey}>  A</Text> Approve
            <Text style={kbStyles.legendKey}>  R</Text> Reject
            <Text style={kbStyles.legendKey}>  ↵</Text> Open
            <Text style={kbStyles.legendKey}>  Esc</Text> Dismiss
          </Text>
        </View>
      )}

      {/* Search bar + sort */}
      <View style={styles.searchRow}>
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
        <Pressable
          onPress={() => {
            Haptics.selectionAsync();
            setSortSheetVisible(true);
          }}
          style={({ pressed }) => [styles.sortBtn, pressed && { opacity: 0.7 }]}
          hitSlop={6}
        >
          <Ionicons name="swap-vertical" size={16} color={colors.teal} />
        </Pressable>
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

      {/* Sort toggle (Risk / Newest / Oldest) + active filter count */}
      <View style={styles.sortToggleRow}>
        <View style={styles.sortSegment}>
          {TOP_SORTS.map((s) => {
            const active = sort === s.key;
            return (
              <Pressable
                key={s.key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSort(s.key);
                }}
                style={({ pressed }) => [
                  styles.sortSegmentBtn,
                  active && styles.sortSegmentBtnActive,
                  pressed && !active && { opacity: 0.75 },
                ]}
              >
                <Text
                  style={[
                    styles.sortSegmentText,
                    active && styles.sortSegmentTextActive,
                  ]}
                >
                  {s.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
        {activeFilterCount > 0 && (
          <View style={styles.filtersLabelChip}>
            <Ionicons name="funnel" size={10} color={colors.teal} />
            <Text style={styles.filtersLabelText}>
              {activeFilterCount} filter{activeFilterCount === 1 ? '' : 's'}
            </Text>
          </View>
        )}
      </View>

      {/* Domain chip bar — only rendered when the current queue actually
          spans multiple domains (single-domain queues skip the row). */}
      {availableDomains.length > 1 && (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.filterScroll}
          contentContainerStyle={styles.filterRow}
        >
          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              setDomainFilter(null);
            }}
            style={({ pressed }) => [
              styles.filterPill,
              domainFilter === null && styles.filterPillActive,
              pressed && { opacity: 0.7 },
            ]}
          >
            <Text
              style={[
                styles.filterText,
                domainFilter === null && styles.filterTextActive,
              ]}
            >
              All Domains
            </Text>
          </Pressable>
          {availableDomains.map((d) => {
            const active = domainFilter === d;
            return (
              <Pressable
                key={d}
                onPress={() => {
                  Haptics.selectionAsync();
                  setDomainFilter(active ? null : d);
                }}
                style={({ pressed }) => [
                  styles.filterPill,
                  active && styles.filterPillActive,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Text
                  style={[
                    styles.filterText,
                    active && styles.filterTextActive,
                  ]}
                >
                  {d.replace(/_/g, ' ')}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      )}

      {loading && claims.length === 0 ? (
        <ScrollView
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
        >
          <SkeletonClaimCard />
          <SkeletonClaimCard />
          <SkeletonClaimCard />
          <SkeletonClaimCard />
        </ScrollView>
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
            <RetryCard
              message="Couldn't load queue"
              detail={error}
              onRetry={refresh}
            />
          ) : claims.length === 0 ? (
            <EmptyState
              icon="checkmark-circle"
              title="Queue Clear"
              subtitle="All claims have been processed"
            />
          ) : (
            <EmptyState
              icon="funnel"
              title="No matches"
              subtitle="No claims match this filter. Try a different status."
            />
          )}
        </ScrollView>
      ) : (
        <FlatList
          ref={flatListRef}
          data={groupedItems}
          renderItem={({ item: row }) => {
            if (row.kind === 'header') {
              const prog = batchProgress?.groupKey === row.groupKey ? batchProgress : null;
              return (
                <GroupHeader
                  entityName={row.entityName}
                  sourceName={row.sourceName}
                  count={row.count}
                  progress={prog}
                  onApproveAll={() =>
                    handleGroupApproveAll(row.groupKey, row.claimIds)
                  }
                  onRejectAll={() => {
                    setBatchRejectIds(row.claimIds);
                    setRejectTarget('__batch__');
                  }}
                />
              );
            }
            const claimIdx = claimItemsOnly.indexOf(row);
            return (
              <View style={claimIdx === focusedIndex ? kbStyles.focusedWrap : undefined}>
                {renderItem({ item: row.claim })}
              </View>
            );
          }}
          keyExtractor={(row) =>
            row.kind === 'header'
              ? `group-${row.groupKey}`
              : row.claim.id
          }
          contentContainerStyle={styles.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          maxToRenderPerBatch={10}
          windowSize={5}
          ListFooterComponent={
            <RecentlyProcessedSection
              entries={recentlyProcessed}
              expanded={recentExpanded}
              onToggle={() => {
                Haptics.selectionAsync();
                setRecentExpanded((v) => !v);
              }}
            />
          }
        />
      )}

      <RejectSheet
        visible={rejectTarget !== null}
        onDismiss={() => setRejectTarget(null)}
        onReject={handleReject}
      />

      <ClaimPreviewSheet
        claim={previewClaim}
        visible={previewClaim !== null}
        onDismiss={() => setPreviewClaim(null)}
        onApprove={() => {
          if (previewClaim) {
            recordProcessed(previewClaim.id, 'approved');
            deferApprove(previewClaim.id);
          }
        }}
        onReject={() => {
          if (previewClaim) setRejectTarget(previewClaim.id);
        }}
      />

      <ActionSheet
        visible={sortSheetVisible}
        title="Sort Queue"
        subtitle={`Currently: ${SORT_LABELS[sort]}`}
        actions={sortActions}
        onDismiss={() => setSortSheetVisible(false)}
      />

      <ActionSheet
        visible={menuClaim !== null}
        title={
          menuClaim?.subject_entity?.canonical_name ?? 'Claim'
        }
        subtitle={menuClaim?.predicate ?? undefined}
        actions={claimMenuActions}
        onDismiss={() => setMenuClaim(null)}
      />

      <EntityQuickStats
        entityId={quickStatsEntity?.id ?? null}
        entityName={quickStatsEntity?.name}
        onDismiss={() => setQuickStatsEntity(null)}
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
            accessibilityRole="button"
            accessibilityLabel={`Batch approve ${selectedIds.size} selected claim${selectedIds.size === 1 ? '' : 's'}`}
          >
            <Ionicons name="checkmark-done" size={18} color={colors.obsidian} />
            <Text style={styles.batchApproveText}>
              Approve {selectedIds.size || ''}
            </Text>
          </Pressable>
        </View>
      )}
      <UndoToast
        visible={pendingUndo !== null}
        subject={pendingUndo?.subject ?? ''}
        actionLabel={
          pendingUndo?.kind === 'approve' ? 'approved' : 'rejected'
        }
        onUndo={undoPending}
        onDismiss={flushPending}
      />
    </View>
    </ScreenTransition>
  );
}

// Inline group header rendered above a cluster of 3+ claims that share the
// same subject entity + source. Lets the operator batch-act on the entire
// group without long-pressing into select mode.
function GroupHeader({
  entityName,
  sourceName,
  count,
  progress,
  onApproveAll,
  onRejectAll,
}: {
  entityName: string;
  sourceName: string;
  count: number;
  progress: { kind: string; done: number; total: number } | null;
  onApproveAll: () => void;
  onRejectAll: () => void;
}) {
  const isRunning = progress !== null;
  const label = progress
    ? `${progress.kind === 'approve' ? 'Approving' : 'Rejecting'} ${progress.done}/${progress.total}…`
    : `${entityName} · ${count} claims from ${sourceName}`;
  return (
    <View style={groupStyles.wrap}>
      <Text style={groupStyles.label} numberOfLines={1}>
        {label}
      </Text>
      <View style={groupStyles.actions}>
        <Pressable
          onPress={onApproveAll}
          disabled={isRunning}
          style={({ pressed }) => [
            groupStyles.btn,
            groupStyles.approveBtn,
            (pressed || isRunning) && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Approve all ${count} claims`}
        >
          {isRunning && progress?.kind === 'approve' ? (
            <ActivityIndicator size={12} color={colors.statusApprove} />
          ) : (
            <Ionicons name="checkmark" size={12} color={colors.statusApprove} />
          )}
        </Pressable>
        <Pressable
          onPress={onRejectAll}
          disabled={isRunning}
          style={({ pressed }) => [
            groupStyles.btn,
            groupStyles.rejectBtn,
            (pressed || isRunning) && { opacity: 0.6 },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Reject all ${count} claims`}
        >
          <Ionicons name="close" size={12} color={colors.statusReject} />
        </Pressable>
      </View>
    </View>
  );
}

const groupStyles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.xs,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
  },
  label: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.silver,
    flex: 1,
    marginRight: spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  btn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approveBtn: {
    borderColor: 'rgba(34, 197, 94, 0.4)',
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
  },
  rejectBtn: {
    borderColor: 'rgba(239, 68, 68, 0.4)',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
});

const kbStyles = StyleSheet.create({
  subRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  hintBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  hintText: {
    fontSize: 12,
  },
  legend: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  legendRow: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.silver,
    lineHeight: 16,
  },
  legendKey: {
    fontFamily: fonts.mono.semibold,
    color: colors.teal,
  },
  focusedWrap: {
    borderWidth: 2,
    borderColor: colors.teal,
    borderRadius: radius.lg,
  },
});

// Session-only audit trail for the Queue tab. Renders as the FlatList
// footer so it sits below the main draft claims list. Collapsed by default
// to keep the queue flow distraction-free; the operator taps "Show recent"
// to see what they just processed.
function RecentlyProcessedSection({
  entries,
  expanded,
  onToggle,
}: {
  entries: Array<{
    id: string;
    subject: string;
    predicate: string;
    status: 'approved' | 'rejected';
    at: number;
  }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (entries.length === 0) return null;
  return (
    <View style={recentStyles.wrap}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [
          recentStyles.toggle,
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={
          expanded ? 'Hide recently processed' : 'Show recently processed'
        }
      >
        <Ionicons
          name={expanded ? 'chevron-down' : 'chevron-forward'}
          size={14}
          color={colors.slate}
        />
        <Text style={recentStyles.toggleText}>
          {expanded ? 'Hide' : 'Show recent'} · {entries.length} processed
        </Text>
      </Pressable>
      {expanded && (
        <View style={recentStyles.list}>
          {entries.map((e) => {
            const isApprove = e.status === 'approved';
            return (
              <View key={`recent-${e.id}`} style={recentStyles.row}>
                <View
                  style={[
                    recentStyles.statusPill,
                    {
                      borderColor: isApprove
                        ? colors.statusApprove
                        : colors.statusReject,
                      backgroundColor: isApprove
                        ? 'rgba(34, 197, 94, 0.1)'
                        : 'rgba(239, 68, 68, 0.1)',
                    },
                  ]}
                >
                  <Text
                    style={[
                      recentStyles.statusText,
                      {
                        color: isApprove
                          ? colors.statusApprove
                          : colors.statusReject,
                      },
                    ]}
                  >
                    {isApprove ? 'APPROVED' : 'REJECTED'}
                  </Text>
                </View>
                <View style={recentStyles.body}>
                  <Text style={recentStyles.subject} numberOfLines={1}>
                    {e.subject}
                  </Text>
                  <Text style={recentStyles.predicate} numberOfLines={1}>
                    {e.predicate.replace(/_/g, ' ')}
                  </Text>
                </View>
                <Text style={recentStyles.time}>{formatAgo(e.at)}</Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

function formatAgo(ts: number): string {
  const sec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (sec < 10) return 'now';
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m`;
  const hr = Math.floor(min / 60);
  return `${hr}h`;
}

const recentStyles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  toggleText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.slate,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  list: {
    marginTop: spacing.sm,
    gap: 6,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 8,
    paddingHorizontal: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
  },
  statusPill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  statusText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 8,
    letterSpacing: 0.6,
  },
  body: {
    flex: 1,
  },
  subject: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.alabaster,
  },
  predicate: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 1,
  },
  time: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
  },
});

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
    color: colors.teal,
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
  countBadgeHot: {
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
    borderColor: colors.statusReject,
  },
  badgeGlowWrap: {
    borderRadius: 100,
    shadowColor: colors.statusReject,
    shadowOffset: { width: 0, height: 0 },
    // shadowOpacity and shadowRadius are driven by the animated style
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
  countTextHot: {
    color: colors.statusReject,
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
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    height: 40,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
  },
  sortBtn: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  sortToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  sortSegment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.full,
    padding: 3,
    gap: 2,
  },
  sortSegmentBtn: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.full,
  },
  sortSegmentBtnActive: {
    backgroundColor: colors.tealDim,
  },
  sortSegmentText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.silver,
    letterSpacing: 0.3,
  },
  sortSegmentTextActive: {
    color: colors.teal,
  },
  filtersLabelChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  filtersLabelText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 10,
    color: colors.teal,
    letterSpacing: 0.5,
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
    minHeight: 52,
    marginBottom: 12,
    overflow: 'visible',
  },
  filterRow: {
    paddingLeft: 16,
    paddingRight: 32,
    paddingTop: 8,
    paddingBottom: 4,
    gap: 8,
    alignItems: 'center',
    overflow: 'visible',
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
