import { useEffect, useState, useCallback } from 'react';
import {
  fetchEntityById,
  fetchClaimsForEntity,
  type EntityClaim,
} from '@stroom/supabase';
import type { Entity } from '@stroom/types';
import supabase from '../lib/supabase';

export function useEntityDetail(id: string | undefined) {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [claims, setClaims] = useState<EntityClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [e, c] = await Promise.all([
        fetchEntityById(supabase, id),
        fetchClaimsForEntity(supabase, id, 100, 0),
      ]);
      setEntity(e);
      setClaims(c);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load entity');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  return { entity, claims, loading, error, refresh: load };
}
