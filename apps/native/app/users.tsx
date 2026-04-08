import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  ActivityIndicator,
  RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import supabase from '../src/lib/supabase';
import { ScreenCanvas } from '../src/components/ScreenCanvas';
import { ScreenWatermark } from '../src/components/ScreenWatermark';
import { useCapabilities } from '../src/hooks/useCapabilities';
import { CapabilityGate } from '../src/components/CapabilityGate';
import { useBrandToast } from '../src/components/BrandToast';
import { colors, fonts, spacing, radius } from '../src/constants/brand';

// DR-036 — read-only operators roster. Gated by the `users.read`
// capability via the useEffect redirect below; non-admin operators
// can't reach this screen even via deep link.
//
// Schema is defensive: operator_profiles fields vary by deployment, so
// we treat the row as `any` and pull whatever's present (display_name,
// preferences.display_name, email, role_id, last_active_at,
// updated_at). The joined operator_roles row drives the role pill
// color + label. Sort: most recently active first.

interface OperatorRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role_id: string | null;
  role_name: string | null;
  role_display: string | null;
  last_active_at: string | null;
}

const ROLE_COLOR: Record<string, string> = {
  owner: '#22C55E',
  admin: '#00A19B',
  curator: '#3B82F6',
  reviewer: '#FBBF24',
  viewer: '#94A3B8',
};

const formatLastActive = (iso: string | null): string => {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h`;
  return `${Math.floor(diff / 86_400_000)}d`;
};

export default function UsersScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { hasCapability, isLoading: capsLoading, capabilities } =
    useCapabilities();
  const { show: showToast } = useBrandToast();
  const [rows, setRows] = useState<OperatorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Capability gate — bounce out (and toast) once we know the operator
  // doesn't have users.read. We wait until we have *any* snapshot before
  // making the call so an in-flight refetch can't trigger a false bounce
  // on first sign-in.
  const haveSnapshot =
    !capsLoading || Object.keys(capabilities).length > 0;
  useEffect(() => {
    if (!haveSnapshot) return;
    if (!hasCapability('users.read')) {
      showToast('Insufficient permissions', 'error');
      router.back();
    }
  }, [haveSnapshot, hasCapability, router, showToast]);

  const load = useCallback(async () => {
    try {
      const { data: profiles, error: err } = await supabase
        .schema('intel')
        .from('operator_profiles')
        .select('*')
        .order('last_active_at', { ascending: false, nullsFirst: false });
      if (err) throw err;

      // Hydrate role lookups in one batch query so we don't N+1 the
      // operator_roles table per row.
      const roleIds = new Set<string>();
      for (const p of (profiles ?? []) as any[]) {
        if (p.role_id) roleIds.add(String(p.role_id));
      }
      let rolesById = new Map<string, any>();
      if (roleIds.size > 0) {
        const { data: roleRows } = await supabase
          .schema('intel')
          .from('operator_roles')
          .select('*')
          .in('id', Array.from(roleIds));
        for (const r of (roleRows ?? []) as any[]) {
          rolesById.set(String(r.id), r);
        }
      }

      const mapped: OperatorRow[] = ((profiles ?? []) as any[]).map((p) => {
        const prefs = (p.preferences ?? {}) as Record<string, unknown>;
        const role = p.role_id ? rolesById.get(String(p.role_id)) : null;
        return {
          user_id: String(p.user_id ?? p.id ?? ''),
          display_name:
            (p.display_name as string | null) ??
            (prefs.display_name as string | undefined) ??
            null,
          email:
            (p.email as string | null) ??
            (prefs.email as string | undefined) ??
            null,
          role_id: p.role_id ? String(p.role_id) : null,
          role_name: role?.name ? String(role.name) : null,
          role_display: role?.display_name
            ? String(role.display_name)
            : role?.name
            ? String(role.name)
            : null,
          last_active_at:
            (p.last_active_at as string | null) ??
            (p.updated_at as string | null) ??
            null,
        };
      });

      setRows(mapped);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load operators');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!haveSnapshot || !hasCapability('users.read')) return;
    void load();
  }, [haveSnapshot, hasCapability, load]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <ScreenWatermark />

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to Ops"
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Ops</Text>
        </Pressable>
        <View style={styles.titleRow}>
          <Text style={styles.title}>Operators</Text>
          <CapabilityGate capability="admin.manage_users">
            <Pressable
              onPress={() => router.push('/users/invite' as any)}
              style={({ pressed }) => [
                styles.inviteBtn,
                pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
              ]}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel="Invite operator"
            >
              <Ionicons name="add" size={20} color={colors.obsidian} />
            </Pressable>
          </CapabilityGate>
        </View>
        <Text style={styles.subtitle}>
          {rows.length} {rows.length === 1 ? 'operator' : 'operators'} ·
          sorted by last active
        </Text>
      </View>

      {loading && rows.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : error && rows.length === 0 ? (
        <View style={styles.centered}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : rows.length === 0 ? (
        <View style={styles.centered}>
          <Ionicons name="people-outline" size={32} color={colors.slate} />
          <Text style={styles.emptyText}>No operators yet</Text>
        </View>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.user_id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={colors.teal}
            />
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() =>
                router.push({
                  pathname: '/users/[id]',
                  params: { id: item.user_id },
                } as any)
              }
              style={({ pressed }) => [
                styles.row,
                pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] },
              ]}
              accessibilityRole="button"
              accessibilityLabel={`${item.display_name ?? item.email ?? 'Operator'}, ${item.role_display ?? 'no role'}`}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowName} numberOfLines={1}>
                  {item.display_name ?? item.email ?? 'Unnamed operator'}
                </Text>
                {item.email && item.display_name && (
                  <Text style={styles.rowEmail} numberOfLines={1}>
                    {item.email}
                  </Text>
                )}
              </View>
              {item.role_display && (
                <View
                  style={[
                    styles.rolePill,
                    {
                      borderColor:
                        ROLE_COLOR[item.role_name ?? ''] ?? colors.slate,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.rolePillText,
                      {
                        color:
                          ROLE_COLOR[item.role_name ?? ''] ?? colors.slate,
                      },
                    ]}
                  >
                    {item.role_display}
                  </Text>
                </View>
              )}
              <Text style={styles.rowLast}>
                {formatLastActive(item.last_active_at)}
              </Text>
              <Ionicons
                name="chevron-forward"
                size={14}
                color={colors.slate}
              />
            </Pressable>
          )}
        />
      )}
    </View>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    flex: 1,
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
  },
  inviteBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 4,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    marginTop: 4,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
  },
  emptyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  rowName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  rowEmail: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  rolePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  rolePillText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  rowLast: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: colors.slate,
    minWidth: 32,
    textAlign: 'right',
  },
});
