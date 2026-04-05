import { useCallback, useEffect, useState } from 'react';
import { fetchAllSources, fetchClaimCountsBySource } from '@stroom/supabase';
import type { Source } from '@stroom/types';
import supabase from '../lib/supabase';

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
