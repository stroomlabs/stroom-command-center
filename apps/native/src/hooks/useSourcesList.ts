import { useCallback, useEffect, useState } from 'react';
import { fetchAllSources } from '@stroom/supabase';
import type { Source } from '@stroom/types';
import supabase from '../lib/supabase';

export function useSourcesList() {
  const [sources, setSources] = useState<Source[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchAllSources(supabase, 200);
      setSources(data);
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

  return { sources, loading, error, refresh };
}
