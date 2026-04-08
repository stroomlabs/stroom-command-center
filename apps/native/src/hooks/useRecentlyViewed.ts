import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'stroom.recently_viewed_entities';
const MAX_ENTRIES = 3;
const EXPIRY_MS = 12 * 60 * 60 * 1000; // 12 hours

export interface RecentEntity {
  id: string;
  name: string;
  type: string | null;
}

// Internal persisted shape — public consumers still receive `RecentEntity[]`
// so existing call sites (explore.tsx, entity/[id].tsx) don't need changes.
interface StoredEntry extends RecentEntity {
  viewedAt: number;
}

const isFresh = (entry: StoredEntry): boolean =>
  Date.now() - entry.viewedAt <= EXPIRY_MS;

const parseStored = (raw: string | null): StoredEntry[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Tolerate both the old shape ({ id, name, type }) and the new shape
    // ({ id, name, type, viewedAt }). Old entries are treated as fresh so
    // we don't wipe the list the first time the user opens the new build.
    return parsed
      .filter((r) => r && typeof r.id === 'string' && typeof r.name === 'string')
      .map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type ?? null,
        viewedAt: typeof r.viewedAt === 'number' ? r.viewedAt : Date.now(),
      }));
  } catch {
    return [];
  }
};

// Persists the last N visited entities to AsyncStorage so the Explore tab can
// show a "Recently Viewed" list when the search box is empty. Expired entries
// (older than 12h) are filtered lazily on read; there is no background timer.
export function useRecentlyViewed() {
  const [recent, setRecent] = useState<RecentEntity[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const fresh = parseStored(raw).filter(isFresh).slice(0, MAX_ENTRIES);
      setRecent(fresh.map(({ id, name, type }) => ({ id, name, type })));
    } catch {
      // ignore corrupt entries
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const record = useCallback(async (entity: RecentEntity) => {
    if (!entity.id) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const current = parseStored(raw).filter(isFresh);
      const deduped = current.filter((r) => r.id !== entity.id);
      const next: StoredEntry[] = [
        { ...entity, viewedAt: Date.now() },
        ...deduped,
      ].slice(0, MAX_ENTRIES);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRecent(next.map(({ id, name, type }) => ({ id, name, type })));
    } catch {
      // swallow — recently viewed is best-effort
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      setRecent([]);
    } catch {}
  }, []);

  return { recent, loading, record, clear, refresh: load };
}
