import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';

export interface GraphHealth {
  stale_sources: number;
  orphaned_entities: number;
  uncorroborated_claims: number;
  single_source_claims: number;
  low_confidence_claims: number;
  avg_trust_score: number;
  sources_failing: number;
}

export function useGraphHealth() {
  const [health, setHealth] = useState<GraphHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data, error: rpcError } = await supabase.rpc('get_graph_health');
      if (rpcError) throw rpcError;
      // Supabase RPCs that return a single row come back as the object directly,
      // but a few configurations return a one-element array — handle both.
      const normalized = Array.isArray(data) ? data[0] : data;
      setHealth(normalized as GraphHealth);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load graph health');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { health, loading, error, refresh };
}
