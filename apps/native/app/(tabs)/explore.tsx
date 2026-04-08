import React, { useState, useCallback, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  FlatList,
  ActivityIndicator,
  Pressable,
  Keyboard,
  ScrollView,
  RefreshControl,
  Modal,
  Platform,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import { useExploreSearch } from '../../src/hooks/useExploreSearch';
import { useClaimsSearch } from '../../src/hooks/useClaimsSearch';
import { useSourcesSearch } from '../../src/hooks/useSourcesSearch';
import { EntityRow } from '../../src/components/EntityRow';
import { SkeletonListPlaceholder } from '../../src/components/Skeleton';
import { StatusBadge } from '../../src/components/StatusBadge';
import { MultiCompareSheet } from '../../src/components/MultiCompareSheet';
import { EmptyState } from '../../src/components/EmptyState';
import { RetryCard } from '../../src/components/RetryCard';
import {
  ActionSheet,
  type ActionSheetAction,
} from '../../src/components/ActionSheet';
import * as Clipboard from 'expo-clipboard';
import { useBrandToast } from '../../src/components/BrandToast';
import { useRecentlyViewed } from '../../src/hooks/useRecentlyViewed';
import * as Haptics from 'expo-haptics';
import supabase from '../../src/lib/supabase';
import type { EntitySearchResult } from '@stroom/supabase';
import type { Predicate } from '@stroom/types';
import { resolveClaimDisplayValue } from '../../src/lib/resolveDisplayValue';
import { HighlightedText } from '../../src/components/HighlightedText';
import { ScreenCanvas } from '../../src/components/ScreenCanvas';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const flatListRef = React.useRef<FlatList>(null);

  React.useEffect(() => {
    const unsub = (navigation as any).addListener?.('tabPress', () => {
      if ((navigation as any).isFocused?.()) {
        flatListRef.current?.scrollToOffset({ offset: 0, animated: true });
      }
    });
    return unsub;
  }, [navigation]);

  const [segment, setSegment] = useState<'entities' | 'claims' | 'sources'>('entities');
  const [query, setQuery] = useState('');
  const [quickNavOpen, setQuickNavOpen] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const { results, loading, error, refresh: refreshSearch } =
    useExploreSearch(query);
  const {
    results: claimResults,
    loading: claimsLoading,
    refresh: refreshClaims,
  } = useClaimsSearch(query, segment === 'claims');
  const {
    results: sourceResults,
    loading: sourcesLoading,
    refresh: refreshSources,
  } = useSourcesSearch(query, segment === 'sources');
  const { recent: recentlyViewed } = useRecentlyViewed();
  const { show: showToast } = useBrandToast();
  const [menuEntity, setMenuEntity] = useState<EntitySearchResult | null>(null);
  const [quickStatsEntity, setQuickStatsEntity] = useState<EntitySearchResult | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRefreshing(true);
    await refreshSearch();
    // Give the search debounce a tick to resolve before dropping the spinner.
    setTimeout(() => setRefreshing(false), 400);
  }, [refreshSearch]);

  const toggleSelectMode = useCallback(() => {
    Haptics.selectionAsync();
    setSelectMode((m) => {
      if (m) setSelectedIds(new Set());
      return !m;
    });
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

  const handleResearchAll = useCallback(() => {
    if (selectedIds.size === 0) return;
    const picked = results.filter((r) => selectedIds.has(r.id));
    const names = picked.map((p) => p.canonical_name ?? p.name ?? 'unnamed');
    const prompt = [
      `Research the following ${picked.length} entities and summarize how they compare:`,
      '',
      ...picked.map(
        (p) =>
          `- ${p.canonical_name ?? p.name ?? 'unnamed'}${
            p.entity_type ? ` (${p.entity_type})` : ''
          }${p.domain ? ` — ${p.domain}` : ''}`
      ),
      '',
      'For each entity, return: a 1-sentence identity, top 3 facts, and any notable differences between them.',
    ].join('\n');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push({
      pathname: '/(tabs)/command',
      params: { prompt },
    } as any);
    setSelectMode(false);
    setSelectedIds(new Set());
  }, [results, selectedIds, router]);

  // Unique entity types present in the current result set
  const availableTypes = useMemo(() => {
    const set = new Set<string>();
    for (const r of results) {
      if (r.entity_type) set.add(r.entity_type);
    }
    return Array.from(set).sort();
  }, [results]);

  // Reset the filter when the selected type disappears from the result set
  React.useEffect(() => {
    if (typeFilter && !availableTypes.includes(typeFilter)) {
      setTypeFilter(null);
    }
  }, [availableTypes, typeFilter]);

  const filteredResults = useMemo(
    () => (typeFilter ? results.filter((r) => r.entity_type === typeFilter) : results),
    [results, typeFilter]
  );

  const handleOpenEntity = useCallback(
    (id: string) => {
      Keyboard.dismiss();
      // Cast: typed routes for entity/[id] regenerate on next expo start
      router.push({ pathname: '/entity/[id]', params: { id } } as any);
    },
    [router]
  );

  const renderItem = useCallback(
    ({ item }: { item: EntitySearchResult }) => {
      if (selectMode) {
        const checked = selectedIds.has(item.id);
        return (
          <Pressable
            onPress={() => toggleSelect(item.id)}
            style={({ pressed }) => [
              styles.selectRow,
              checked && styles.selectRowActive,
              pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] },
            ]}
          >
            <View
              style={[styles.checkbox, checked && styles.checkboxActive]}
            >
              {checked && (
                <Ionicons name="checkmark" size={14} color={colors.obsidian} />
              )}
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.selectName} numberOfLines={1}>
                {item.canonical_name ?? item.name ?? 'Unnamed'}
              </Text>
              <Text style={styles.selectMeta} numberOfLines={1}>
                {item.entity_type ?? 'entity'}
                {item.domain ? ` · ${item.domain}` : ''}
              </Text>
            </View>
          </Pressable>
        );
      }
      return (
        <EntityRow
          entity={item}
          query={trimmed}
          onPress={() => handleOpenEntity(item.id)}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setQuickStatsEntity(item);
          }}
        />
      );
    },
    [handleOpenEntity, selectMode, selectedIds, toggleSelect]
  );

  const entityMenuActions: ActionSheetAction[] = React.useMemo(() => {
    if (!menuEntity) return [];
    const name =
      menuEntity.canonical_name ?? menuEntity.name ?? 'this entity';
    return [
      {
        label: 'View Details',
        icon: 'information-circle-outline',
        tone: 'accent',
        onPress: () => {
          Haptics.selectionAsync();
          handleOpenEntity(menuEntity.id);
        },
      },
      {
        label: 'Copy Name',
        icon: 'copy-outline',
        onPress: async () => {
          await Clipboard.setStringAsync(name);
          Haptics.selectionAsync();
          showToast('Name copied', 'success');
        },
      },
      {
        label: 'View in Graph',
        icon: 'git-network-outline',
        onPress: () => {
          Haptics.selectionAsync();
          handleOpenEntity(menuEntity.id);
        },
      },
    ];
  }, [menuEntity, handleOpenEntity, showToast]);

  const keyExtractor = useCallback((item: EntitySearchResult) => item.id, []);

  const trimmed = query.trim();

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <ScreenTransition>
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Explore</Text>
          {segment === 'entities' && (
            <Pressable
              onPress={toggleSelectMode}
              hitSlop={10}
              style={({ pressed }) => [
                styles.selectToggle,
                selectMode && styles.selectToggleActive,
                pressed && { opacity: 0.7 },
              ]}
            >
              <Ionicons
                name={selectMode ? 'close' : 'checkbox-outline'}
                size={14}
                color={selectMode ? colors.teal : colors.silver}
              />
              <Text
                style={[
                  styles.selectToggleText,
                  selectMode && { color: colors.teal },
                ]}
              >
                {selectMode ? 'Done' : 'Select'}
              </Text>
            </Pressable>
          )}
        </View>
        <Text style={styles.headerSub}>
          {segment === 'entities'
            ? segment === 'entities'
              ? trimmed
                ? `Entities matching "${trimmed}"`
                : 'Recent entities'
              : segment === 'claims'
              ? trimmed
                ? `Claims matching "${trimmed}"`
                : 'Recent claims'
              : trimmed
              ? `Sources matching "${trimmed}"`
              : 'Trusted sources'
            : 'Search the graph'}
        </Text>

        {/* Segment control — entities / claims / sources */}
        <View style={styles.segment}>
          {(['entities', 'claims', 'sources'] as const).map((key) => {
            const active = segment === key;
            return (
              <Pressable
                key={key}
                onPress={() => {
                  Haptics.selectionAsync();
                  setSegment(key);
                }}
                style={[styles.segmentBtn, active && styles.segmentBtnActive]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    active && styles.segmentTextActive,
                  ]}
                >
                  {key === 'entities'
                    ? 'Entities'
                    : key === 'claims'
                    ? 'Claims'
                    : 'Sources'}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Search box — shared across all three segments */}
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.slate} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={
              segment === 'entities'
                ? 'Search entities…'
                : segment === 'claims'
                ? 'Search claims…'
                : 'Search sources…'
            }
            placeholderTextColor={colors.slate}
            style={styles.searchInput}
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
            clearButtonMode="while-editing"
          />
          {query.length > 0 && (
            <Pressable onPress={() => setQuery('')} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.slate} />
            </Pressable>
          )}
        </View>
        <SearchLoadingBar
          active={
            trimmed.length > 0 &&
            ((segment === 'entities' && loading) ||
              (segment === 'claims' && claimsLoading) ||
              (segment === 'sources' && sourcesLoading))
          }
        />

        {/* Entity type filter chips */}
        {segment === 'entities' && availableTypes.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterRow}
          >
            <FilterChip
              label="All"
              active={typeFilter === null}
              onPress={() => setTypeFilter(null)}
            />
            {availableTypes.map((t) => (
              <FilterChip
                key={t}
                label={t}
                active={typeFilter === t}
                onPress={() => setTypeFilter(t)}
              />
            ))}
          </ScrollView>
        )}
      </View>

      {segment === 'entities' ? (
        loading && results.length === 0 ? (
          <View style={styles.list}>
            <SkeletonListPlaceholder count={6} />
          </View>
        ) : error && results.length === 0 ? (
          <View style={styles.emptyWrap}>
            <RetryCard
              message="Search failed"
              detail={error}
              onRetry={refreshSearch}
            />
          </View>
        ) : filteredResults.length === 0 ? (
          <ScrollView
            contentContainerStyle={styles.emptyWrap}
            keyboardShouldPersistTaps="handled"
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.teal}
              />
            }
          >
            <EmptyState
              icon="search"
              title="No Results"
              subtitle={
                typeFilter
                  ? `No ${typeFilter} entities match "${trimmed}".`
                  : 'Try a different search term or filter'
              }
              compact
            />
            {trimmed.length >= 4 && (
              <Pressable
                onPress={() => setQuery(trimmed.slice(0, Math.max(2, trimmed.length - 2)))}
                style={({ pressed }) => [
                  styles.suggestPill,
                  pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
                ]}
              >
                <Ionicons name="return-up-back-outline" size={13} color={colors.teal} />
                <Text style={styles.suggestPillText}>Try a shorter search</Text>
              </Pressable>
            )}
            {availableTypes.length > 0 && (
              <>
                <Text style={styles.browseLabel}>OR BROWSE BY TYPE</Text>
                <View style={styles.browseChips}>
                  {availableTypes.map((t) => (
                    <Pressable
                      key={t}
                      onPress={() => {
                        setQuery('');
                        setTypeFilter(t);
                      }}
                      style={({ pressed }) => [
                        styles.browseChip,
                        pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
                      ]}
                    >
                      <Text style={styles.browseChipText}>{t}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            )}
          </ScrollView>
        ) : (
          <FlatList
            ref={flatListRef}
            data={filteredResults}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            maxToRenderPerBatch={10}
            windowSize={5}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                tintColor={colors.teal}
              />
            }
            ListHeaderComponent={
              !trimmed && !selectMode && recentlyViewed.length === 0 ? (
                <EmptyState
                  icon="time"
                  title="No Recent Entities"
                  subtitle="Entities you view will appear here"
                  compact
                />
              ) : !trimmed && !selectMode && recentlyViewed.length > 0 ? (
                <View style={styles.recentBlock}>
                  <Text style={styles.recentHeader}>RECENTLY VIEWED</Text>
                  {recentlyViewed.map((r) => (
                    <Pressable
                      key={r.id}
                      onPress={() => handleOpenEntity(r.id)}
                      style={({ pressed }) => [
                        styles.recentRow,
                        pressed && {
                          opacity: 0.75,
                          transform: [{ scale: 0.98 }],
                        },
                      ]}
                    >
                      <Ionicons
                        name="time-outline"
                        size={14}
                        color={colors.slate}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={styles.recentName} numberOfLines={1}>
                          {r.name}
                        </Text>
                        {r.type ? (
                          <Text style={styles.recentType} numberOfLines={1}>
                            {r.type}
                          </Text>
                        ) : null}
                      </View>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={colors.slate}
                      />
                    </Pressable>
                  ))}
                </View>
              ) : null
            }
          />
        )
      ) : segment === 'claims' ? (
        <FlatList
          data={claimResults}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRefreshing(true);
                refreshClaims();
                setTimeout(() => setRefreshing(false), 400);
              }}
              tintColor={colors.teal}
            />
          }
          ListEmptyComponent={
            claimsLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.teal} size="large" />
              </View>
            ) : (
              <EmptyState
                icon="document-text"
                title={trimmed ? 'No Matching Claims' : 'No Claims'}
                subtitle={
                  trimmed
                    ? `No claims match "${trimmed}"`
                    : 'Type to search across predicates and values'
                }
                compact
              />
            )
          }
          renderItem={({ item }) => (
            <ClaimSearchCard
              claim={item}
              query={trimmed}
              onPressClaim={() =>
                router.push({
                  pathname: '/claim/[id]',
                  params: { id: item.id },
                } as any)
              }
              onPressEntity={() => {
                if (item.subject_entity_id) {
                  router.push({
                    pathname: '/entity/[id]',
                    params: { id: item.subject_entity_id },
                  } as any);
                }
              }}
            />
          )}
        />
      ) : (
        <FlatList
          data={sourceResults}
          keyExtractor={(s) => s.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          keyboardShouldPersistTaps="handled"
          maxToRenderPerBatch={10}
          windowSize={5}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                setRefreshing(true);
                refreshSources();
                setTimeout(() => setRefreshing(false), 400);
              }}
              tintColor={colors.teal}
            />
          }
          ListEmptyComponent={
            sourcesLoading ? (
              <View style={styles.loadingWrap}>
                <ActivityIndicator color={colors.teal} size="large" />
              </View>
            ) : (
              <EmptyState
                icon="cube"
                title={trimmed ? 'No Matching Sources' : 'No Sources'}
                subtitle={
                  trimmed
                    ? `No sources match "${trimmed}"`
                    : 'Type to search the source registry'
                }
                compact
              />
            )
          }
          renderItem={({ item }) => (
            <SourceSearchCard
              source={item}
              query={trimmed}
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
      {selectMode && selectedIds.size > 0 && (
        <View style={[styles.fab, { bottom: insets.bottom + 16 }]}>
          <Pressable
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              setCompareOpen(true);
            }}
            style={({ pressed }) => [
              styles.fabBtn,
              pressed && { opacity: 0.75 },
            ]}
            disabled={selectedIds.size < 2}
          >
            <Ionicons
              name="layers-outline"
              size={16}
              color={selectedIds.size < 2 ? colors.slate : colors.alabaster}
            />
            <Text
              style={[
                styles.fabBtnText,
                selectedIds.size < 2 && { color: colors.slate },
              ]}
            >
              Compare ({selectedIds.size})
            </Text>
          </Pressable>
          <Pressable
            onPress={handleResearchAll}
            style={({ pressed }) => [
              styles.fabBtnPrimary,
              pressed && { opacity: 0.75 },
            ]}
          >
            <Ionicons name="sparkles" size={16} color={colors.obsidian} />
            <Text style={styles.fabBtnPrimaryText}>Research All</Text>
          </Pressable>
        </View>
      )}

      <ActionSheet
        visible={menuEntity !== null}
        title={menuEntity?.canonical_name ?? menuEntity?.name ?? 'Entity'}
        subtitle={menuEntity?.entity_type ?? 'entity'}
        actions={entityMenuActions}
        onDismiss={() => setMenuEntity(null)}
      />

      {/* Entity Quick Stats Popup — glassmorphic popover on long-press */}
      <EntityQuickStatsPopup
        entity={quickStatsEntity}
        onDismiss={() => setQuickStatsEntity(null)}
        onOpen={(id) => {
          setQuickStatsEntity(null);
          handleOpenEntity(id);
        }}
      />

      <MultiCompareSheet
        visible={compareOpen}
        entityIds={Array.from(selectedIds)}
        onDismiss={() => setCompareOpen(false)}
        onOpenEntity={(id) => {
          setCompareOpen(false);
          setSelectMode(false);
          setSelectedIds(new Set());
          router.push({ pathname: '/entity/[id]', params: { id } } as any);
        }}
      />
      {/* Entity Quick Nav FAB — "Cmd+K" for the app */}
      {!quickNavOpen && (
        <Pressable
          onPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setQuickNavOpen(true);
          }}
          style={({ pressed }) => [
            fabStyles.fab,
            { bottom: 16 + insets.bottom },
            pressed && { opacity: 0.85, transform: [{ scale: 0.95 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Quick entity search"
        >
          <Ionicons name="compass-outline" size={26} color={colors.obsidian} />
        </Pressable>
      )}

      {quickNavOpen && (
        <QuickNavOverlay
          onSelect={(id) => {
            setQuickNavOpen(false);
            router.push({ pathname: '/entity/[id]', params: { id } } as any);
          }}
          onDismiss={() => setQuickNavOpen(false)}
        />
      )}
    </ScreenTransition>
    </View>
  );
}

function PredicatesView({
  predicates,
  counts,
  loading,
  error,
  onPress,
}: {
  predicates: Predicate[];
  counts: Map<string, number>;
  loading: boolean;
  error: string | null;
  onPress: (p: Predicate) => void;
}) {
  // Group by category
  const grouped = React.useMemo(() => {
    const map = new Map<string, Predicate[]>();
    for (const p of predicates) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return Array.from(map.entries()).sort((a, b) => a[0].localeCompare(b[0]));
  }, [predicates]);

  if (loading && predicates.length === 0) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.teal} size="large" />
      </View>
    );
  }
  if (error && predicates.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }
  if (predicates.length === 0) {
    return (
      <View style={styles.emptyWrap}>
        <Ionicons name="git-network-outline" size={40} color={colors.slate} />
        <Text style={styles.emptyTitle}>No predicates</Text>
      </View>
    );
  }

  return (
    <ScrollView
      contentContainerStyle={styles.predicateList}
      showsVerticalScrollIndicator={false}
    >
      {grouped.map(([category, preds]) => (
        <View key={category} style={styles.predicateGroup}>
          <Text style={styles.predicateDomain}>{category}</Text>
          {preds.map((p) => {
            const count = counts.get(p.predicate_key) ?? 0;
            return (
              <Pressable
                key={p.predicate_key}
                onPress={() => onPress(p)}
                style={({ pressed }) => [
                  styles.predicateRow,
                  pressed && { opacity: 0.75 },
                ]}
              >
                <View style={styles.predicateBody}>
                  <Text style={styles.predicateLabel} numberOfLines={1}>
                    {p.display_name}
                  </Text>
                  <Text style={styles.predicateKey} numberOfLines={1}>
                    {p.predicate_key}
                  </Text>
                </View>
                <View style={styles.predicateCountChip}>
                  <Text style={styles.predicateCountText}>{count}</Text>
                </View>
                <Ionicons name="chevron-forward" size={14} color={colors.slate} />
              </Pressable>
            );
          })}
        </View>
      ))}
    </ScrollView>
  );
}


