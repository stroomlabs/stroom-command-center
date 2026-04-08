import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';

export interface GovernanceStats {
  approvedToday: number;
  rejectedToday: number;
  streak: number; // consecutive days ending today with any operator governance activity
}

// Pulls the last 90 days of operator audit rows and computes:
//   - approvedToday / rejectedToday: count in the current local day
//   - streak: consecutive local calendar days (ending today) with ≥1 operator
//             action (approve/reject). If there was no activity today, streak
//             is the length ending yesterday — but only if yesterday has
//             activity (otherwise 0).
export function useGovernanceStats() {
  const [stats, setStats] = useState<GovernanceStats>({
    approvedToday: 0,
    rejectedToday: 0,
    streak: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);
      const { data, error: err } = await supabase
        .schema('intel')
        .from('audit_log')
        .select('action_type, actor, created_at')
        .eq('actor', 'operator')
        .in('action_type', ['approve', 'reject'])
        .gte('created_at', cutoff.toISOString())
        .order('created_at', { ascending: false });

      if (err) throw err;

      const rows =
        (data as { action_type: string; created_at: string }[] | null) ?? [];

      const todayKey = dayKey(new Date());
      let approvedToday = 0;
      let rejectedToday = 0;
      const activeDays = new Set<string>();
      for (const row of rows) {
        const key = dayKey(new Date(row.created_at));
        activeDays.add(key);
        if (key === todayKey) {
          if (row.action_type === 'approve') approvedToday++;
          else if (row.action_type === 'reject') rejectedToday++;
        }
      }

      // Walk back from today counting consecutive active days.
      let streak = 0;
      const cursor = new Date();
      // If there's no activity today, start the walk from yesterday so an
      // ongoing streak doesn't reset on a quiet morning.
      if (!activeDays.has(dayKey(cursor))) {
        cursor.setDate(cursor.getDate() - 1);
      }
      while (activeDays.has(dayKey(cursor))) {
        streak++;
        cursor.setDate(cursor.getDate() - 1);
      }

      setStats({ approvedToday, rejectedToday, streak });
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load stats');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { stats, loading, error, refresh };
}

function dayKey(d: Date): string {
  // Local-calendar-day key (YYYY-MM-DD)
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
