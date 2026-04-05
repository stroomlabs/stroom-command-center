import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';

export type GovernanceSweepFrequency = 'off' | '15min' | 'hourly' | 'daily';

export interface NotificationPrefs {
  notifyOnNewClaims: boolean;
  notifyOnResearchComplete: boolean;
  notifyOnSourceHealth: boolean;
  governanceSweepFrequency: GovernanceSweepFrequency;
}

const DEFAULTS: NotificationPrefs = {
  notifyOnNewClaims: true,
  notifyOnResearchComplete: true,
  notifyOnSourceHealth: false,
  governanceSweepFrequency: 'off',
};

// Reads/writes `intel.operator_profiles.preferences` JSONB for the current user.
export function useNotificationPrefs() {
  const [prefs, setPrefs] = useState<NotificationPrefs>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error('Not signed in');

      const { data, error: err } = await supabase
        .from('operator_profiles')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle();

      if (err) throw err;

      const stored = (data?.preferences ?? {}) as Partial<NotificationPrefs>;
      setPrefs({ ...DEFAULTS, ...stored });
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load preferences');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const update = useCallback(
    async (patch: Partial<NotificationPrefs>) => {
      // Optimistic update
      setPrefs((prev) => ({ ...prev, ...patch }));
      setSaving(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) throw new Error('Not signed in');

        // Read current row to merge preferences, then upsert with merged JSONB
        const { data: existing } = await supabase
          .from('operator_profiles')
          .select('preferences')
          .eq('user_id', user.id)
          .maybeSingle();

        const merged = {
          ...DEFAULTS,
          ...((existing?.preferences ?? {}) as Partial<NotificationPrefs>),
          ...patch,
        };

        const { error: err } = await supabase
          .from('operator_profiles')
          .upsert(
            { user_id: user.id, preferences: merged },
            { onConflict: 'user_id' }
          );

        if (err) throw err;
        setError(null);
      } catch (e: any) {
        setError(e.message ?? 'Failed to save');
        // Re-read to revert on failure
        load();
      } finally {
        setSaving(false);
      }
    },
    [load]
  );

  return { prefs, loading, saving, error, update, refresh: load };
}
