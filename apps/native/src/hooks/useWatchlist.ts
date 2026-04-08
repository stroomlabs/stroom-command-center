import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'stroom.watchlist';
const MAX = 10;

export interface WatchedEntity {
  id: string;
  canonical_name: string;
  domain: string | null;
}

// Caches the parsed list in module scope so multiple hooks in the same
// render tree (entity detail + Pulse) share one source of truth without
// prop drilling. Each call to add/remove writes through to AsyncStorage
// and updates the in-memory snapshot so all consumers re-render.
let cached: WatchedEntity[] | null = null;
let listeners: Array<(list: WatchedEntity[]) => void> = [];

function notify(next: WatchedEntity[]) {
  cached = next;
  for (const fn of listeners) fn(next);
}

async function load(): Promise<WatchedEntity[]> {
  if (cached) return cached;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    cached = raw ? (JSON.parse(raw) as WatchedEntity[]) : [];
  } catch {
    cached = [];
  }
  return cached;
}

async function persist(list: WatchedEntity[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export function useWatchlist() {
  const [list, setList] = useState<WatchedEntity[]>(cached ?? []);

  useEffect(() => {
    let active = true;
    load().then((l) => active && setList(l));
    listeners.push(setList);
    return () => {
      active = false;
      listeners = listeners.filter((fn) => fn !== setList);
    };
  }, []);

  const isWatched = useCallback(
    (entityId: string) => list.some((e) => e.id === entityId),
    [list]
  );

  const toggle = useCallback(
    async (entity: WatchedEntity) => {
      const prev = await load();
      const exists = prev.some((e) => e.id === entity.id);
      let next: WatchedEntity[];
      if (exists) {
        next = prev.filter((e) => e.id !== entity.id);
      } else {
        next = [entity, ...prev].slice(0, MAX);
      }
      await persist(next);
      notify(next);
    },
    []
  );

  return { list, isWatched, toggle };
}
