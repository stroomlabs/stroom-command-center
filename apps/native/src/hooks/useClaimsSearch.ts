import { useCallback, useEffect, useState } from 'react';
import type { ClaimStatus } from '@stroom/types';
import supabase from '../lib/supabase';

export interface ClaimSearchResult {
  id: string;
  predicate: string | null;
  value_jsonb: Record<string, unknown> | null;
  status: ClaimStatus;
  created_at: string;
  subject_entity_id: string | null;
  subject_entity: { canonical_name: string | null } | null;
}

// Graph-wide claim search. Queries intel.claims on predicate ILIKE OR
// stringified value_jsonb ILIKE, joins the subject entity for display.
// 300ms debounce mirrors useExploreSearch so the Explore tab's segment
// switcher behaves identically across targets.
export function useClaimsSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<ClaimSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setResults([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    const trimmed = query.trim();
    setLoading(true);

    const handle = setTimeout(async () => {
      try {
        let builder = supabase
          .from('claims')
          .select(
            `
            id,
            predicate,
            value_jsonb,
            status,
            created_at,
            subject_entity_id,
            subject_entity:entities!claims_subject_entity_id_fkey(canonical_name)
          `
          )
          .order('created_at', { ascending: false })
          .limit(30);

        if (trimmed.length > 0) {
          // Match either the predicate text or anything inside value_jsonb
          // (Postgres `::text` cast through PostgREST's ilike filter).
          const pattern = `%${trimmed}%`;
          builder = builder.or(
            `predicate.ilike.${pattern},value_jsonb::text.ilike.${pattern}`
          );
        }

        const { data, error: err } = await builder;
        if (cancelled) return;
        if (err) throw err;
        setResults((data as unknown as ClaimSearchResult[]) ?? []);
        setError(null);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Claim search failed');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, trimmed ? 300 : 0);

    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [query, enabled, version]);

  const refresh = useCallback(async () => {
    setVersion((v) => v + 1);
  }, []);

  return { results, loading, error, refresh };
}
