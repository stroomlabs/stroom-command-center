import { useEffect, useRef, useState } from 'react';
import { fetchEntityNameMap, type EntityNameEntry } from '@stroom/supabase';
import supabase from '../lib/supabase';

export interface EntityLookup {
  // Lowercased name → id, sorted keys by length desc for longest-match
  map: Map<string, string>;
  sortedNames: string[];
}

// Fetches up to 1000 entities (most recently updated) and returns a
// longest-first lookup used by the Command chat to render inline entity
// links in assistant messages.
export function useEntityNameMap() {
  const [lookup, setLookup] = useState<EntityLookup | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) return;
    loaded.current = true;
    (async () => {
      try {
        const rows = await fetchEntityNameMap(supabase, 1000);
        const seen = new Map<string, string>();
        for (const r of rows) {
          const key = r.name.toLowerCase();
          if (!seen.has(key)) seen.set(key, r.id);
        }
        const sortedNames = Array.from(seen.keys()).sort(
          (a, b) => b.length - a.length
        );
        setLookup({ map: seen, sortedNames });
      } catch {
        // Silent — entity links are an enhancement, not required
        setLookup({ map: new Map(), sortedNames: [] });
      }
    })();
  }, []);

  return lookup;
}

export type { EntityNameEntry };
