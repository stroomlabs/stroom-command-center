import { useCallback, useEffect, useState } from 'react';
import { fetchSimilarEntities, type SimilarEntity } from '@stroom/supabase';
import supabase from '../lib/supabase';

// Looks up entities with names within Levenshtein distance 3 of the source.
// Best-effort: failures return an empty list rather than an error state.
//
// Filters out pairs that have already been dismissed via
// intel.dismiss_merge_suggestion. Dismissed rows where reopened_at IS NULL and
// (expires_at IS NULL or expires_at > now()) are excluded from the result.
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
    (async () => {
      try {
        const candidates = await fetchSimilarEntities(
          supabase,
          sourceId,
          sourceName,
          3
        );

        // Fetch active dismissals where the source entity is involved on
        // either side. We then build a Set of "the other" entity ids and
        // filter candidates whose id appears in that set.
        const nowIso = new Date().toISOString();
        const { data: dismissalRows } = await supabase
          .schema('intel')
          .from('merge_dismissals')
          .select('entity_a_id, entity_b_id, expires_at, reopened_at')
          .or(`entity_a_id.eq.${sourceId},entity_b_id.eq.${sourceId}`)
          .is('reopened_at', null);

        const dismissedOtherIds = new Set<string>();
        for (const row of (dismissalRows ?? []) as Array<{
          entity_a_id: string;
          entity_b_id: string;
          expires_at: string | null;
          reopened_at: string | null;
        }>) {
          // Skip expired dismissals (the "decide_later" 30-day reminder).
          if (row.expires_at && row.expires_at <= nowIso) continue;
          const otherId =
            row.entity_a_id === sourceId ? row.entity_b_id : row.entity_a_id;
          dismissedOtherIds.add(otherId);
        }

        const filtered = candidates.filter(
          (c) => !dismissedOtherIds.has(c.id)
        );
        if (!cancelled) setSimilar(filtered);
      } catch {
        if (!cancelled) setSimilar([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sourceId, sourceName]);

  // Removes a candidate from the local list without refetching. Used after
  // an in-screen dismissal so the row can animate out and disappear.
  const dismissLocal = useCallback((id: string) => {
    setSimilar((prev) => prev.filter((s) => s.id !== id));
  }, []);

  return { similar, loading, dismissLocal };
}
