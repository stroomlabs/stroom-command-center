import { useCallback, useEffect, useState } from 'react';
import { searchEntities, type EntitySearchResult } from '@stroom/supabase';
import supabase from '../lib/supabase';

export function useExploreSearch(query: string) {
  const [results, setResults] = useState<EntitySearchResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const handle = setTimeout(async () => {
      try {
        const data = await searchEntities(supabase, query, 40);
        if (!cancelled) {
          setResults(data);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e.message ?? 'Search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, query.trim() ? 220 : 0);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, version]);

  // Force a re-run of the current query (used by pull-to-refresh).
  const refresh = useCallback(async () => {
    setVersion((v) => v + 1);
  }, []);

  return { results, loading, error, refresh };
}
