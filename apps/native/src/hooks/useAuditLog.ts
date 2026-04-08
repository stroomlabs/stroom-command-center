import { useCallback, useEffect, useState } from 'react';
import type { AuditLogEntry } from '@stroom/types';
import supabase from '../lib/supabase';

export interface AuditLogRow extends AuditLogEntry {
  // enriched client-side
  entity_label?: string | null;
}

export function useAuditLog(limit = 50) {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { data, error: err } = await supabase
        .schema('intel')
        .from('audit_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (err) throw err;
      const entries = (data as AuditLogEntry[]) ?? [];

      // Enrich entries whose entity_table = 'claims' with the subject entity name
      const claimIds = entries
        .filter((e) => e.entity_table === 'claims' && e.entity_id)
        .map((e) => e.entity_id as string);

      let claimMap = new Map<string, string>();
      if (claimIds.length > 0) {
        const { data: claims } = await supabase
          .schema('intel')
          .from('claims')
          .select('id, subject_entity:entities!claims_subject_entity_id_fkey(canonical_name)')
          .in('id', claimIds);
        for (const c of (claims as any[]) ?? []) {
          const name = c.subject_entity?.canonical_name;
          if (name) claimMap.set(c.id, name);
        }
      }

      const enriched: AuditLogRow[] = entries.map((e) => ({
        ...e,
        entity_label:
          e.entity_table === 'claims' && e.entity_id
            ? claimMap.get(e.entity_id) ?? null
            : null,
      }));

      setRows(enriched);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load audit log');
    } finally {
      setLoading(false);
    }
  }, [limit]);

  useEffect(() => {
    refresh();
    const channel = supabase
      .channel('topic:audit')
      .on('broadcast', { event: 'changes' }, () => refresh())
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { rows, loading, error, refresh };
}
