import { useCallback, useEffect, useState } from 'react';
import type { ResearchQueueItem } from '@stroom/types';
import supabase from '../lib/supabase';

export function useResearchQueue(limit = 50) {
  const [items, setItems] = useState<ResearchQueueItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .from('research_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (err) throw err;
      setItems((data as ResearchQueueItem[]) ?? []);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load research queue');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel('topic:research')
      .on('broadcast', { event: 'changes' }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { items, loading, error, refresh };
}
