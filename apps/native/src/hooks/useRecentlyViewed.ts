import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'stroom.recently_viewed_entities';
const MAX_ENTRIES = 5;

export interface RecentEntity {
  id: string;
  name: string;
  type: string | null;
}

// Persists the last N visited entities to AsyncStorage so the Explore tab can
// show a "Recently Viewed" list when the search box is empty. Call
// `record(entity)` whenever a user opens an entity detail screen.
export function useRecentlyViewed() {
  const [recent, setRecent] = useState<RecentEntity[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setRecent(parsed.filter((r) => r && r.id && r.name).slice(0, MAX_ENTRIES));
        }
      }
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
      const current: RecentEntity[] =
        raw && Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      const deduped = current.filter((r) => r.id !== entity.id);
      const next = [entity, ...deduped].slice(0, MAX_ENTRIES);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setRecent(next);
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
