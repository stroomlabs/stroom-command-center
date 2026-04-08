import { useCallback, useEffect, useState } from 'react';
import type { CommandSession } from '@stroom/types';
import supabase from '../lib/supabase';

export function useSessionHistory() {
  const [sessions, setSessions] = useState<CommandSession[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error: err } = await supabase
        .schema('intel')
        .from('command_sessions')
        .select('*')
        .order('updated_at', { ascending: false })
        .limit(20);
      if (err) throw err;
      setSessions((data as CommandSession[]) ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load session history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { sessions, loading, error, refresh };
}
