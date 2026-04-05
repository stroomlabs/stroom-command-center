import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';

export interface SourceSearchResult {
  id: string;
  source_name: string;
  source_class: string | null;
  trust_score: number;
  domain: string | null;
  source_url: string | null;
  auto_approve: boolean | null;
  canary_status: string | null;
  claim_count: number;
}

// Graph-wide source search — queries intel.sources on source_name,
// ordered by trust_score desc. Hydrates a claim_count via a cheap
// head-only count per row (capped at 30 rows so it's fine).
export function useSourcesSearch(query: string, enabled: boolean) {
  const [results, setResults] = useState<SourceSearchResult[]>([]);
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
          .from('sources')
          .select(
            'id, source_name, source_class, trust_score, domain, source_url, auto_approve, canary_status'
          )
          .order('trust_score', { ascending: false })
          .limit(30);

        if (trimmed.length > 0) {
          builder = builder.ilike('source_name', `%${trimmed}%`);
        }

        const { data, error: err } = await builder;
        if (cancelled) return;
        if (err) throw err;
        const rows = (data as any[]) ?? [];

        // Hydrate claim counts — one head-only count per row, in parallel.
        const withCounts = await Promise.all(
          rows.map(async (r) => {
            try {
              const { count } = await supabase
                .from('claims')
                .select('id', { count: 'exact', head: true })
                .eq('asserted_source_id', r.id);
              return { ...r, claim_count: count ?? 0 };
            } catch {
              return { ...r, claim_count: 0 };
            }
          })
        );

        if (!cancelled) {
          setResults(withCounts as SourceSearchResult[]);
          setError(null);
        }
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? 'Source search failed');
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
