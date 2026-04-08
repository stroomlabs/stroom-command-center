import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchClaimsByPredicate,
  type PredicateClaim,
} from '@stroom/supabase';
import supabase from '../../src/lib/supabase';
import { StatusBadge } from '../../src/components/StatusBadge';
import { ScreenCanvas } from '../../src/components/ScreenCanvas';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function PredicateDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { key } = useLocalSearchParams<{ key: string }>();
  const [claims, setClaims] = useState<PredicateClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!key) return;
    (async () => {
      try {
        const data = await fetchClaimsByPredicate(supabase, key, 200);
        setClaims(data);
      } catch (e: any) {
        setError(e.message ?? 'Failed to load claims');
      } finally {
        setLoading(false);
      }
    })();
  }, [key]);

  const cleanKey = (key ?? '').split('.').pop() ?? 'predicate';
  const label = cleanKey.replace(/_/g, ' ');
  const domain = (key ?? '').includes('.') ? (key ?? '').split('.')[0] : null;

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Explore</Text>
        </Pressable>
        <Text style={styles.title}>{label}</Text>
        <View style={styles.metaRow}>
          {domain && (
            <View style={styles.domainChip}>
              <Text style={styles.domainText}>{domain}</Text>
            </View>
          )}
          <Text style={styles.rawKey}>{key}</Text>
        </View>
        <Text style={styles.subtitle}>
          {claims.length} {claims.length === 1 ? 'claim' : 'claims'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={claims}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          keyboardDismissMode="on-drag"
          maxToRenderPerBatch={10}
          windowSize={5}
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({ pathname: '/claim/[id]', params: { id: item.id } } as any)
              }
              style={({ pressed }) => [
                styles.row,
                pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
              ]}
            >
              <View style={styles.rowTop}>
                <StatusBadge status={item.status} />
                <Text style={styles.rowAge}>{formatAge(item.created_at)}</Text>
              </View>
              <Text style={styles.rowSubject} numberOfLines={1}>
                {item.subject_entity?.canonical_name ?? 'Unknown'}
              </Text>
              {item.object_entity?.canonical_name && (
                <View style={styles.objectRow}>
                  <Ionicons name="arrow-forward" size={11} color={colors.slate} />
                  <Text style={styles.rowObject} numberOfLines={1}>
                    {item.object_entity.canonical_name}
                  </Text>
                </View>
              )}
              {item.source && (
                <Text style={styles.rowSource} numberOfLines={1}>
                  {item.source.source_name} · trust{' '}
                  {Number(item.source.trust_score).toFixed(1)}
                </Text>
              )}
            </Pressable>
          )}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No claims use this predicate yet.</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

function formatAge(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${Math.max(1, mins)}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
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
    color: colors.teal,
    letterSpacing: -0.8,
    textTransform: 'capitalize',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 4,
    flexWrap: 'wrap',
  },
  domainChip: {
    backgroundColor: colors.tealDim,
    borderRadius: radius.sm,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  domainText: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    color: colors.teal,
    textTransform: 'uppercase',
  },
  rawKey: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    marginTop: 6,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  row: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: 4,
  },
  rowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  rowAge: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  rowSubject: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  objectRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  rowObject: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.silver,
    flex: 1,
  },
  rowSource: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
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
  empty: {
    paddingVertical: spacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
  },
});
