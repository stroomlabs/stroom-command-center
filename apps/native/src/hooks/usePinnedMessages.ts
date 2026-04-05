import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface PinnedMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  pinned_at: string;
  session_id: string | null;
}

const STORAGE_KEY = 'stroom.command_pinned';
const MAX_PINNED = 10;

// Device-local pinned chat messages. Persisted to AsyncStorage and loaded
// on every Command session so the messages can be injected as system
// context — effectively making them sticky knowledge Claude sees on every
// turn across sessions.
export function usePinnedMessages() {
  const [pinned, setPinned] = useState<PinnedMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setPinned(
            (parsed as PinnedMessage[])
              .filter((m) => m && m.id && m.content)
              .slice(0, MAX_PINNED)
          );
          return;
        }
      }
      setPinned([]);
    } catch {
      setPinned([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const pin = useCallback(async (msg: PinnedMessage) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const current: PinnedMessage[] =
        raw && Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      // Dedup by message id, keep newest at the front.
      const deduped = current.filter((m) => m.id !== msg.id);
      const next = [msg, ...deduped].slice(0, MAX_PINNED);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setPinned(next);
    } catch {
      // best-effort
    }
  }, []);

  const unpin = useCallback(async (id: string) => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const current: PinnedMessage[] =
        raw && Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      const next = current.filter((m) => m.id !== id);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setPinned(next);
    } catch {
      // best-effort
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setPinned([]);
    } catch {}
  }, []);

  return { pinned, loading, pin, unpin, clear, refresh: load };
}

// Build a Markdown system message from the pinned list. Returns null when
// nothing is pinned so callers can skip injection cleanly.
export function buildPinnedContextMessage(
  pinned: PinnedMessage[]
): string | null {
  if (pinned.length === 0) return null;
  const lines = [
    '# Pinned context',
    '',
    'The operator has pinned the following messages. Treat them as durable',
    'context that applies to every turn in this conversation.',
    '',
  ];
  for (const m of pinned) {
    lines.push(`- (${m.role}) ${m.content.trim()}`);
  }
  return lines.join('\n');
}
