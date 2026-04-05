import { useEffect, useState, useCallback } from 'react';
import type { PulseData } from '@stroom/types';
import supabase from '../lib/supabase';

interface ExtendedPulse extends PulseData {
  claimsToday: number;
  latestClaimAt: string | null;
  statusBreakdown: Record<string, number>;
}

export function usePulseData() {
  const [data, setData] = useState<ExtendedPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data: result, error: rpcError } = await supabase.rpc('get_command_pulse');

      if (rpcError) throw rpcError;

      const pulse = result as any;
      setData({
        totalClaims: pulse.total_claims ?? 0,
        totalEntities: pulse.total_entities ?? 0,
        totalSources: pulse.total_sources ?? 0,
        queueDepth: pulse.queue_depth ?? 0,
        correctionRate: pulse.correction_rate ?? 0,
        researchActive: pulse.research_active ?? 0,
        budgetSpendUsd: pulse.budget_spend_usd ?? 0,
        claimsToday: pulse.claims_today ?? 0,
        latestClaimAt: pulse.latest_claim_at ?? null,
        statusBreakdown: pulse.status_breakdown ?? {},
      });
      setLastUpdatedAt(new Date());
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load pulse data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    // Re-fetch on any claim change via Realtime
    const channel = supabase
      .channel('topic:claims')
      .on('broadcast', { event: 'changes' }, () => refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { data, loading, error, refresh, lastUpdatedAt };
}
