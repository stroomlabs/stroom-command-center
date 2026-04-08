import { useEffect, useState } from 'react';
import supabase from '../lib/supabase';
import type { QueueClaim } from '@stroom/supabase';

// For a list of queue claims, finds published/approved claims that share the
// same (subject_entity_id, predicate) pair. Returns a Map keyed by claim id
// containing the existing claim's value_jsonb so the Queue card can show an
// "Updates existing" label and the detail screen can render a diff.
export interface ExistingMatch {
  existingClaimId: string;
  existingValue: Record<string, unknown> | null;
}

export function useExistingClaimMap(claims: QueueClaim[]) {
  const [map, setMap] = useState<Map<string, ExistingMatch>>(new Map());

  useEffect(() => {
    if (claims.length === 0) {
      setMap(new Map());
      return;
    }
    let cancelled = false;

    (async () => {
      // Collect unique (subject_entity_id, predicate) pairs from draft/pending claims.
      const pairs = new Map<string, { entityId: string; predicate: string; draftIds: string[] }>();
      for (const c of claims) {
        if (!c.subject_entity_id || !c.predicate) continue;
        if (c.status !== 'draft' && c.status !== 'pending_review') continue;
        const key = `${c.subject_entity_id}|${c.predicate}`;
        let entry = pairs.get(key);
        if (!entry) {
          entry = { entityId: c.subject_entity_id, predicate: c.predicate, draftIds: [] };
          pairs.set(key, entry);
        }
        entry.draftIds.push(c.id);
      }
      if (pairs.size === 0) return;

      // Query existing published/approved claims for those pairs. We batch
      // by entity id and post-filter by predicate client-side to avoid
      // building a complex OR query per pair.
      const entityIds = Array.from(new Set(Array.from(pairs.values()).map((p) => p.entityId)));
      const predicates = Array.from(new Set(Array.from(pairs.values()).map((p) => p.predicate)));

      const { data, error } = await supabase
        .schema('intel')
        .from('claims')
        .select('id, subject_entity_id, predicate, value_jsonb')
        .in('subject_entity_id', entityIds)
        .in('predicate', predicates)
        .in('status', ['published', 'approved'])
        .order('created_at', { ascending: false })
        .limit(200);

      if (error || !data || cancelled) return;

      const next = new Map<string, ExistingMatch>();
      for (const existing of data as Array<{
        id: string;
        subject_entity_id: string;
        predicate: string;
        value_jsonb: Record<string, unknown> | null;
      }>) {
        const key = `${existing.subject_entity_id}|${existing.predicate}`;
        const entry = pairs.get(key);
        if (!entry) continue;
        // Map every draft claim in this pair to the first (most recent) existing match.
        for (const draftId of entry.draftIds) {
          if (!next.has(draftId)) {
            next.set(draftId, {
              existingClaimId: existing.id,
              existingValue: existing.value_jsonb,
            });
          }
        }
      }
      if (!cancelled) setMap(next);
    })();

    return () => { cancelled = true; };
  }, [claims]);

  return map;
}
