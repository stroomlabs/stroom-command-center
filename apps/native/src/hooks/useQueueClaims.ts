import { useEffect, useRef, useState, useCallback } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import {
  fetchQueueClaims,
  approveClaim,
  rejectClaim,
  subscribeToClaimChanges,
  batchApproveClaims,
} from '@stroom/supabase';
import type { QueueClaim } from '@stroom/supabase';
import type { RejectionReason } from '@stroom/types';
import supabase from '../lib/supabase';
import * as Haptics from 'expo-haptics';

const FOREGROUND_REFRESH_DEBOUNCE_MS = 30_000;

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

  const lastRefreshAtRef = useRef<number>(0);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);

  useEffect(() => {
    refresh();
    lastRefreshAtRef.current = Date.now();

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

    // Silent refetch when the app returns to the foreground. Debounced to
    // 30s so rapid background/foreground cycles don't hammer the server.
    const appSub = AppState.addEventListener(
      'change',
      (next: AppStateStatus) => {
        const prev = appStateRef.current;
        appStateRef.current = next;
        if (prev.match(/inactive|background/) && next === 'active') {
          const now = Date.now();
          if (now - lastRefreshAtRef.current >= FOREGROUND_REFRESH_DEBOUNCE_MS) {
            lastRefreshAtRef.current = now;
            void refresh();
          }
        }
      }
    );

    return () => {
      supabase.removeChannel(channel);
      appSub.remove();
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

  const batchApprove = useCallback(
    async (claimIds: string[]) => {
      if (claimIds.length === 0) return;
      const idSet = new Set(claimIds);
      // Optimistic remove
      setActing((prev) => {
        const next = new Set(prev);
        claimIds.forEach((id) => next.add(id));
        return next;
      });
      setClaims((prev) => prev.filter((c) => !idSet.has(c.id)));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      try {
        await batchApproveClaims(supabase, claimIds);
      } catch (e: any) {
        refresh();
        setError(e.message);
      } finally {
        setActing((prev) => {
          const next = new Set(prev);
          claimIds.forEach((id) => next.delete(id));
          return next;
        });
      }
    },
    [refresh]
  );

  return { claims, loading, error, refresh, approve, reject, batchApprove, acting };
}
