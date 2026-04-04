import { useEffect, useState, useCallback } from 'react';
import {
  fetchQueueClaims,
  approveClaim,
  rejectClaim,
  subscribeToClaimChanges,
} from '@stroom/supabase';
import type { QueueClaim } from '@stroom/supabase';
import type { RejectionReason } from '@stroom/types';
import supabase from '../lib/supabase';
import * as Haptics from 'expo-haptics';

export function useQueueClaims() {
  const [claims, setClaims] = useState<QueueClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<Set<string>>(new Set());

  const refresh = useCallback(async () => {
    try {
      const data = await fetchQueueClaims(supabase, 30, 0);
      setClaims(data);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load queue');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();

    const channel = subscribeToClaimChanges(supabase, (payload) => {
      if (
        payload.eventType === 'INSERT' &&
        (payload.new.status === 'draft' || payload.new.status === 'pending_review')
      ) {
        // New claim arrived — prepend to list
        refresh();
      } else if (payload.eventType === 'UPDATE') {
        // Claim status changed (possibly by another operator) — refresh
        refresh();
      }
    });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  const approve = useCallback(
    async (claimId: string) => {
      // Optimistic remove
      setActing((prev) => new Set(prev).add(claimId));
      setClaims((prev) => prev.filter((c) => c.id !== claimId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      try {
        await approveClaim(supabase, claimId);
      } catch (e: any) {
        // Rollback on failure
        refresh();
        setError(e.message);
      } finally {
        setActing((prev) => {
          const next = new Set(prev);
          next.delete(claimId);
          return next;
        });
      }
    },
    [refresh]
  );

  const reject = useCallback(
    async (claimId: string, reason: RejectionReason, notes?: string) => {
      setActing((prev) => new Set(prev).add(claimId));
      setClaims((prev) => prev.filter((c) => c.id !== claimId));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);

      try {
        await rejectClaim(supabase, claimId, reason, notes);
      } catch (e: any) {
        refresh();
        setError(e.message);
      } finally {
        setActing((prev) => {
          const next = new Set(prev);
          next.delete(claimId);
          return next;
        });
      }
    },
    [refresh]
  );

  return { claims, loading, error, refresh, approve, reject, acting };
}
