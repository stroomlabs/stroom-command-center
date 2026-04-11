import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from '../lib/supabase';

// DR-036 capability infrastructure — read-only client. The schema layer
// (intel.operator_roles + intel.operator_profiles + intel.current_role()
// + intel.user_verticals()) is the source of truth; this hook is the
// thin React adapter.
//
// Caching strategy: a module-level snapshot + an AsyncStorage backing
// store, mirroring the pattern in src/lib/verticals.ts. We deliberately
// avoid adding React Query / TanStack to keep this OTA-safe and to match
// the rest of the codebase. Effective behavior:
//   - First mount of the session: hydrate from AsyncStorage (sub-frame),
//     then refetch from Supabase in the background.
//   - Subsequent mounts within 5 min: return the in-memory snapshot
//     immediately, no network call.
//   - On user change (sign-in / sign-out): cache is wiped and refetched.
//   - All mounted hooks share the same snapshot via a listener set, so
//     a refetch in one component updates every gated UI in the same tick.

export interface RoleMeta {
  id: string;
  display_name: string;
  description: string | null;
}

export interface CapabilitySnapshot {
  userId: string | null;
  email: string | null;
  displayName: string | null;
  role: RoleMeta | null;
  capabilities: Record<string, boolean>;
  verticals: string[];
  lastActiveAt: string | null;
  invitedBy: string | null;
  fetchedAt: number;
}

const STORAGE_KEY = 'stroom.capabilities.cache.v1';
const STALE_AFTER_MS = 5 * 60_000;

const EMPTY_SNAPSHOT: CapabilitySnapshot = {
  userId: null,
  email: null,
  displayName: null,
  role: null,
  capabilities: {},
  verticals: [],
  lastActiveAt: null,
  invitedBy: null,
  fetchedAt: 0,
};

let cached: CapabilitySnapshot = EMPTY_SNAPSHOT;
let inflight: Promise<CapabilitySnapshot> | null = null;
let hydrated = false;
const listeners = new Set<(snap: CapabilitySnapshot) => void>();

function emit(next: CapabilitySnapshot) {
  cached = next;
  for (const fn of listeners) fn(next);
}

async function persist(snap: CapabilitySnapshot) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch {
    // Cache is best-effort.
  }
}

async function hydrateFromStorage(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CapabilitySnapshot;
      // Tolerate missing fields from older cache versions.
      cached = { ...EMPTY_SNAPSHOT, ...parsed };
    }
  } catch {
    // Ignore corrupt cache — the live fetch will rebuild it.
  } finally {
    hydrated = true;
    for (const fn of listeners) fn(cached);
  }
}

// Live fetch from Supabase: pulls the operator_profile row joined with
// operator_roles, plus the verticals RPC. Handles the role.capabilities
// JSONB merge with any per-user overrides on operator_profiles.
async function fetchFresh(): Promise<CapabilitySnapshot> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = { ...EMPTY_SNAPSHOT, fetchedAt: Date.now() };
    void persist(next);
    return next;
  }

  // Pull profile + joined role in one round-trip. We avoid select('*, role:…')
  // because the FK relationship name isn't guaranteed across schema revisions
  // — fetching profile first then the role by id is more robust.
  const { data: profile, error: profileErr } = await supabase
    .schema('intel')
    .from('operator_profiles')
    .select('*')
    .eq('user_id', user.id)
    .maybeSingle();

  if (profileErr && __DEV__) {
    console.warn('[useCapabilities] profile fetch failed:', profileErr.message);
  }

  let roleRow: any = null;
  const roleId = (profile as any)?.role_id ?? null;
  if (roleId) {
    const { data: role } = await supabase
      .schema('intel')
      .from('operator_roles')
      .select('*')
      .eq('id', roleId)
      .maybeSingle();
    roleRow = role;
  }

  // Capabilities: role baseline JSONB merged with per-user overrides.
  const baseline =
    (roleRow?.capabilities as Record<string, boolean> | null | undefined) ?? {};
  const overrides =
    ((profile as any)?.capability_overrides as
      | Record<string, boolean>
      | null
      | undefined) ?? {};
  const effective: Record<string, boolean> = { ...baseline, ...overrides };

  // Verticals: prefer the RPC (it knows about wildcard / inheritance rules),
  // fall back to operator_profiles.allowed_verticals if the RPC isn't
  // available on this deployment.
  let verticals: string[] = [];
  try {
    const { data: vData } = await supabase
      .schema('intel')
      .rpc('user_verticals');
    if (Array.isArray(vData)) {
      verticals = (vData as unknown[]).filter(
        (v): v is string => typeof v === 'string'
      );
    } else if (vData && typeof vData === 'object') {
      // Some Supabase RPC variants wrap arrays in { user_verticals: [...] }
      const maybe = (vData as any).user_verticals ?? (vData as any).verticals;
      if (Array.isArray(maybe)) verticals = maybe.filter((v: any) => typeof v === 'string');
    }
  } catch {
    verticals = ((profile as any)?.allowed_verticals as string[] | null) ?? [];
  }

  const role: RoleMeta | null = roleRow
    ? {
        id: String(roleRow.id),
        display_name: String(roleRow.display_name ?? 'Operator'),
        description: (roleRow.description as string | null) ?? null,
      }
    : null;

  const prefs =
    ((profile as any)?.preferences as Record<string, unknown> | null) ?? {};

  const next: CapabilitySnapshot = {
    userId: user.id,
    email: user.email ?? (prefs.email as string | undefined) ?? null,
    displayName:
      ((profile as any)?.display_name as string | null) ??
      (prefs.display_name as string | undefined) ??
      null,
    role,
    capabilities: effective,
    verticals,
    lastActiveAt:
      ((profile as any)?.last_active_at as string | null) ??
      ((profile as any)?.updated_at as string | null) ??
      null,
    invitedBy: ((profile as any)?.invited_by as string | null) ?? null,
    fetchedAt: Date.now(),
  };

  void persist(next);
  return next;
}