// Thin indeterminate loading bar rendered below the search box while the
// debounced query is in flight. Sweeps a teal bar back and forth.
// Claim result card — top line: subject entity name in teal (tappable,
// navigates to the entity), second line: predicate in silver mono,
// third line: truncated value preview. Right side: StatusBadge. Tapping
// anywhere outside the entity link opens the claim detail screen.
const ClaimSearchCard = React.memo(function ClaimSearchCard({
  claim,
  query,
  onPressClaim,
  onPressEntity,
}: {
  claim: import('../../src/hooks/useClaimsSearch').ClaimSearchResult;
  query: string;
  onPressClaim: () => void;
  onPressEntity: () => void;
}) {
  const subject =
    claim.subject_entity?.canonical_name ?? 'Unknown entity';
  const predicate = (claim.predicate ?? 'unknown')
    .split('.')
    .pop()!
    .replace(/_/g, ' ');
  const valuePreview = resolveClaimDisplayValue(
    claim.value_jsonb as Record<string, unknown> | null,
    claim.object_entity?.canonical_name ?? null,
    claim.predicate
  );
  return (
    <Pressable
      onPress={onPressClaim}
      style={({ pressed }) => [
        styles.claimCard,
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={styles.claimCardBody}>
        <Pressable
          onPress={(e) => {
            e.stopPropagation?.();
            onPressEntity();
          }}
          hitSlop={4}
        >
          <HighlightedText
            text={subject}
            query={query}
            style={styles.claimCardSubject}
            numberOfLines={1}
          />
        </Pressable>
        <HighlightedText
          text={predicate}
          query={query}
          style={styles.claimCardPredicate}
          numberOfLines={1}
        />
        {valuePreview ? (
          <HighlightedText
            text={valuePreview}
            query={query}
            style={styles.claimCardValue}
            numberOfLines={2}
          />
        ) : null}
      </View>
      <StatusBadge status={claim.status} />
    </Pressable>
  );
});

// Source result card — source_name bold, colored source_class badge,
// small teal trust score, claim count on the right. Whole card navigates
// to the source detail screen.
const SourceSearchCard = React.memo(function SourceSearchCard({
  source,
  query,
  onPress,
}: {
  source: import('../../src/hooks/useSourcesSearch').SourceSearchResult;
  query: string;
  onPress: () => void;
}) {
  const palette = sourceClassPalette(source.source_class ?? '');
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.sourceCard,
        pressed && { opacity: 0.85, transform: [{ scale: 0.98 }] },
      ]}
    >
      <View style={styles.sourceCardBody}>
        <HighlightedText
          text={source.source_name}
          query={query}
          style={styles.sourceCardName}
          numberOfLines={1}
        />
        <View style={styles.sourceCardMetaRow}>
          {source.source_class ? (
            <View
              style={[
                styles.sourceClassBadge,
                { backgroundColor: palette.bg, borderColor: palette.border },
              ]}
              accessible
              accessibilityRole="text"
              accessibilityLabel={`Source class: ${source.source_class.replace(/_/g, ' ')}`}
            >
              <Text style={[styles.sourceClassText, { color: palette.fg }]}>
                {source.source_class.replace(/_/g, ' ').toUpperCase()}
              </Text>
            </View>
          ) : null}
          <Text style={styles.sourceCardTrust}>
            {Number(source.trust_score).toFixed(1)}
          </Text>
        </View>
      </View>
      <Text style={styles.sourceCardClaims}>
        {source.claim_count.toLocaleString()} claims
      </Text>
    </Pressable>
  );
});

