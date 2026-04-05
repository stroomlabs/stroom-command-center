import { useCallback, useEffect, useState } from 'react';
import {
  fetchAllPredicates,
  fetchClaimCountsByPredicate,
} from '@stroom/supabase';
import type { Predicate } from '@stroom/types';
import supabase from '../lib/supabase';

export function usePredicatesList() {
  const [predicates, setPredicates] = useState<Predicate[]>([]);
  const [counts, setCounts] = useState<Map<string, number>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const [preds, cts] = await Promise.all([
        fetchAllPredicates(supabase),
        fetchClaimCountsByPredicate(supabase),
      ]);
      setPredicates(preds);
      setCounts(cts);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load predicates');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { predicates, counts, loading, error, refresh };
}