async function refresh(force = false): Promise<CapabilitySnapshot> {
  if (!force && cached.fetchedAt > 0 && Date.now() - cached.fetchedAt < STALE_AFTER_MS) {
    return cached;
  }
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const next = await fetchFresh();
      emit(next);
      return next;
    } catch (e) {
      if (__DEV__) console.warn('[useCapabilities] fetch failed:', e);
      return cached;
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

// Public escape hatch — clears the in-memory + persisted cache. Called
// on sign-out so the next operator doesn't briefly see the previous
// operator's role.
export async function clearCapabilityCache(): Promise<void> {
  cached = EMPTY_SNAPSHOT;
  hydrated = false;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch {}
  for (const fn of listeners) fn(cached);
}

// Subscribe to auth state changes — refetch on sign-in, clear on sign-out.
// This lives at module scope so it runs once per JS bundle, not per hook
// mount.
let authSubscribed = false;
function subscribeAuthOnce() {
  if (authSubscribed) return;
  authSubscribed = true;
  supabase.auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT' || !session?.user) {
      void clearCapabilityCache();
      return;
    }
    if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
      // Force refetch — the user identity may have changed.
      if (cached.userId !== session.user.id) {
        cached = EMPTY_SNAPSHOT;
        for (const fn of listeners) fn(cached);
      }
      void refresh(true);
    }
  });
}

export interface UseCapabilitiesResult {
  userId: string | null;
  role: RoleMeta | null;
  email: string | null;
  displayName: string | null;
  capabilities: Record<string, boolean>;
  verticals: string[];
  lastActiveAt: string | null;
  invitedBy: string | null;
  isLoading: boolean;
  hasCapability: (key: string) => boolean;
  refresh: () => Promise<void>;
}

export function useCapabilities(): UseCapabilitiesResult {
  const [snap, setSnap] = useState<CapabilitySnapshot>(cached);
  const [isLoading, setIsLoading] = useState<boolean>(cached.fetchedAt === 0);

  useEffect(() => {
    subscribeAuthOnce();

    let cancelled = false;
    const listener = (next: CapabilitySnapshot) => {
      if (cancelled) return;
      setSnap(next);
      if (next.fetchedAt > 0) setIsLoading(false);
    };
    listeners.add(listener);

    (async () => {
      if (!hydrated) await hydrateFromStorage();
      const stale =
        cached.fetchedAt === 0 || Date.now() - cached.fetchedAt >= STALE_AFTER_MS;
      if (stale) {
        await refresh();
      } else {
        // Cache is fresh — surface it without triggering a network round-trip.
        setSnap(cached);
        setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);

  const hasCapability = useCallback(
    (key: string) => snap.capabilities[key] === true,
    [snap]
  );

  const refreshFn = useCallback(async () => {
    await refresh(true);
  }, []);

  return {
    userId: snap.userId,
    role: snap.role,
    email: snap.email,
    displayName: snap.displayName,
    capabilities: snap.capabilities,
    verticals: snap.verticals,
    lastActiveAt: snap.lastActiveAt,
    invitedBy: snap.invitedBy,
    isLoading,
    hasCapability,
    refresh: refreshFn,
  };
}
