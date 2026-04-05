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
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useExploreSearch } from '../../src/hooks/useExploreSearch';
import { usePredicatesList } from '../../src/hooks/usePredicatesList';
import { EntityRow } from '../../src/components/EntityRow';
import type { EntitySearchResult } from '@stroom/supabase';
import type { Predicate } from '@stroom/types';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [segment, setSegment] = useState<'entities' | 'predicates'>('entities');
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const { results, loading, error } = useExploreSearch(query);
  const predicates = usePredicatesList();

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
    ({ item }: { item: EntitySearchResult }) => (
      <EntityRow entity={item} onPress={() => handleOpenEntity(item.id)} />
    ),
    [handleOpenEntity]
  );

  const keyExtractor = useCallback((item: EntitySearchResult) => item.id, []);

  const trimmed = query.trim();

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.headerTitle}>Explore</Text>
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
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : filteredResults.length === 0 ? (
          <View style={styles.emptyWrap}>
            <Ionicons name="search-outline" size={40} color={colors.slate} />
            <Text style={styles.emptyTitle}>No matches</Text>
            <Text style={styles.emptyBody}>
              {typeFilter
                ? `No ${typeFilter} entities match "${trimmed}".`
                : 'Try a different search term or part of an entity name.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredResults}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
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
    </LinearGradient>
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
  headerTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.alabaster,
    letterSpacing: -0.8,
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
