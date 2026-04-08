import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from '../lib/supabase';

const STORAGE_KEY = 'stroom.pulse.last_visit_ts';
const MIN_GAP_MS = 5 * 60_000;

export interface PulseDeltas {
  claims_ingested: number;
  new_entities: number;
  claims_auto_approved: number;
}

// Delta awareness for the Pulse screen. On mount, reads the persisted
// "last visit" timestamp, and if it's older than 5 minutes, calls
// intel.get_overnight_summary() with that timestamp as the cutoff so we
// can show "since last visit" deltas. After displaying, updates the
// stored timestamp so the next visit gets a fresh window. First launch
// (no stored timestamp) silently no-ops.
export function usePulseDeltas() {
  const [deltas, setDeltas] = useState<PulseDeltas | null>(null);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const now = Date.now();
      // Always re-stamp the timestamp so subsequent tab visits see a
      // fresh window. We do this before the RPC so a failing RPC doesn't
      // block the update.
      await AsyncStorage.setItem(STORAGE_KEY, String(now));

      if (!raw) return;
      const prev = Number(raw);
      if (!Number.isFinite(prev)) return;
      if (now - prev < MIN_GAP_MS) return;

      const sinceIso = new Date(prev).toISOString();
      const { data, error } = await supabase.schema('intel').rpc('get_overnight_summary', {
        since_ts: sinceIso,
      });
      if (error) throw error;
      const payload: any = Array.isArray(data) ? data[0] : data;
      if (!payload) return;
      setDeltas({
        claims_ingested: Number(payload.claims_ingested ?? 0),
        new_entities: Number(payload.new_entities ?? 0),
        claims_auto_approved: Number(payload.claims_auto_approved ?? 0),
      });
    } catch {
      // Delta display is best-effort; swallow errors silently.
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return { deltas };
}
