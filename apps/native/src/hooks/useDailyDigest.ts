import { useCallback, useEffect, useState } from 'react';
import { fetchDailyDigest, type DailyDigest } from '@stroom/supabase';
import supabase from '../lib/supabase';

export function useDailyDigest() {
  const [digest, setDigest] = useState<DailyDigest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const d = await fetchDailyDigest(supabase);
      setDigest(d);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load digest');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { digest, loading, error, refresh };
}
