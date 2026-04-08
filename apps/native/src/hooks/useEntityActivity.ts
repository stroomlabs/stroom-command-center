import { useCallback, useEffect, useState } from 'react';
import type { AuditLogEntry } from '@stroom/types';
import supabase from '../lib/supabase';

// Fetch the last N audit_log entries relevant to a single entity. An entry is
// "relevant" when either the audit row directly targets the entity
// (entity_table = 'entities' and entity_id = :id) or when the row targets a
// claim whose subject_entity_id or object_entity_id matches the entity.
export function useEntityActivity(entityId: string | null, limit = 10) {
  const [rows, setRows] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!entityId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      // 1) Audit rows directly targeting this entity
      const { data: direct, error: e1 } = await supabase
        .schema('intel')
        .from('audit_log')
        .select('*')
        .eq('entity_table', 'entities')
        .eq('entity_id', entityId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (e1) throw e1;

      // 2) Audit rows on claims where this entity is the subject or object
      const { data: claimIdsRows } = await supabase
        .schema('intel')
        .from('claims')
        .select('id')
        .or(`subject_entity_id.eq.${entityId},object_entity_id.eq.${entityId}`)
        .limit(200);
      const claimIds = (claimIdsRows ?? []).map((c: any) => c.id);

      let claimAudit: AuditLogEntry[] = [];
      if (claimIds.length > 0) {
        const { data } = await supabase
          .schema('intel')
          .from('audit_log')
          .select('*')
          .eq('entity_table', 'claims')
          .in('entity_id', claimIds)
          .order('created_at', { ascending: false })
          .limit(limit);
        claimAudit = (data as AuditLogEntry[]) ?? [];
      }

      const merged = [...((direct as AuditLogEntry[]) ?? []), ...claimAudit]
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
        .slice(0, limit);

      setRows(merged);
      setError(null);
    } catch (e: any) {
      setError(e.message ?? 'Failed to load activity');
    } finally {
      setLoading(false);
    }
  }, [entityId, limit]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { rows, loading, error, refresh };
}
