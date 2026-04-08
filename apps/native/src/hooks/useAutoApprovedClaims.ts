import { useEffect, useState } from 'react';
import supabase from '../lib/supabase';

// Returns the Set of claim ids that have a governance_decision row with
// decision_status = 'auto_approved'. Used by the Queue to decide which
// ClaimCards render the "Why?" chip.
//
// Today this set is tiny (exactly 1 row in production — the Day 2 OTA
// backfills more). We fetch all rows at once because the cardinality is
// low; if the auto-approval pipeline starts writing at scale, swap the
// fetch for a batched `in(claim_id, [...])` lookup driven off the current
// queue page.
export function useAutoApprovedClaims(): {
  ids: Set<string>;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = async () => {
    try {
      const { data, error: queryError } = await supabase
        .schema('intel')
        .from('governance_decisions')
        .select('claim_id')
        .eq('decision_status', 'auto_approved');
      if (queryError) throw queryError;
      const next = new Set<string>();
      for (const row of (data ?? []) as Array<{ claim_id: string | null }>) {
        if (row.claim_id) next.add(row.claim_id);
      }
      setIds(next);
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load governance decisions');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      await refresh();
      if (cancelled) return;
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ids, loading, error, refresh };
}
