import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';

// Tracks first-run onboarding state via `operator_profiles.preferences.onboarded`.
// Returns `{ ready, needsOnboarding, complete }`. Once `complete()` is called
// the flag is persisted and future loads skip the welcome flow.
export function useOnboarding(sessionReady: boolean) {
  const [ready, setReady] = useState(false);
  const [needsOnboarding, setNeedsOnboarding] = useState(false);

  useEffect(() => {
    if (!sessionReady) return;
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          setNeedsOnboarding(false);
          setReady(true);
          return;
        }

        const { data, error } = await supabase
          .schema('intel')
          .from('operator_profiles')
          .select('preferences')
          .eq('user_id', user.id)
          .maybeSingle();

        if (error) {
          setNeedsOnboarding(false);
          setReady(true);
          return;
        }

        const prefs = (data?.preferences ?? {}) as { onboarded?: boolean };
        setNeedsOnboarding(!prefs.onboarded);
        setReady(true);
      } catch {
        setNeedsOnboarding(false);
        setReady(true);
      }
    })();
  }, [sessionReady]);

  const complete = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: existing } = await supabase
        .schema('intel')
        .from('operator_profiles')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle();

      const merged = {
        ...((existing?.preferences ?? {}) as Record<string, unknown>),
        onboarded: true,
        onboarded_at: new Date().toISOString(),
      };

      await supabase
        .schema('intel')
        .from('operator_profiles')
        .upsert({ user_id: user.id, preferences: merged }, { onConflict: 'user_id' });
    } catch {
      // Non-fatal — we'll just show onboarding again next launch.
    } finally {
      setNeedsOnboarding(false);
    }
  }, []);

  return { ready, needsOnboarding, complete };
}