function sourceClassPalette(cls: string): {
  bg: string;
  border: string;
  fg: string;
} {
  const key = cls.toLowerCase();
  if (key.includes('corporate') || key.includes('ir'))
    return {
      bg: 'rgba(34, 197, 94, 0.12)',
      border: 'rgba(34, 197, 94, 0.35)',
      fg: colors.statusApprove,
    };
  if (key.includes('news') || key.includes('media'))
    return {
      bg: 'rgba(59, 130, 246, 0.14)',
      border: 'rgba(59, 130, 246, 0.4)',
      fg: colors.statusInfo,
    };
  if (key.includes('premium') || key.includes('data'))
    return {
      bg: 'rgba(167, 139, 250, 0.14)',
      border: 'rgba(167, 139, 250, 0.4)',
      fg: '#A78BFA',
    };
  if (key.includes('social') || key.includes('community'))
    return {
      bg: 'rgba(244, 114, 182, 0.14)',
      border: 'rgba(244, 114, 182, 0.4)',
      fg: '#F472B6',
    };
  if (key.includes('government') || key.includes('regulatory'))
    return {
      bg: 'rgba(245, 158, 11, 0.14)',
      border: 'rgba(245, 158, 11, 0.4)',
      fg: colors.statusPending,
    };
  return {
    bg: colors.tealDim,
    border: 'rgba(0, 161, 155, 0.35)',
    fg: colors.teal,
  };
}

