import { useCallback, useEffect, useState } from 'react';
import { fetchTopEntities, type TopEntity } from '@stroom/supabase';
import supabase from '../lib/supabase';

export function useTopEntities(limit = 5) {
  const [entities, setEntities] = useState<TopEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchTopEntities(supabase, limit);
      setEntities(data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load top entities');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { entities, loading, error, refresh };
}
