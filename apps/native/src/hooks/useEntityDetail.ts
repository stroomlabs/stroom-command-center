import { useEffect, useState, useCallback } from 'react';
import {
  fetchEntityById,
  fetchClaimsForEntity,
  fetchConnectionsForEntity,
  type EntityClaim,
  type EntityConnection,
} from '@stroom/supabase';
import type { Entity } from '@stroom/types';
import supabase from '../lib/supabase';

export function useEntityDetail(id: string | undefined) {
  const [entity, setEntity] = useState<Entity | null>(null);
  const [claims, setClaims] = useState<EntityClaim[]>([]);
  const [connections, setConnections] = useState<EntityConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      const [e, c, conn] = await Promise.all([
        fetchEntityById(supabase, id),
        fetchClaimsForEntity(supabase, id, 100, 0),
        fetchConnectionsForEntity(supabase, id),
      ]);
      setEntity(e);
      setClaims(c);
      setConnections(conn);
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

  return { entity, claims, connections, loading, error, refresh: load };
}
