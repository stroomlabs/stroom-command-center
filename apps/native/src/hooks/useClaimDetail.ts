import { useEffect, useState, useCallback } from 'react';
import {
  fetchClaimDetail,
  type ClaimDetail,
  type ClaimCorroborationDetail,
} from '@stroom/supabase';
import supabase from '../lib/supabase';

export function useClaimDetail(id: string | undefined) {
  const [claim, setClaim] = useState<ClaimDetail | null>(null);
  const [corroborations, setCorroborations] = useState<ClaimCorroborationDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const result = await fetchClaimDetail(supabase, id);
      if (result) {
        setClaim(result.claim);
        setCorroborations(result.corroborations);
      }
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load claim');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return { claim, corroborations, loading, error, refresh: load };
}
