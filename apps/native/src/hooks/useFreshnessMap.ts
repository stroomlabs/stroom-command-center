import { useEffect, useState } from 'react';
import supabase from '../lib/supabase';

// Cached process-wide map of predicate_key → freshness_days. We only need
// this once per app session since the registry is small and rarely changes;
// refetching on every Entity / Claim detail mount would be wasteful.
let cachedMap: Map<string, number> | null = null;
let inFlight: Promise<Map<string, number>> | null = null;

async function loadMap(): Promise<Map<string, number>> {
  if (cachedMap) return cachedMap;
  if (inFlight) return inFlight;
  inFlight = (async () => {
    const { data, error } = await supabase
      .schema('intel')
      .from('predicate_registry')
      .select('predicate_key, freshness_days');
    if (error) throw error;
    const next = new Map<string, number>();
    for (const row of (data as Array<{
      predicate_key: string;
      freshness_days: number | null;
    }> | null) ?? []) {
      if (row.freshness_days != null && row.freshness_days > 0) {
        next.set(row.predicate_key, row.freshness_days);
      }
    }
    cachedMap = next;
    inFlight = null;
    return next;
  })();
  return inFlight;
}

// Returns the cached predicate-key → freshness-days map. Returns null while
// the initial fetch is in flight; never throws — on failure the map is empty.
export function useFreshnessMap(): Map<string, number> | null {
  const [map, setMap] = useState<Map<string, number> | null>(cachedMap);

  useEffect(() => {
    if (cachedMap) {
      setMap(cachedMap);
      return;
    }
    let cancelled = false;
    loadMap()
      .then((result) => {
        if (!cancelled) setMap(result);
      })
      .catch(() => {
        // Silent failure — stale badges won't render, but the screen still
        // works. The registry is rarely unreachable in isolation.
        if (!cancelled) setMap(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return map;
}

// Pure helper — callers use this alongside `useFreshnessMap` to decide
// whether a specific claim should render a STALE badge.
export function isClaimStale(
  createdAt: string | null | undefined,
  predicate: string | null | undefined,
  freshnessMap: Map<string, number> | null
): boolean {
  if (!createdAt || !predicate || !freshnessMap) return false;
  const days = freshnessMap.get(predicate);
  if (days == null) return false;
  const ageMs = Date.now() - new Date(createdAt).getTime();
  if (!Number.isFinite(ageMs)) return false;
  return ageMs > days * 24 * 60 * 60 * 1000;
}
