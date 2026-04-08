import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import type { PulseData } from '@stroom/types';
import supabase from '../lib/supabase';
import { writeWidgetPayload } from '../lib/widgetSync';

// Minimum gap between foreground-triggered silent refreshes. Prevents rapid
// foreground/background cycles from hammering get_command_pulse.
const FOREGROUND_REFRESH_DEBOUNCE_MS = 30_000;

interface ExtendedPulse extends PulseData {
  claimsToday: number;
  latestClaimAt: string | null;
  statusBreakdown: Record<string, number>;
}

export function usePulseData(domains: string[] | null = null) {
  const [data, setData] = useState<ExtendedPulse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  // Stable reference to the current domains array so the refresh closure
  // always uses the latest filter without re-creating the callback on
  // every render.
  const domainsRef = useRef<string[] | null>(domains);
  useEffect(() => {
    domainsRef.current = domains;
  }, [domains]);

  const refresh = useCallback(async () => {
    try {
      // Pass the current vertical domains filter to the RPC. NULL = no
      // filter (all verticals); get_command_pulse(domains text[]) is
      // defined server-side with NULL-tolerant filtering.
      const { data: result, error: rpcError } = await supabase
        .schema('intel')
        .rpc('get_command_pulse', { domains: domainsRef.current });

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
      // Mirror to widget storage so the iOS WidgetKit extension can read
      // the latest snapshot on its 15-minute refresh timeline.
      writeWidgetPayload({
        queueDepth: pulse.queue_depth ?? 0,
        claimsToday: pulse.claims_today ?? 0,
      });
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load pulse data');
    } finally {
      setLoading(false);
    }
  }, []);

  // Track the last successful refresh timestamp so the AppState listener
  // can debounce foreground-triggered refetches. A ref (not state) avoids
  // re-subscribing the listener on every tick.
  const lastRefreshAtRef = useRef<number>(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  const silentRefresh = useCallback(async () => {
    const now = Date.now();
    if (now - lastRefreshAtRef.current < FOREGROUND_REFRESH_DEBOUNCE_MS) {
      return;
    }
    lastRefreshAtRef.current = now;
    await refresh();
  }, [refresh]);

  // Refetch whenever the domains filter changes — the dependency is a
  // JSON-serialized key so reference equality of the array doesn't cause
  // missed updates when the caller passes a fresh array each render.
  const domainsKey = domains ? domains.join(',') : '';

  useEffect(() => {
    refresh();
    lastRefreshAtRef.current = Date.now();
  }, [domainsKey, refresh]);

  useEffect(() => {
    // Legacy single-fire mount + subscription setup that only needs to
    // run once, independent of domainsKey churn.

    // Re-fetch on any claim change via Realtime
    const channel = supabase
      .channel('topic:claims')
      .on('broadcast', { event: 'changes' }, () => refresh())
      .subscribe();

    // Widget timeline refresh — every 15 minutes, independent of realtime
    // so the home-screen widget data stays fresh even if no broadcasts fire.
    const widgetInterval = setInterval(() => refresh(), 15 * 60 * 1000);

    // AppState listener: silently refetch when the app returns to the
    // foreground, subject to the 30s debounce so rapid background/foreground
    // cycles don't spam the server. No loading indicator — the existing
    // data stays on screen until the new snapshot arrives.
    const appSub = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        const prev = appStateRef.current;
        appStateRef.current = next;
        if (prev.match(/inactive|background/) && next === 'active') {
          void silentRefresh();
        }
      }
    );

    return () => {
      supabase.removeChannel(channel);
      clearInterval(widgetInterval);
      appSub.remove();
    };
  }, [refresh, silentRefresh]);

  return { data, loading, error, refresh, lastUpdatedAt };
}
