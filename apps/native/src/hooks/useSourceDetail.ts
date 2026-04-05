import { useCallback, useEffect, useState } from 'react';
import {
  fetchSourceById,
  fetchClaimsForSource,
  type SourceClaim,
} from '@stroom/supabase';
import type { Source } from '@stroom/types';
import supabase from '../lib/supabase';

export function useSourceDetail(id: string | undefined) {
  const [source, setSource] = useState<Source | null>(null);
  const [claims, setClaims] = useState<SourceClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [s, c] = await Promise.all([
        fetchSourceById(supabase, id),
        fetchClaimsForSource(supabase, id, 100),
      ]);
      setSource(s);
      setClaims(c);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load source');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return { source, claims, loading, error, refresh: load };
}
