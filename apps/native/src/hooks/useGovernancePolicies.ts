import { useCallback, useEffect, useState } from 'react';
import {
  fetchGovernancePolicies,
  updateGovernancePolicy,
  createGovernancePolicy,
  runAutoGovernance,
} from '@stroom/supabase';
import type {
  GovernancePolicy,
  AutoGovernanceSweepResult,
} from '@stroom/types';
import supabase from '../lib/supabase';

export function useGovernancePolicies() {
  const [policies, setPolicies] = useState<GovernancePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sweeping, setSweeping] = useState(false);
  const [lastSweep, setLastSweep] = useState<AutoGovernanceSweepResult | null>(null);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchGovernancePolicies(supabase);
      setPolicies(data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load policies');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Optimistic patch — update local state immediately, then persist.
  const patchPolicy = useCallback(
    async (id: string, patch: Partial<GovernancePolicy>) => {
      setPolicies((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p))
      );
      try {
        await updateGovernancePolicy(supabase, id, patch);
      } catch (e: any) {
        setError(e.message ?? 'Failed to save policy');
        refresh();
      }
    },
    [refresh]
  );

  const addPolicy = useCallback(
    async (policy: Omit<GovernancePolicy, 'id'>) => {
      try {
        const created = await createGovernancePolicy(supabase, policy);
        setPolicies((prev) => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        return created;
      } catch (e: any) {
        setError(e.message ?? 'Failed to create policy');
        throw e;
      }
    },
    []
  );

  const sweep = useCallback(async () => {
    setSweeping(true);
    try {
      const result = await runAutoGovernance(supabase);
      setLastSweep(result);
      return result;
    } catch (e: any) {
      setError(e.message ?? 'Sweep failed');
      throw e;
    } finally {
      setSweeping(false);
    }
  }, []);

  return {
    policies,
    loading,
    error,
    refresh,
    patchPolicy,
    addPolicy,
    sweep,
    sweeping,
    lastSweep,
  };
}
