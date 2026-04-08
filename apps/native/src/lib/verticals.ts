import { useEffect, useState, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Vertical bucket mapping. The operator's Pulse toggle has 5 buckets, each
// mapping to a tuple of raw domain strings that the intel.get_command_pulse
// RPC accepts as a text[]. `null` = no filter (all verticals).
//
// Source of truth for both the Pulse toggle and the Verticals tab card
// grouping. Touching this file changes both surfaces simultaneously — do
// not duplicate the mapping anywhere.

export type VerticalKey =
  | 'all'
  | 'racing'
  | 'intelligence'
  | 'vacations'
  | 'parks';

export interface VerticalBucket {
  key: VerticalKey;
  label: string;
  domains: string[] | null; // null = no filter, sent as NULL to RPC
  // Ionicons glyph for card + toggle chip
  icon: 'grid-outline' | 'flag-outline' | 'library-outline' | 'boat-outline' | 'sparkles-outline';
}

export const VERTICAL_BUCKETS: Record<VerticalKey, VerticalBucket> = {
  all: {
    key: 'all',
    label: 'All',
    domains: null,
    icon: 'grid-outline',
  },
  racing: {
    key: 'racing',
    label: 'Racing',
    domains: ['motorsports'],
    icon: 'flag-outline',
  },
  intelligence: {
    key: 'intelligence',
    label: 'Intelligence',
    domains: [
      'general',
      'nfl',
      'ncaa',
      'nba',
      'mlb',
      'nhl',
      'soccer',
      'stadiums',
      'culture',
    ],
    icon: 'library-outline',
  },
  vacations: {
    key: 'vacations',
    label: 'Vacations',
    domains: ['cruise'],
    icon: 'boat-outline',
  },
  parks: {
    key: 'parks',
    label: 'Parks',
    domains: ['theme_parks', 'activities'],
    icon: 'sparkles-outline',
  },
};

// Ordered list for rendering (toggle pills, grouped cards). `all` first,
// then the four grouped verticals in the order the user specified.
export const VERTICAL_ORDER: VerticalKey[] = [
  'all',
  'racing',
  'intelligence',
  'vacations',
  'parks',
];

// Given a raw domain string (from get_vertical_summary), return the bucket
// it belongs to. Returns null if the domain doesn't match any bucket — the
// Verticals tab ignores unmapped domains.
export function bucketForDomain(domain: string): VerticalKey | null {
  for (const bucket of Object.values(VERTICAL_BUCKETS)) {
    if (bucket.domains && bucket.domains.includes(domain)) {
      return bucket.key;
    }
  }
  return null;
}

// AsyncStorage persistence for the Pulse toggle selection.
const STORAGE_KEY = 'pulse.vertical.selection';

// Module-level cache + subscriber set so every hook consumer sees the
// current selection without hitting AsyncStorage, and setVerticalSelection
// broadcasts to all mounted listeners in the same tick.
let cached: VerticalKey = 'all';
let hydrated = false;
const listeners = new Set<(v: VerticalKey) => void>();

async function hydrate(): Promise<void> {
  if (hydrated) return;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw && raw in VERTICAL_BUCKETS) {
      cached = raw as VerticalKey;
    }
  } catch {
    // fall through — default 'all'
  } finally {
    hydrated = true;
    for (const fn of listeners) fn(cached);
  }
}

export async function setVerticalSelection(key: VerticalKey): Promise<void> {
  cached = key;
  hydrated = true;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, key);
  } catch {
    // Ignore — in-memory value still reflects the user's choice.
  }
  for (const fn of listeners) fn(key);
}

export function getVerticalSelection(): VerticalKey {
  return cached;
}

// React hook for components that want to react to changes. Fires an
// initial hydration read on mount; subsequent changes come via the
// subscriber set.
export function useVerticalSelection(): [
  VerticalKey,
  (key: VerticalKey) => Promise<void>
] {
  const [value, setValue] = useState<VerticalKey>(cached);

  useEffect(() => {
    let cancelled = false;
    if (!hydrated) {
      void hydrate().then(() => {
        if (!cancelled) setValue(cached);
      });
    } else {
      setValue(cached);
    }
    const listener = (next: VerticalKey) => {
      if (!cancelled) setValue(next);
    };
    listeners.add(listener);
    return () => {
      cancelled = true;
      listeners.delete(listener);
    };
  }, []);

  const update = useCallback(async (key: VerticalKey) => {
    await setVerticalSelection(key);
  }, []);

  return [value, update];
}
