import { useEffect, useState } from 'react';
import supabase from '../lib/supabase';

export interface GovernanceDecision {
  claim_id: string;
  decision_status: string;
  decision_metadata: Record<string, unknown> | null;
  created_at: string | null;
}

// On-demand lookup of the governance_decision row for a single claim. Only
// fetched when the "Why?" sheet opens, so the queue list itself doesn't
// carry per-row metadata overhead.
//
// The schema today is minimal — decision_metadata may be null, empty, or
// contain an arbitrary shape. The sheet tolerates all three.
export function useGovernanceDecisionForClaim(
  claimId: string | null | undefined
): {
  decision: GovernanceDecision | null;
  loading: boolean;
  error: string | null;
} {
  const [decision, setDecision] = useState<GovernanceDecision | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!claimId) {
      setDecision(null);
      setLoading(false);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const { data, error: queryError } = await supabase
          .schema('intel')
          .from('governance_decisions')
          .select('claim_id, decision_status, decision_metadata, created_at')
          .eq('claim_id', claimId)
          .maybeSingle();
        if (queryError) throw queryError;
        if (!cancelled) {
          setDecision((data as GovernanceDecision | null) ?? null);
        }
      } catch (e: any) {
        if (!cancelled) {
          setError(e?.message ?? 'Failed to load governance decision');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [claimId]);

  return { decision, loading, error };
}
