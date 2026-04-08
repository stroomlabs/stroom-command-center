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
import { useOfflineSync } from '../lib/OfflineSyncContext';
import { haptics } from '../lib/haptics';

const FOREGROUND_REFRESH_DEBOUNCE_MS = 30_000;
const UNDO_WINDOW_MS = 5_000;

export interface PendingUndo {
  kind: 'approve' | 'reject';
  claim: QueueClaim;
  subject: string;
  // Original position in the claims list before the optimistic remove —
  // used to re-insert on undo.
  originalIndex: number;
  // Reject-only extras passed through to rejectClaim on commit.
  reason?: RejectionReason;
  notes?: string;
}

export function useQueueClaims() {
  const [claims, setClaims] = useState<QueueClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<Set<string>>(new Set());
  const [pendingUndo, setPendingUndo] = useState<PendingUndo | null>(null);
  const pendingRef = useRef<PendingUndo | null>(null);
  const pendingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { enqueueIfOffline } = useOfflineSync();

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
      haptics.impact.rigid();

      try {
        const queued = await enqueueIfOffline({
          type: 'approve',
          claim_id: claimId,
          new_status: 'approved',
        });
        if (!queued) {
          await approveClaim(supabase, claimId);
        }
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
    [refresh, enqueueIfOffline]
  );

  const reject = useCallback(
    async (claimId: string, reason: RejectionReason, notes?: string) => {
      setActing((prev) => new Set(prev).add(claimId));
      setClaims((prev) => prev.filter((c) => c.id !== claimId));
      haptics.impact.soft();

      try {
        const queued = await enqueueIfOffline({
          type: 'reject',
          claim_id: claimId,
          new_status: 'rejected',
          reason,
          notes,
        });
        if (!queued) {
          await rejectClaim(supabase, claimId, reason, notes);
        }
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
    [refresh, enqueueIfOffline]
  );

  // ── Undo-toast deferred mutation flow ──
  //
  // Swipe approve/reject optimistically removes the claim from the list and
  // schedules the real mutation 5s later. Tapping Undo cancels the timer and
  // re-inserts the claim at its original index. Starting a new deferred
  // action while one is still pending flushes the previous one immediately.

  const commitPending = useCallback(
    async (entry: PendingUndo) => {
      try {
        const queued = await enqueueIfOffline(
          entry.kind === 'approve'
            ? {
                type: 'approve',
                claim_id: entry.claim.id,
                new_status: 'approved',
              }
            : {
                type: 'reject',
                claim_id: entry.claim.id,
                new_status: 'rejected',
                reason: entry.reason,
                notes: entry.notes,
              }
        );
        if (queued) return;

        if (entry.kind === 'approve') {
          await approveClaim(supabase, entry.claim.id);
        } else {
          await rejectClaim(
            supabase,
            entry.claim.id,
            entry.reason ?? ('Incorrect' as RejectionReason),
            entry.notes
          );
        }
      } catch (e: any) {
        // Rollback: pull a fresh list from the server so the UI is honest
        // about what happened.
        refresh();
        setError(e.message);
      } finally {
        setActing((prev) => {
          const next = new Set(prev);
          next.delete(entry.claim.id);
          return next;
        });
      }
    },
    [refresh, enqueueIfOffline]
  );

  const clearPendingTimer = useCallback(() => {
    if (pendingTimerRef.current) {
      clearTimeout(pendingTimerRef.current);
      pendingTimerRef.current = null;
    }
  }, []);

  const flushPending = useCallback(() => {
    const entry = pendingRef.current;
    if (!entry) return;
    clearPendingTimer();
    pendingRef.current = null;
    setPendingUndo(null);
    void commitPending(entry);
  }, [clearPendingTimer, commitPending]);

  const schedulePending = useCallback(
    (entry: PendingUndo) => {
      // Flush any previous pending first so we only ever have one undo
      // toast on screen at a time.
      flushPending();

      pendingRef.current = entry;
      setPendingUndo(entry);
      setActing((prev) => new Set(prev).add(entry.claim.id));
      setClaims((prev) => prev.filter((c) => c.id !== entry.claim.id));

      pendingTimerRef.current = setTimeout(() => {
        if (pendingRef.current?.claim.id === entry.claim.id) {
          pendingRef.current = null;
          setPendingUndo(null);
          void commitPending(entry);
        }
      }, UNDO_WINDOW_MS);
    },
    [flushPending, commitPending]
  );

  const deferApprove = useCallback(
    (claimId: string) => {
      const snapshot = claims;
      const idx = snapshot.findIndex((c) => c.id === claimId);
      if (idx < 0) return;
      const claim = snapshot[idx];
      const subject = claim.subject_entity?.canonical_name ?? 'Claim';
      haptics.impact.rigid();
      schedulePending({
        kind: 'approve',
        claim,
        subject,
        originalIndex: idx,
      });
    },
    [claims, schedulePending]
  );

  const deferReject = useCallback(
    (claimId: string, reason: RejectionReason, notes?: string) => {
      const snapshot = claims;
      const idx = snapshot.findIndex((c) => c.id === claimId);
      if (idx < 0) return;
      const claim = snapshot[idx];
      const subject = claim.subject_entity?.canonical_name ?? 'Claim';
      haptics.impact.soft();
      schedulePending({
        kind: 'reject',
        claim,
        subject,
        originalIndex: idx,
        reason,
        notes,
      });
    },
    [claims, schedulePending]
  );

  const undoPending = useCallback(() => {
    const entry = pendingRef.current;
    if (!entry) return;
    clearPendingTimer();
    pendingRef.current = null;
    setPendingUndo(null);
    setActing((prev) => {
      const next = new Set(prev);
      next.delete(entry.claim.id);
      return next;
    });
    setClaims((prev) => {
      const target = Math.min(entry.originalIndex, prev.length);
      const next = prev.slice();
      next.splice(target, 0, entry.claim);
      return next;
    });
    haptics.tap.light();
  }, [clearPendingTimer]);

  // Make sure any pending mutation fires if the screen unmounts — we
  // don't want to lose the operator's intent just because they left the
  // tab mid-timer.
  useEffect(() => {
    return () => {
      const entry = pendingRef.current;
      if (entry) {
        clearPendingTimer();
        pendingRef.current = null;
        void commitPending(entry);
      }
    };
  }, [clearPendingTimer, commitPending]);

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
      haptics.impact.rigid();

      try {
        // If offline, enqueue each approve individually so the drain flow
        // can retry them one at a time. Otherwise hit the batch endpoint.
        const firstQueued = await enqueueIfOffline({
          type: 'approve',
          claim_id: claimIds[0],
          new_status: 'approved',
        });
        if (firstQueued) {
          for (const id of claimIds.slice(1)) {
            await enqueueIfOffline({
              type: 'approve',
              claim_id: id,
              new_status: 'approved',
            });
          }
        } else {
          await batchApproveClaims(supabase, claimIds);
        }
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
    [refresh, enqueueIfOffline]
  );

  return {
    claims,
    loading,
    error,
    refresh,
    approve,
    reject,
    batchApprove,
    acting,
    deferApprove,
    deferReject,
    pendingUndo,
    undoPending,
    flushPending,
  };
}
