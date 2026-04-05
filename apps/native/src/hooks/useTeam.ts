import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';

export interface TeamMember {
  user_id: string;
  email: string | null;
  display_name: string | null;
  last_seen: string | null;
  online: boolean;
  is_me: boolean;
  invite_code: string | null;
}

// Consider an operator "online" if their preferences.last_seen is within
// the last 5 minutes. The auth layer refreshes last_seen on focus/resume.
const ONLINE_WINDOW_MS = 5 * 60_000;

// Stable random 8-char invite code. Lowercase + digits, no look-alikes.
function generateInviteCode(): string {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < 8; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return out;
}

// Lightweight "team" hook — returns every row in intel.operator_profiles so
// the More screen can render a Team card. Also exposes invite-code
// generation and a manual online heartbeat. Email resolution relies on
// preferences.email being kept in sync at sign-in time (auth.users isn't
// directly queryable from the anon client).
export function useTeam() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [myInviteCode, setMyInviteCode] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { data, error: err } = await supabase
        .from('operator_profiles')
        .select('user_id, preferences, updated_at')
        .order('updated_at', { ascending: false });

      if (err) throw err;

      const now = Date.now();
      const mapped: TeamMember[] = (data ?? []).map((row: any) => {
        const prefs = (row.preferences ?? {}) as Record<string, unknown>;
        const lastSeenIso =
          (prefs.last_seen as string | undefined) ?? row.updated_at ?? null;
        const lastSeenMs = lastSeenIso
          ? new Date(lastSeenIso).getTime()
          : 0;
        return {
          user_id: row.user_id,
          email: (prefs.email as string | undefined) ?? null,
          display_name: (prefs.display_name as string | undefined) ?? null,
          last_seen: lastSeenIso,
          online: lastSeenMs > 0 && now - lastSeenMs < ONLINE_WINDOW_MS,
          is_me: user?.id === row.user_id,
          invite_code: (prefs.invite_code as string | undefined) ?? null,
        };
      });

      setMembers(mapped);

      const me = mapped.find((m) => m.is_me);
      setMyInviteCode(me?.invite_code ?? null);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Stamp last_seen on mount so the current user shows as online.
  useEffect(() => {
    (async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        const { data: existing } = await supabase
          .from('operator_profiles')
          .select('preferences')
          .eq('user_id', user.id)
          .maybeSingle();
        const prefs = (existing?.preferences ?? {}) as Record<string, unknown>;
        await supabase
          .from('operator_profiles')
          .upsert(
            {
              user_id: user.id,
              preferences: {
                ...prefs,
                email: user.email ?? prefs.email ?? null,
                last_seen: new Date().toISOString(),
              },
            },
            { onConflict: 'user_id' }
          );
      } catch {
        // heartbeat is best-effort
      }
    })();
  }, []);

  const generateInvite = useCallback(async (): Promise<string> => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) throw new Error('Not signed in');

    const code = generateInviteCode();
    const { data: existing } = await supabase
      .from('operator_profiles')
      .select('preferences')
      .eq('user_id', user.id)
      .maybeSingle();
    const prefs = (existing?.preferences ?? {}) as Record<string, unknown>;

    await supabase
      .from('operator_profiles')
      .upsert(
        {
          user_id: user.id,
          preferences: {
            ...prefs,
            invite_code: code,
            invite_code_created_at: new Date().toISOString(),
          },
        },
        { onConflict: 'user_id' }
      );

    setMyInviteCode(code);
    return code;
  }, []);

  return {
    members,
    loading,
    error,
    refresh: load,
    myInviteCode,
    generateInvite,
  };
}
