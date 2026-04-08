import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { approveClaim, rejectClaim } from '@stroom/supabase';
import type { RejectionReason } from '@stroom/types';
import supabase from './supabase';
import { useBrandToast } from '../components/BrandToast';

// Offline action queue — persists governance mutations (approve/reject)
// to AsyncStorage when the device is offline and drains them FIFO as soon as
// connectivity returns. The banner on Pulse and the queued-toast both read
// from this shared context.

const STORAGE_KEY = 'pendingActions';

export interface PendingAction {
  type: 'approve' | 'reject';
  claim_id: string;
  new_status: 'approved' | 'rejected';
  timestamp: number;
  reason?: RejectionReason;
  notes?: string;
}

interface OfflineSyncContextValue {
  pendingCount: number;
  isOnline: boolean;
  // Returns true if the action was enqueued (offline), false if it should be
  // executed immediately. Callers that use this MUST still optimistically
  // remove the claim from their UI.
  enqueueIfOffline: (action: Omit<PendingAction, 'timestamp'>) => Promise<boolean>;
  // Force a drain attempt regardless of NetInfo state — useful after a
  // manual refresh.
  syncNow: () => Promise<void>;
}

const OfflineSyncContext = createContext<OfflineSyncContextValue | null>(null);

async function readQueue(): Promise<PendingAction[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as PendingAction[]) : [];
  } catch {
    return [];
  }
}

async function writeQueue(actions: PendingAction[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(actions));
}

export function OfflineSyncProvider({ children }: { children: React.ReactNode }) {
  const [pendingCount, setPendingCount] = useState(0);
  const [isOnline, setIsOnline] = useState(true);
  const drainingRef = useRef(false);
  const toast = useBrandToast();

  // Prime pending count from storage on mount.
  useEffect(() => {
    void readQueue().then((q) => setPendingCount(q.length));
  }, []);

  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    try {
      let queue = await readQueue();
      if (queue.length === 0) return;
      let synced = 0;

      while (queue.length > 0) {
        const action = queue[0];
        try {
          if (action.type === 'approve') {
            await approveClaim(supabase as any, action.claim_id);
          } else {
            await rejectClaim(
              supabase as any,
              action.claim_id,
              action.reason ?? ('Incorrect' as RejectionReason),
              action.notes
            );
          }
          synced += 1;
          // Remove on success
          queue = queue.slice(1);
          await writeQueue(queue);
          setPendingCount(queue.length);
        } catch {
          // Stop on first failure — leave the rest in the queue for the
          // next reconnect. Likely means we went offline again mid-drain.
          break;
        }
      }

      if (synced > 0) {
        toast.show(
          `Synced ${synced} pending action${synced === 1 ? '' : 's'}`,
          'success'
        );
      }
    } finally {
      drainingRef.current = false;
    }
  }, [toast]);

  // NetInfo listener — drain on reconnect.
  useEffect(() => {
    NetInfo.fetch().then((state) => {
      const online = Boolean(state.isConnected && (state.isInternetReachable ?? true));
      setIsOnline(online);
      if (online) void drain();
    });

    const unsub = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && (state.isInternetReachable ?? true));
      setIsOnline((prev) => {
        if (!prev && online) void drain();
        return online;
      });
    });
    return () => unsub();
  }, [drain]);

  const enqueueIfOffline = useCallback(
    async (action: Omit<PendingAction, 'timestamp'>): Promise<boolean> => {
      const net = await NetInfo.fetch();
      const online = Boolean(net.isConnected && (net.isInternetReachable ?? true));
      if (online) return false;

      const entry: PendingAction = { ...action, timestamp: Date.now() };
      const queue = await readQueue();
      queue.push(entry);
      await writeQueue(queue);
      setPendingCount(queue.length);
      toast.show('Queued — will sync when online', 'warn');
      return true;
    },
    [toast]
  );

  const syncNow = useCallback(async () => {
    await drain();
  }, [drain]);

  const value = useMemo(
    () => ({ pendingCount, isOnline, enqueueIfOffline, syncNow }),
    [pendingCount, isOnline, enqueueIfOffline, syncNow]
  );

  return (
    <OfflineSyncContext.Provider value={value}>{children}</OfflineSyncContext.Provider>
  );
}

export function useOfflineSync(): OfflineSyncContextValue {
  const ctx = useContext(OfflineSyncContext);
  if (!ctx) {
    throw new Error('useOfflineSync must be used inside <OfflineSyncProvider>');
  }
  return ctx;
}
