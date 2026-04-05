import { useCallback, useEffect, useState } from 'react';
import { fetchCoverageGaps, type CoverageGapEntity } from '@stroom/supabase';
import supabase from '../lib/supabase';

export function useCoverageGaps(threshold = 3) {
  const [gaps, setGaps] = useState<CoverageGapEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchCoverageGaps(supabase, threshold);
      setGaps(data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load coverage gaps');
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { gaps, loading, error, refresh };
}