function SearchLoadingBar({ active }: { active: boolean }) {
  const progress = useSharedValue(0);
  React.useEffect(() => {
    if (active) {
      progress.value = 0;
      progress.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true
      );
    } else {
      cancelAnimation(progress);
      progress.value = withTiming(0, { duration: 150 });
    }
  }, [active, progress]);
  const style = useAnimatedStyle(() => ({
    opacity: active ? 1 : 0,
    transform: [
      { translateX: -60 + progress.value * 120 },
      { scaleX: 0.4 + progress.value * 0.6 },
    ],
  }));
  if (!active) return null;
  return (
    <View style={styles.loadingBarTrack}>
      <Animated.View style={[styles.loadingBarFill, style]} />
    </View>
  );
}

function FilterChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.filterPill,
        active && styles.filterPillActive,
        pressed && { opacity: 0.7 },
      ]}
    >
      <Text style={[styles.filterText, active && styles.filterTextActive]}>
        {label}
      </Text>
    </Pressable>
  );
}

// Full-screen entity quick-nav overlay — the "Cmd+K" for mobile. Keyboard
// opens immediately; results stream in as the user types via the existing
// entity search hook. Tapping a result navigates and dismisses.
function QuickNavOverlay({
  onSelect,
  onDismiss,
}: {
  onSelect: (entityId: string) => void;
  onDismiss: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const { results, loading } = useExploreSearch(q);

  return (
    <View style={qnavStyles.overlay}>
      <LinearGradient
        colors={['rgba(0,0,0,0.95)', 'rgba(10,13,15,0.98)']}
        style={[qnavStyles.gradient, { paddingTop: insets.top + spacing.md }]}
      >
        {/* Header with search input + dismiss */}
        <View style={qnavStyles.header}>
          <View style={qnavStyles.inputWrap}>
            <Ionicons name="compass-outline" size={18} color={colors.teal} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Jump to entity…"
              placeholderTextColor={colors.slate}
              style={qnavStyles.input}
              autoFocus
              returnKeyType="search"
              autoCapitalize="none"
              autoCorrect={false}
            />
            {q.length > 0 && (
              <Pressable onPress={() => setQ('')} hitSlop={8}>
                <Ionicons name="close-circle" size={16} color={colors.slate} />
              </Pressable>
            )}
          </View>
          <Pressable
            onPress={onDismiss}
            hitSlop={8}
            style={({ pressed }) => [pressed && { opacity: 0.6 }]}
          >
            <Text style={qnavStyles.cancelText}>Cancel</Text>
          </Pressable>
        </View>

        {/* Results */}
        <FlatList
          data={results}
          keyExtractor={(r) => r.id}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: insets.bottom + 20 }}
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onSelect(item.id)}
              style={({ pressed }) => [
                qnavStyles.row,
                pressed && { opacity: 0.75, backgroundColor: colors.surfaceCard },
              ]}
            >
              <View style={{ flex: 1 }}>
                <HighlightedText
                  text={item.canonical_name || item.name || 'Unnamed'}
                  query={q}
                  style={qnavStyles.name}
                  numberOfLines={1}
                />
                <View style={qnavStyles.metaRow}>
                  {item.entity_type && (
                    <View style={qnavStyles.badge}>
                      <Text style={qnavStyles.badgeText}>
                        {item.entity_type}
                      </Text>
                    </View>
                  )}
                  {item.domain && (
                    <Text style={qnavStyles.domain} numberOfLines={1}>
                      {item.domain}
                    </Text>
                  )}
                </View>
              </View>
              <Ionicons name="chevron-forward" size={16} color={colors.slate} />
            </Pressable>
          )}
          ListEmptyComponent={
            loading ? (
              <ActivityIndicator
                color={colors.teal}
                style={{ marginTop: spacing.xxl }}
              />
            ) : q.trim().length > 0 ? (
              <Text style={qnavStyles.empty}>No entities found</Text>
            ) : (
              <Text style={qnavStyles.empty}>Type to search…</Text>
            )
          }
        />
      </LinearGradient>
    </View>
  );
}

