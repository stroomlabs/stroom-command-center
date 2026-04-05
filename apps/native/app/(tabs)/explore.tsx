import React, { useState, useCallback, useMemo } from 'react';
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
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRouter } from 'expo-router';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import { useExploreSearch } from '../../src/hooks/useExploreSearch';
import { usePredicatesList } from '../../src/hooks/usePredicatesList';
import { EntityRow } from '../../src/components/EntityRow';
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
import type { EntitySearchResult } from '@stroom/supabase';
import type { Predicate } from '@stroom/types';
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

  const [segment, setSegment] = useState<'entities' | 'predicates'>('entities');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [compareOpen, setCompareOpen] = useState(false);
  const { results, loading, error, refresh: refreshSearch } =
    useExploreSearch(query);
  const predicates = usePredicatesList();
  const { recent: recentlyViewed } = useRecentlyViewed();
  const { show: showToast } = useBrandToast();
  const [menuEntity, setMenuEntity] = useState<EntitySearchResult | null>(null);
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
          onPress={() => handleOpenEntity(item.id)}
          onLongPress={() => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setMenuEntity(item);
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
    <ScreenTransition>
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
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
            ? trimmed
              ? `Results for "${trimmed}"`
              : 'Recent entities'
            : `${predicates.predicates.length} predicates across the graph`}
        </Text>

        {/* Segment control */}
        <View style={styles.segment}>
          <Pressable
            onPress={() => setSegment('entities')}
            style={[styles.segmentBtn, segment === 'entities' && styles.segmentBtnActive]}
          >
            <Text
              style={[
                styles.segmentText,
                segment === 'entities' && styles.segmentTextActive,
              ]}
            >
              Entities
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setSegment('predicates')}
            style={[styles.segmentBtn, segment === 'predicates' && styles.segmentBtnActive]}
          >
            <Text
              style={[
                styles.segmentText,
                segment === 'predicates' && styles.segmentTextActive,
              ]}
            >
              Predicates
            </Text>
          </Pressable>
        </View>

        {/* Search box — entities only */}
        {segment === 'entities' && (
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.slate} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search entities…"
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
        )}
        {segment === 'entities' && (
          <SearchLoadingBar
            active={loading && trimmed.length > 0}
          />
        )}

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
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.teal} size="large" />
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
      ) : (
        <PredicatesView
          predicates={predicates.predicates}
          counts={predicates.counts}
          loading={predicates.loading}
          error={predicates.error}
          onPress={(p) => {
            Keyboard.dismiss();
            router.push({
              pathname: '/predicate/[key]',
              params: { key: p.predicate_key },
            } as any);
          }}
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
    </LinearGradient>
    </ScreenTransition>
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

const styles = StyleSheet.create({
  container: { flex: 1 },
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
