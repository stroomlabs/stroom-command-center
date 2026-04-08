import { useEffect, useState, useCallback } from 'react';
import supabase from '../lib/supabase';

// Raw row shape returned by intel.get_vertical_summary(). One row per
// domain string; the Verticals tab groups these into buckets client-side
// via VERTICAL_BUCKETS in lib/verticals.ts.
export interface VerticalSummaryRow {
  domain: string;
  entity_count: number;
  claim_count: number;
  queue_depth: number;
  last_activity_at: string | null;
}

export function useVerticalSummary(): {
  rows: VerticalSummaryRow[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
} {
  const [rows, setRows] = useState<VerticalSummaryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data, error: rpcError } = await supabase
        .schema('intel')
        .rpc('get_vertical_summary');
      if (rpcError) throw rpcError;
      // Normalize the response to an array, since some Postgres RPC
      // implementations return an object wrapper.
      let normalized: VerticalSummaryRow[] = [];
      if (Array.isArray(data)) {
        normalized = data as VerticalSummaryRow[];
      } else if (data && typeof data === 'object') {
        const inner =
          (data as any).rows ??
          (data as any).summary ??
          (data as any).verticals;
        if (Array.isArray(inner)) {
          normalized = inner as VerticalSummaryRow[];
        }
      }
      setRows(
        normalized.map((r) => ({
          domain: r.domain ?? 'unknown',
          entity_count: Number(r.entity_count ?? 0),
          claim_count: Number(r.claim_count ?? 0),
          queue_depth: Number(r.queue_depth ?? 0),
          last_activity_at: r.last_activity_at ?? null,
        }))
      );
      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load vertical summary');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}