// Entity Quick Stats Popup — glassmorphic popover shown on long-press of
// an entity row. Fetches claim count + coverage score on mount, shows a
// mini progress bar, name, type, last updated, and an Open button.
function EntityQuickStatsPopup({
  entity,
  onDismiss,
  onOpen,
}: {
  entity: EntitySearchResult | null;
  onDismiss: () => void;
  onOpen: (id: string) => void;
}) {
  const [stats, setStats] = useState<{
    claimCount: number;
    coverageScore: number;
    lastUpdated: string | null;
  } | null>(null);

  useEffect(() => {
    if (!entity) {
      setStats(null);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data: claims } = await supabase
        .schema('intel')
        .from('claims')
        .select('id, predicate, corroboration_score', { count: 'exact', head: false })
        .eq('subject_entity_id', entity.id);
      const claimList = (claims ?? []) as any[];
      const predCategories = new Set<string>();
      let corroborated = 0;
      for (const c of claimList) {
        const p = String(c.predicate ?? '');
        predCategories.add(p.includes('.') ? p.split('.')[0] : 'other');
        if ((c.corroboration_score ?? 0) >= 1) corroborated++;
      }
      const score = Math.round(
        ((Math.min(1, claimList.length / 10) +
          Math.min(1, predCategories.size / 5) +
          (claimList.length > 0 ? corroborated / claimList.length : 0)) /
          3) *
          100
      );
      // Fetch entity updated_at
      const { data: ent } = await supabase
        .schema('intel')
        .from('entities')
        .select('updated_at')
        .eq('id', entity.id)
        .single();
      if (!cancelled) {
        setStats({
          claimCount: claimList.length,
          coverageScore: score,
          lastUpdated: (ent as any)?.updated_at ?? null,
        });
      }
    })();
    return () => { cancelled = true; };
  }, [entity]);

  if (!entity) return null;

  const name = entity.canonical_name || entity.name || 'Unnamed entity';
  const type = entity.entity_type || entity.entity_class || 'entity';

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
    >
      <Pressable style={qsStyles.backdrop} onPress={onDismiss}>
        <Animated.View
          entering={FadeIn.duration(150)}
          style={qsStyles.popover}
        >
          {Platform.OS === 'ios' && (
            <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
          )}
          <View style={qsStyles.topGlow} pointerEvents="none" />

          <Text style={qsStyles.name} numberOfLines={1}>{name}</Text>
          <View style={qsStyles.typeBadge}>
            <Text style={qsStyles.typeText}>{type}</Text>
          </View>

          {/* Coverage progress bar */}
          <View style={qsStyles.statRow}>
            <Text style={qsStyles.statLabel}>Coverage</Text>
            <View style={qsStyles.barTrack}>
              <View
                style={[
                  qsStyles.barFill,
                  { width: `${stats?.coverageScore ?? 0}%` },
                ]}
              />
            </View>
            <Text style={qsStyles.statValue}>
              {stats ? `${stats.coverageScore}%` : '—'}
            </Text>
          </View>

          <View style={qsStyles.statRow}>
            <Text style={qsStyles.statLabel}>Claims</Text>
            <Text style={qsStyles.statValue}>
              {stats ? stats.claimCount.toLocaleString() : '—'}
            </Text>
          </View>

          <View style={qsStyles.statRow}>
            <Text style={qsStyles.statLabel}>Updated</Text>
            <Text style={qsStyles.statValue}>
              {stats?.lastUpdated
                ? new Date(stats.lastUpdated).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                  })
                : '—'}
            </Text>
          </View>

          <Pressable
            onPress={() => {
              Haptics.selectionAsync();
              onOpen(entity.id);
            }}
            style={({ pressed }) => [
              qsStyles.openBtn,
              pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
            ]}
          >
            <Text style={qsStyles.openBtnText}>Open</Text>
            <Ionicons name="arrow-forward" size={14} color={colors.obsidian} />
          </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const qsStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    padding: spacing.xl,
  },
  popover: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: Platform.OS === 'ios'
      ? 'rgba(24, 24, 24, 0.65)'
      : 'rgba(24, 24, 24, 0.92)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.sheetBorder,
    padding: spacing.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.6,
    shadowRadius: 20,
    elevation: 12,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  name: {
    fontFamily: fonts.archivo.bold,
    fontSize: 18,
    color: colors.alabaster,
    marginBottom: spacing.xs,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    backgroundColor: colors.tealDim,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginBottom: spacing.md,
  },
  typeText: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    color: colors.teal,
    textTransform: 'lowercase',
  },
  statRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
    gap: spacing.sm,
  },
  statLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    minWidth: 64,
  },
  statValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    color: colors.alabaster,
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: colors.teal,
  },
  openBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  openBtnText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    color: colors.obsidian,
  },
});

