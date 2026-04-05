import { useCallback, useEffect, useState } from 'react';
import { fetchAllSources, fetchClaimCountsBySource } from '@stroom/supabase';
import type { Source } from '@stroom/types';
import supabase from '../lib/supabase';

export interface UnhealthySource {
  source: Source;
  issue: 'stale' | 'failing' | 'low-trust';
}

// Sources with consecutive_failures > 0, last_fetch_at older than 7 days,
// or trust_score < 6. Defensive — the monitor columns may not exist on
// every deployment, so unknown fields just fall through as undefined.
export function pickUnhealthySources(sources: Source[]): UnhealthySource[] {
  const sevenDaysAgo = Date.now() - 7 * 86_400_000;
  const out: UnhealthySource[] = [];
  for (const s of sources) {
    const failing = Number((s as any).consecutive_failures ?? 0) > 0;
    const lastFetch = (s as any).last_fetch_at as string | undefined;
    const stale = lastFetch ? new Date(lastFetch).getTime() < sevenDaysAgo : false;
    const lowTrust = Number(s.trust_score ?? 0) < 6;
    if (failing) out.push({ source: s, issue: 'failing' });
    else if (stale) out.push({ source: s, issue: 'stale' });
    else if (lowTrust) out.push({ source: s, issue: 'low-trust' });
  }
  return out;
}

export function useSourcesList() {
  const [sources, setSources] = useState<Source[]>([]);
  const [claimCounts, setClaimCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [data, counts] = await Promise.all([
        fetchAllSources(supabase, 200),
        fetchClaimCountsBySource(supabase),
      ]);
      setSources(data);
      setClaimCounts(counts);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load sources');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sources, claimCounts, loading, error, refresh };
}
