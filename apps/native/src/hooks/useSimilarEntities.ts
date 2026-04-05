import { useEffect, useState } from 'react';
import { fetchSimilarEntities, type SimilarEntity } from '@stroom/supabase';
import supabase from '../lib/supabase';

// Looks up entities with names within Levenshtein distance 3 of the source.
// Best-effort: failures return an empty list rather than an error state.
export function useSimilarEntities(
  sourceId: string | undefined,
  sourceName: string | null | undefined
) {
  const [similar, setSimilar] = useState<SimilarEntity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!sourceId || !sourceName) {
      setSimilar([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetchSimilarEntities(supabase, sourceId, sourceName, 3)
      .then((rows) => {
        if (!cancelled) setSimilar(rows);
      })
      .catch(() => {
        if (!cancelled) setSimilar([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [sourceId, sourceName]);

  return { similar, loading };
}