const qnavStyles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 100,
  },
  gradient: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginBottom: spacing.md,
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.teal,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  input: {
    flex: 1,
    fontFamily: fonts.archivo.medium,
    fontSize: 16,
    color: colors.alabaster,
    paddingVertical: 0,
  },
  cancelText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.teal,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  name: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.alabaster,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
  },
  badge: {
    backgroundColor: colors.tealDim,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  badgeText: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    color: colors.teal,
    textTransform: 'lowercase',
  },
  domain: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    flex: 1,
  },
  empty: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
});

const fabStyles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.teal,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 50,
  },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: 'transparent' },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
  },
  selectToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceElevated,
  },
  selectToggleActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealDim,
  },
  selectToggleText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.silver,
  },
  selectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  selectRowActive: {
    borderColor: colors.teal,
    backgroundColor: colors.tealDim,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: colors.slate,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxActive: {
    backgroundColor: colors.teal,
    borderColor: colors.teal,
  },
  selectName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.alabaster,
  },
  selectMeta: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  fab: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    flexDirection: 'row',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  fabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  fabBtnText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
  },
  fabBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  fabBtnPrimaryText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 13,
    color: colors.obsidian,
  },
  headerSub: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    marginTop: spacing.xs,
    marginBottom: spacing.md,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: 3,
    marginBottom: spacing.md,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
  },
  segmentText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.slate,
  },
  segmentTextActive: {
    color: colors.teal,
  },
  predicateList: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  predicateGroup: {
    gap: spacing.xs,
  },
  predicateDomain: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.slate,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
    marginTop: spacing.xs,
  },
  predicateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  predicateBody: {
    flex: 1,
    gap: 2,
  },
  predicateLabel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  predicateKey: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
  },
  predicateCountChip: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(0, 161, 155, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.25)',
  },
  predicateCountText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    height: 44,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.archivo.regular,
    fontSize: 15,
    color: colors.alabaster,
    paddingVertical: 0,
  },
  filterRow: {
    gap: spacing.xs,
    paddingTop: spacing.sm + 2,
    paddingBottom: spacing.xs,
    paddingRight: spacing.lg,
  },
  filterPill: {
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
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
    textTransform: 'capitalize',
  },
  filterTextActive: {
    color: colors.teal,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  claimCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  claimCardBody: {
    flex: 1,
    gap: 2,
  },
  claimCardSubject: {
    fontFamily: fonts.archivo.bold,
    fontSize: 15,
    color: colors.teal,
  },
  claimCardPredicate: {
    fontFamily: fonts.mono.regular,
    fontSize: 12,
    color: colors.silver,
    textTransform: 'capitalize',
  },
  claimCardValue: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    lineHeight: 15,
    marginTop: 2,
  },
  sourceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
  },
  sourceCardBody: {
    flex: 1,
    gap: 4,
  },
  sourceCardName: {
    fontFamily: fonts.archivo.bold,
    fontSize: 16,
    color: colors.alabaster,
    letterSpacing: -0.2,
  },
  sourceCardMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sourceClassBadge: {
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  sourceClassText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    letterSpacing: 0.8,
  },
  sourceCardTrust: {
    fontFamily: fonts.mono.semibold,
    fontSize: 12,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  sourceCardClaims: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.silver,
    fontVariant: ['tabular-nums'],
  },
  loadingBarTrack: {
    height: 2,
    marginTop: 6,
    marginHorizontal: spacing.xs,
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 1,
    overflow: 'hidden',
  },
  loadingBarFill: {
    width: 60,
    height: '100%',
    backgroundColor: colors.teal,
    borderRadius: 1,
  },
  suggestPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    marginTop: spacing.sm,
  },
  suggestPillText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.teal,
  },
  browseLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  browseChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
  browseChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  browseChipText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.silver,
    textTransform: 'capitalize',
  },
  recentBlock: {
    marginBottom: spacing.md,
    gap: 4,
  },
  recentHeader: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1,
    marginBottom: spacing.xs,
    marginLeft: 2,
  },
  recentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    marginBottom: 6,
  },
  recentName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
  },
  recentType: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 1,
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
    gap: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 18,
    color: colors.silver,
  },
  emptyBody: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    textAlign: 'center',
    lineHeight: 19,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
    textAlign: 'center',
  },
});
