import { useEffect, useState } from 'react';
import supabase from '../lib/supabase';

// Returns an array of 30 numbers — one per day for the last 30 days —
// representing how many claims were created for a given entity on each day.
// Most-recent day is last in the array. Used to drive the Sparkline component.
export function useClaimSparkline(entityId: string | null | undefined): number[] {
  const [data, setData] = useState<number[]>([]);

  useEffect(() => {
    if (!entityId) return;
    let cancelled = false;

    (async () => {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 86_400_000)
        .toISOString();

      const { data: rows, error } = await supabase
        .schema('intel')
        .from('claims')
        .select('created_at')
        .eq('subject_entity_id', entityId)
        .gte('created_at', thirtyDaysAgo);

      if (cancelled || error || !rows) return;

      // Bucket by day offset (0 = 30 days ago, 29 = today)
      const buckets = new Array(30).fill(0);
      const now = Date.now();
      for (const row of rows as Array<{ created_at: string }>) {
        const age = now - new Date(row.created_at).getTime();
        const dayIndex = 29 - Math.min(29, Math.floor(age / 86_400_000));
        buckets[dayIndex]++;
      }
      if (!cancelled) setData(buckets);
    })();

    return () => { cancelled = true; };
  }, [entityId]);

  return data;
}
