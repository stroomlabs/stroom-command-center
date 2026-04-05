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
import { EntityRow } from '../../src/components/EntityRow';
import type { EntitySearchResult } from '@stroom/supabase';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<string | null>(null);
  const { results, loading, error } = useExploreSearch(query);

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
          {trimmed ? `Results for "${trimmed}"` : 'Recent entities'}
        </Text>

        {/* Search box */}
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

        {/* Entity type filter chips */}
        {availableTypes.length > 0 && (
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

      {loading && results.length === 0 ? (
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
        />
      )}
    </LinearGradient>
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
