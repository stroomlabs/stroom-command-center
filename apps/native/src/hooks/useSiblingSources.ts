import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';

export interface SiblingSource {
  id: string;
  source_name: string;
  trust_score: number;
  auto_approve: boolean | null;
  canary_status: string | null;
  claim_count: number;
  domain: string | null;
}

// Fetches publisher-level siblings for a given source via the
// intel.get_sibling_sources RPC. The RPC returns every source that shares
// the same publisher domain (including the current source). Caller is
// responsible for filtering/highlighting the current row.
export function useSiblingSources(sourceId: string | null | undefined) {
  const [siblings, setSiblings] = useState<SiblingSource[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!sourceId) {
      setSiblings([]);
      return;
    }
    setLoading(true);
    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_sibling_sources',
        { source_id: sourceId }
      );
      if (rpcError) throw rpcError;
      const rows = (data as any[]) ?? [];
      setSiblings(
        rows.map((r) => ({
          id: r.id,
          source_name: r.source_name ?? 'Unnamed source',
          trust_score: Number(r.trust_score ?? 0),
          auto_approve: r.auto_approve ?? null,
          canary_status: r.canary_status ?? null,
          claim_count: Number(r.claim_count ?? 0),
          domain: r.domain ?? null,
        }))
      );
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load related sources');
      setSiblings([]);
    } finally {
      setLoading(false);
    }
  }, [sourceId]);

  useEffect(() => {
    load();
  }, [load]);

  return { siblings, loading, error, refresh: load };
}
