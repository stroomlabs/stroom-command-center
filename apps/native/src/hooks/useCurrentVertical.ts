import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// AsyncStorage key for the operator's currently active vertical. Set
// elsewhere by the vertical switcher; read here so ScreenCanvas can tint
// the deepest gradient stop without prop-drilling.
const STORAGE_KEY = 'stroom.pulse_vertical';

export type VerticalKey =
  | 'motorsports'
  | 'cruise'
  | 'theme_parks'
  | 'nfl'
  | 'nba'
  | 'general'
  | string;

// One-shot loader. Returns null until the AsyncStorage read resolves, then
// the vertical key string (or null if unset). Cheap enough to call from
// anywhere — internally caches at the module level so re-mounts don't
// re-hit AsyncStorage.
let cachedValue: string | null | undefined = undefined;
const subscribers = new Set<(v: string | null) => void>();

async function loadOnce(): Promise<string | null> {
  if (cachedValue !== undefined) return cachedValue;
  try {
    const v = await AsyncStorage.getItem(STORAGE_KEY);
    cachedValue = v;
    return v;
  } catch {
    cachedValue = null;
    return null;
  }
}

export function useCurrentVertical(): string | null {
  const [vertical, setVertical] = useState<string | null>(
    cachedValue ?? null
  );

  useEffect(() => {
    let cancelled = false;
    if (cachedValue === undefined) {
      loadOnce().then((v) => {
        if (!cancelled) setVertical(v);
      });
    } else {
      setVertical(cachedValue);
    }
    subscribers.add(setVertical);
    return () => {
      cancelled = true;
      subscribers.delete(setVertical);
    };
  }, []);

  return vertical;
}

// Allow other code to mutate the active vertical and notify all
// subscribed ScreenCanvas instances without a re-render storm.
export async function setCurrentVertical(v: string | null): Promise<void> {
  cachedValue = v;
  if (v == null) {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } else {
    await AsyncStorage.setItem(STORAGE_KEY, v);
  }
  for (const fn of subscribers) fn(v);
}
