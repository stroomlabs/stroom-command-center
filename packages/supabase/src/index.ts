import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  Claim,
  Entity,
  Source,
  AuditLogEntry,
  ResearchQueueItem,
  PulseData,
  Predicate,
  ClaimStatus,
  AuditActor,
  AuditActionType,
  RejectionReason,
  GovernancePolicy,
  GovernanceAction,
  AutoGovernanceSweepResult,
} from '@stroom/types';

// ── Config ──
const SUPABASE_URL = 'https://xazalbajuvqbqgkgyagf.supabase.co';
const SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhhemFsYmFqdXZxYnFna2d5YWdmIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzIzMzU3MTMsImV4cCI6MjA4NzkxMTcxM30.2ju4lVaNBBC3LJK3dJdA7LQr43KmsQ2atn9Nd4zFCHY';

export type StorageAdapter = {
  getItem: (key: string) => Promise<string | null>;
  setItem: (key: string, value: string) => Promise<void>;
  removeItem: (key: string) => Promise<void>;
};

export interface CreateClientOptions {
  storage?: StorageAdapter;
  workerRealtime?: boolean;
}

let _client: SupabaseClient | null = null;

export function getSupabaseClient(options?: CreateClientOptions): SupabaseClient {
  if (_client) return _client;

  _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      storage: options?.storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  return _client;
}

export function resetClient() {
  _client = null;
}

// ── Pulse RPC ──

export async function fetchPulseData(client: SupabaseClient): Promise<PulseData> {
  const [claims, entities, sources, queue, research, budget, corrections, totalForRate] =
    await Promise.all([
      client.schema('intel').from('claims').select('*', { count: 'exact', head: true }).then((r) => r.count ?? 0),
      client.schema('intel').from('entities').select('*', { count: 'exact', head: true }).then((r) => r.count ?? 0),
      client.schema('intel').from('sources').select('*', { count: 'exact', head: true }).then((r) => r.count ?? 0),
      client
        .schema('intel')
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .in('status', ['draft', 'pending_review'])
        .then((r) => r.count ?? 0),
      client
        .schema('intel')
        .from('research_queue')
        .select('*', { count: 'exact', head: true })
        .in('status', ['queued', 'in_progress'])
        .then((r) => r.count ?? 0),
      client
        .schema('intel')
        .from('research_queue')
        .select('actual_cost_usd')
        .gte('completed_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
        .then((r) => {
          if (!r.data) return 0;
          return r.data.reduce((sum, row) => sum + (row.actual_cost_usd ?? 0), 0);
        }),
      client
        .schema('intel')
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'corrected')
        .then((r) => r.count ?? 0),
      client
        .schema('intel')
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .in('status', ['published', 'corrected'])
        .then((r) => r.count ?? 0),
    ]);

  const correctionRate = totalForRate > 0 ? corrections / totalForRate : 0;

  return {
    totalClaims: claims,
    totalEntities: entities,
    totalSources: sources,
    queueDepth: queue,
    correctionRate,
    researchActive: research,
    budgetSpendUsd: budget,
  };
}

// ── Queue types & fetcher ──

export interface QueueClaim {
  id: string;
  predicate: string | null;
  value_jsonb: Record<string, unknown> | null;
  subject_entity_id: string | null;
  object_entity_id: string | null;
  confidence_score: number | null;
  corroboration_score: number | null;
  status: ClaimStatus;
  created_at: string;
  subject_entity: { canonical_name: string; domain: string | null } | null;
  object_entity: { canonical_name: string } | null;
  source: { id: string; source_name: string; trust_score: number } | null;
}

export async function fetchQueueClaims(
  client: SupabaseClient,
  limit = 20,
  offset = 0
): Promise<QueueClaim[]> {
  const { data, error } = await client
    .schema('intel')
    .from('claims')
    .select(
      `
      id,
      predicate,
      value_jsonb,
      subject_entity_id,
      object_entity_id,
      confidence_score,
      corroboration_score,
      status,
      created_at,
      subject_entity:entities!claims_subject_entity_id_fkey(canonical_name, domain),
      object_entity:entities!claims_object_entity_id_fkey(canonical_name),
      source:sources!claims_asserted_source_id_fkey(id, source_name, trust_score)
    `
    )
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Also fetch draft claims (current pipeline uses 'draft' for unreviewed)
  const { data: draftData, error: draftError } = await client
    .schema('intel')
    .from('claims')
    .select(
      `
      id,
      predicate,
      value_jsonb,
      subject_entity_id,
      object_entity_id,
      confidence_score,
      corroboration_score,
      status,
      created_at,
      subject_entity:entities!claims_subject_entity_id_fkey(canonical_name, domain),
      object_entity:entities!claims_object_entity_id_fkey(canonical_name),
      source:sources!claims_asserted_source_id_fkey(id, source_name, trust_score)
    `
    )
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error && draftError) throw error;

  const combined = [
    ...((data as unknown as QueueClaim[]) ?? []),
    ...((draftData as unknown as QueueClaim[]) ?? []),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
   .slice(0, limit);

  return combined;
}

// ── Governance actions ──

export async function approveClaim(
  client: SupabaseClient,
  claimId: string
): Promise<void> {
  // First read current status for accurate audit trail
  const { data: current } = await client
    .schema('intel')
    .from('claims')
    .select('status')
    .eq('id', claimId)
    .single();

  const oldStatus = current?.status ?? 'draft';

  const { error: updateError } = await client
    .schema('intel')
    .from('claims')
    .update({ status: 'approved' })
    .eq('id', claimId);

  if (updateError) throw updateError;

  const { error: auditError } = await client.schema('intel').from('audit_log').insert({
    entity_id: claimId,
    entity_table: 'claims',
    actor: 'operator' as AuditActor,
    action_type: 'approve' as AuditActionType,
    old_state: { status: oldStatus },
    new_state: { status: 'approved' },
  });

  if (auditError) throw auditError;
}

export interface ClaimUpdatePatch {
  value_jsonb?: Record<string, unknown> | null;
  status?: ClaimStatus;
  confidence_score?: number | null;
}

export async function updateClaim(
  client: SupabaseClient,
  claimId: string,
  patch: ClaimUpdatePatch
): Promise<void> {
  // Read current status so we can audit any status transition
  const { data: current } = await client
    .schema('intel')
    .from('claims')
    .select('status')
    .eq('id', claimId)
    .single();

  const oldStatus = current?.status ?? 'draft';

  const { error: updateError } = await client
    .schema('intel')
    .from('claims')
    .update(patch)
    .eq('id', claimId);
  if (updateError) throw updateError;

  const { error: auditError } = await client.schema('intel').from('audit_log').insert({
    entity_id: claimId,
    entity_table: 'claims',
    actor: 'operator' as AuditActor,
    action_type: 'update' as AuditActionType,
    old_state: { status: oldStatus },
    new_state: {
      status: patch.status ?? oldStatus,
      fields: Object.keys(patch),
    },
  });
  if (auditError) throw auditError;
}

/**
 * Merge a duplicate entity into a target entity via the
 * `intel.merge_entities(target_entity_id, duplicate_entity_id)` RPC. The
 * server-side function handles claim subject reassignment, object_entity_id
 * back-references, archiving the duplicate, and audit logging — all inside
 * a single transaction so partial failure can't leave orphaned state.
 *
 * Returns the number of claims that were reassigned (as reported by the
 * RPC's `claims_moved` field).
 */
export async function mergeEntities(
  client: SupabaseClient,
  params: {
    targetEntityId: string;
    duplicateEntityId: string;
  }
): Promise<number> {
  const { targetEntityId, duplicateEntityId } = params;
  if (targetEntityId === duplicateEntityId) {
    throw new Error('Cannot merge an entity into itself');
  }

  const { data, error } = await client.schema('intel').rpc('merge_entities', {
    target_entity_id: targetEntityId,
    duplicate_entity_id: duplicateEntityId,
  });
  if (error) throw error;

  // The RPC returns either a scalar count or a row with a claims_moved
  // field depending on how it was defined. Normalize both shapes.
  if (typeof data === 'number') return data;
  if (data && typeof data === 'object') {
    const row = Array.isArray(data) ? data[0] : data;
    const moved = (row as { claims_moved?: number })?.claims_moved;
    if (typeof moved === 'number') return moved;
  }
  return 0;
}

export async function batchApproveClaims(
  client: SupabaseClient,
  claimIds: string[]
): Promise<void> {
  if (claimIds.length === 0) return;

  // Read current statuses for accurate audit trail
  const { data: current } = await client
    .schema('intel')
    .from('claims')
    .select('id, status')
    .in('id', claimIds);

  const statusById = new Map<string, string>();
  for (const row of (current as { id: string; status: string }[] | null) ?? []) {
    statusById.set(row.id, row.status);
  }

  const { error: updateError } = await client
    .schema('intel')
    .from('claims')
    .update({ status: 'approved' })
    .in('id', claimIds);

  if (updateError) throw updateError;

  const auditRows = claimIds.map((id) => ({
    entity_id: id,
    entity_table: 'claims',
    actor: 'operator' as AuditActor,
    action_type: 'approve' as AuditActionType,
    old_state: { status: statusById.get(id) ?? 'draft' },
    new_state: { status: 'approved' },
    metadata: { batch: true, batch_size: claimIds.length },
  }));

  const { error: auditError } = await client.schema('intel').from('audit_log').insert(auditRows);
  if (auditError) throw auditError;
}

export async function rejectClaim(
  client: SupabaseClient,
  claimId: string,
  reason: RejectionReason,
  notes?: string
): Promise<void> {
  const { data: current } = await client
    .schema('intel')
    .from('claims')
    .select('status')
    .eq('id', claimId)
    .single();

  const oldStatus = current?.status ?? 'draft';

  const { error: updateError } = await client
    .schema('intel')
    .from('claims')
    .update({ status: 'rejected' })
    .eq('id', claimId);

  if (updateError) throw updateError;

  const { error: auditError } = await client.schema('intel').from('audit_log').insert({
    entity_id: claimId,
    entity_table: 'claims',
    actor: 'operator' as AuditActor,
    action_type: 'reject' as AuditActionType,
    old_state: { status: oldStatus },
    new_state: { status: 'rejected' },
    rejection_reason: reason,
    rejection_detail: notes ?? null,
  });

  if (auditError) throw auditError;
}

// ── Realtime subscriptions ──
// Channel names must match the topic param in intel.*_broadcast() functions

export function subscribeToClaimChanges(
  client: SupabaseClient,
  callback: (payload: { eventType: string; new: Partial<Claim>; old: Partial<Claim> }) => void
) {
  return client
    .channel('topic:claims')
    .on('broadcast', { event: 'changes' }, (payload) => {
      callback(payload.payload as any);
    })
    .subscribe();
}

export function subscribeToAuditLog(
  client: SupabaseClient,
  callback: (entry: AuditLogEntry) => void
) {
  return client
    .channel('topic:audit')
    .on('broadcast', { event: 'changes' }, (payload) => {
      callback((payload.payload as any).new);
    })
    .subscribe();
}

export function subscribeToResearchQueue(
  client: SupabaseClient,
  callback: (payload: any) => void
) {
  return client
    .channel('topic:research')
    .on('broadcast', { event: 'changes' }, (payload) => {
      callback(payload.payload);
    })
    .subscribe();
}

// ── Explore: search + detail fetchers ──

export interface EntitySearchResult {
  id: string;
  canonical_name: string | null;
  name: string | null;
  entity_type: string | null;
  entity_class: string | null;
  domain: string | null;
  description: string | null;
  updated_at: string;
}

export async function searchEntities(
  client: SupabaseClient,
  query: string,
  limit = 30
): Promise<EntitySearchResult[]> {
  let q = client
    .schema('intel')
    .from('entities')
    .select('id, canonical_name, name, entity_type, entity_class, domain, description, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);

  const trimmed = query.trim();
  if (trimmed.length > 0) {
    // Escape %/_ and wildcard match on canonical_name OR name
    const safe = trimmed.replace(/[%_]/g, (m) => `\\${m}`);
    q = q.or(`canonical_name.ilike.%${safe}%,name.ilike.%${safe}%`);
  }

  const { data, error } = await q;
  if (error) throw error;
  return (data as EntitySearchResult[]) ?? [];
}

export async function fetchEntityById(
  client: SupabaseClient,
  id: string
): Promise<Entity | null> {
  const { data, error } = await client
    .schema('intel')
    .from('entities')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as Entity;
}

export interface EntityClaim {
  id: string;
  predicate: string | null;
  value_jsonb: Record<string, unknown> | null;
  object_entity_id: string | null;
  confidence_score: number | null;
  corroboration_score: number | null;
  status: ClaimStatus;
  created_at: string;
  object_entity: { canonical_name: string } | null;
  source: { source_name: string; trust_score: number } | null;
}

export async function fetchClaimsForEntity(
  client: SupabaseClient,
  entityId: string,
  limit = 50,
  offset = 0
): Promise<EntityClaim[]> {
  const { data, error } = await client
    .schema('intel')
    .from('claims')
    .select(
      `
      id,
      predicate,
      value_jsonb,
      object_entity_id,
      confidence_score,
      corroboration_score,
      status,
      created_at,
      object_entity:entities!claims_object_entity_id_fkey(canonical_name),
      source:sources!claims_asserted_source_id_fkey(id, source_name, trust_score)
    `
    )
    .eq('subject_entity_id', entityId)
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) throw error;
  return ((data as unknown) as EntityClaim[]) ?? [];
}

export interface ClaimDetail {
  id: string;
  predicate: string | null;
  value_jsonb: Record<string, unknown> | null;
  status: ClaimStatus;
  confidence_score: number | null;
  corroboration_score: number | null;
  claim_family: string | null;
  scope_context: string | null;
  scope_valid_from: string | null;
  scope_valid_until: string | null;
  extraction_method: string | null;
  effective_at: string | null;
  expires_at: string | null;
  created_at: string;
  subject_entity_id: string | null;
  object_entity_id: string | null;
  subject_entity: { id: string; canonical_name: string | null } | null;
  object_entity: { id: string; canonical_name: string | null } | null;
  source: { id: string; source_name: string; trust_score: number; source_url: string | null } | null;
}

export interface ClaimCorroborationDetail {
  id: string;
  source_id: string;
  source_class: string | null;
  citation_url: string | null;
  confidence: number | null;
  extraction_method: string | null;
  extracted_at: string;
  source: { source_name: string; trust_score: number } | null;
}

export async function fetchClaimDetail(
  client: SupabaseClient,
  claimId: string
): Promise<{ claim: ClaimDetail; corroborations: ClaimCorroborationDetail[] } | null> {
  const { data: claim, error } = await client
    .schema('intel')
    .from('claims')
    .select(
      `
      id,
      predicate,
      value_jsonb,
      status,
      confidence_score,
      corroboration_score,
      claim_family,
      scope_context,
      scope_valid_from,
      scope_valid_until,
      extraction_method,
      effective_at,
      expires_at,
      created_at,
      subject_entity_id,
      object_entity_id,
      subject_entity:entities!claims_subject_entity_id_fkey(id, canonical_name),
      object_entity:entities!claims_object_entity_id_fkey(id, canonical_name),
      source:sources!claims_asserted_source_id_fkey(id, source_name, trust_score, source_url)
    `
    )
    .eq('id', claimId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }

  const { data: corrobs, error: corrobError } = await client
    .schema('intel')
    .from('claim_corroborations')
    .select(
      `
      id,
      source_id,
      source_class,
      citation_url,
      confidence,
      extraction_method,
      extracted_at,
      source:sources!claim_corroborations_source_id_fkey(source_name, trust_score)
    `
    )
    .eq('claim_id', claimId)
    .order('extracted_at', { ascending: false });

  if (corrobError) throw corrobError;

  return {
    claim: (claim as unknown) as ClaimDetail,
    corroborations: ((corrobs as unknown) as ClaimCorroborationDetail[]) ?? [],
  };
}

// ── Sources ──

export async function fetchSourceById(
  client: SupabaseClient,
  id: string
): Promise<Source | null> {
  const { data, error } = await client
    .schema('intel')
    .from('sources')
    .select('*')
    .eq('id', id)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw error;
  }
  return data as Source;
}

// Calls the intel.update_source RPC which handles audit logging. Only the
// fields the caller passes get updated — everything else is left untouched.
export async function updateSource(
  client: SupabaseClient,
  id: string,
  patch: {
    trust_score?: number;
    auto_approve?: boolean;
    canary_status?: string;
  }
): Promise<void> {
  const { error } = await client.schema('intel').rpc('update_source', {
    source_id: id,
    new_trust_score: patch.trust_score ?? null,
    new_auto_approve: patch.auto_approve ?? null,
    new_canary_status: patch.canary_status ?? null,
  });
  if (error) throw error;
}

// Batch counterpart — applies the same patch to every source id in the
// array via intel.batch_update_sibling_sources. The RPC handles audit
// logging per row. Returns the number of rows updated.
export async function batchUpdateSiblingSources(
  client: SupabaseClient,
  sourceIds: string[],
  patch: {
    trust_score?: number;
    auto_approve?: boolean;
    canary_status?: string;
  }
): Promise<number> {
  if (sourceIds.length === 0) return 0;
  const { data, error } = await client.schema('intel').rpc('batch_update_sibling_sources', {
    source_ids: sourceIds,
    new_trust_score: patch.trust_score ?? null,
    new_auto_approve: patch.auto_approve ?? null,
    new_canary_status: patch.canary_status ?? null,
  });
  if (error) throw error;
  // The RPC may return the updated count or the updated rows — normalize
  // to a number so callers can show a toast.
  if (typeof data === 'number') return data;
  if (Array.isArray(data)) return data.length;
  return sourceIds.length;
}

export interface SourceClaim {
  id: string;
  predicate: string | null;
  value_jsonb: Record<string, unknown> | null;
  object_entity_id: string | null;
  confidence_score: number | null;
  corroboration_score: number | null;
  status: ClaimStatus;
  created_at: string;
  subject_entity: { canonical_name: string | null } | null;
  object_entity: { canonical_name: string | null } | null;
}

export async function fetchClaimsForSource(
  client: SupabaseClient,
  sourceId: string,
  limit = 50
): Promise<SourceClaim[]> {
  const { data, error } = await client
    .schema('intel')
    .from('claims')
    .select(
      `
      id,
      predicate,
      value_jsonb,
      object_entity_id,
      confidence_score,
      corroboration_score,
      status,
      created_at,
      subject_entity:entities!claims_subject_entity_id_fkey(canonical_name),
      object_entity:entities!claims_object_entity_id_fkey(canonical_name)
    `
    )
    .eq('asserted_source_id', sourceId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown) as SourceClaim[]) ?? [];
}

// ── Predicates ──

export async function fetchAllPredicates(
  client: SupabaseClient
): Promise<Predicate[]> {
  const { data, error } = await client
    .schema('intel')
    .from('predicate_registry')
    .select(
      'predicate_key, display_name, category, description, risk_level, freshness_days, value_type, applicable_domains, applicable_entity_types'
    )
    .order('category', { ascending: true })
    .order('display_name', { ascending: true });
  if (error) throw error;
  return (data as Predicate[]) ?? [];
}

export async function fetchClaimCountsByPredicate(
  client: SupabaseClient
): Promise<Map<string, number>> {
  const { data, error } = await client.schema('intel').from('claims').select('predicate');
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of (data as { predicate: string | null }[] | null) ?? []) {
    const p = row.predicate;
    if (!p) continue;
    counts.set(p, (counts.get(p) ?? 0) + 1);
  }
  return counts;
}

export interface PredicateClaim {
  id: string;
  predicate: string | null;
  value_jsonb: Record<string, unknown> | null;
  status: ClaimStatus;
  confidence_score: number | null;
  created_at: string;
  subject_entity: { id: string; canonical_name: string | null } | null;
  object_entity: { id: string; canonical_name: string | null } | null;
  source: { id: string; source_name: string; trust_score: number } | null;
}

export async function fetchClaimsByPredicate(
  client: SupabaseClient,
  predicateKey: string,
  limit = 100
): Promise<PredicateClaim[]> {
  const { data, error } = await client
    .schema('intel')
    .from('claims')
    .select(
      `
      id,
      predicate,
      value_jsonb,
      status,
      confidence_score,
      created_at,
      subject_entity:entities!claims_subject_entity_id_fkey(id, canonical_name),
      object_entity:entities!claims_object_entity_id_fkey(id, canonical_name),
      source:sources!claims_asserted_source_id_fkey(id, source_name, trust_score)
    `
    )
    .eq('predicate', predicateKey)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return ((data as unknown) as PredicateClaim[]) ?? [];
}

// ── Daily digest ──

export interface HourBucket {
  hour: number; // 0..23 local
  count: number;
}

export interface DailyDigest {
  claimsTotal: number;
  claimsByHour: HourBucket[];
  approvalsTotal: number;
  rejectionsTotal: number;
  actionsByHour: HourBucket[];
  sourcesTotal: number;
  sourcesByHour: HourBucket[];
}

export async function fetchDailyDigest(
  client: SupabaseClient
): Promise<DailyDigest> {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [claimsRes, auditRes] = await Promise.all([
    client
      .schema('intel')
      .from('claims')
      .select('created_at, asserted_source_id')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString()),
    client
      .schema('intel')
      .from('audit_log')
      .select('action_type, created_at')
      .eq('actor', 'operator')
      .in('action_type', ['approve', 'reject'])
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString()),
  ]);

  if (claimsRes.error) throw claimsRes.error;
  if (auditRes.error) throw auditRes.error;

  const claimsByHour = makeHourBuckets();
  const sourcesByHour = makeHourBuckets();
  const actionsByHour = makeHourBuckets();

  const sourcesSeenGlobal = new Set<string>();
  const sourcesSeenByHour: Set<string>[] = Array.from({ length: 24 }, () => new Set());

  let claimsTotal = 0;
  for (const row of (claimsRes.data as {
    created_at: string;
    asserted_source_id: string | null;
  }[] | null) ?? []) {
    const d = new Date(row.created_at);
    const h = d.getHours();
    claimsByHour[h].count++;
    claimsTotal++;
    const sid = row.asserted_source_id;
    if (sid && !sourcesSeenByHour[h].has(sid)) {
      sourcesSeenByHour[h].add(sid);
      sourcesByHour[h].count++;
    }
    if (sid) sourcesSeenGlobal.add(sid);
  }

  let approvalsTotal = 0;
  let rejectionsTotal = 0;
  for (const row of (auditRes.data as {
    action_type: string;
    created_at: string;
  }[] | null) ?? []) {
    const d = new Date(row.created_at);
    const h = d.getHours();
    actionsByHour[h].count++;
    if (row.action_type === 'approve') approvalsTotal++;
    else if (row.action_type === 'reject') rejectionsTotal++;
  }

  return {
    claimsTotal,
    claimsByHour,
    approvalsTotal,
    rejectionsTotal,
    actionsByHour,
    sourcesTotal: sourcesSeenGlobal.size,
    sourcesByHour,
  };
}

function makeHourBuckets(): HourBucket[] {
  return Array.from({ length: 24 }, (_, i) => ({ hour: i, count: 0 }));
}

// ── Coverage gaps: entities with few claims ──

export interface CoverageGapEntity {
  id: string;
  canonical_name: string | null;
  entity_type: string | null;
  claim_count: number;
}

export async function fetchCoverageGaps(
  client: SupabaseClient,
  threshold = 3,
  entityLimit = 1000
): Promise<CoverageGapEntity[]> {
  const [entitiesRes, claimsRes] = await Promise.all([
    client
      .schema('intel')
      .from('entities')
      .select('id, canonical_name, entity_type, updated_at')
      .order('updated_at', { ascending: false })
      .limit(entityLimit),
    client.schema('intel').from('claims').select('subject_entity_id'),
  ]);
  if (entitiesRes.error) throw entitiesRes.error;
  if (claimsRes.error) throw claimsRes.error;

  const counts = new Map<string, number>();
  for (const row of (claimsRes.data as { subject_entity_id: string | null }[] | null) ?? []) {
    const id = row.subject_entity_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const gaps: CoverageGapEntity[] = [];
  for (const e of (entitiesRes.data as {
    id: string;
    canonical_name: string | null;
    entity_type: string | null;
  }[] | null) ?? []) {
    const count = counts.get(e.id) ?? 0;
    if (count < threshold) {
      gaps.push({
        id: e.id,
        canonical_name: e.canonical_name,
        entity_type: e.entity_type,
        claim_count: count,
      });
    }
  }

  return gaps.sort((a, b) => a.claim_count - b.claim_count);
}

// ── Top entities by claim count ──

export interface TopEntity {
  id: string;
  canonical_name: string | null;
  entity_type: string | null;
  claim_count: number;
}

// Pulls the single subject_entity_id column from claims, tallies client-side,
// then resolves the top N to their canonical names.
export async function fetchTopEntities(
  client: SupabaseClient,
  limit = 5
): Promise<TopEntity[]> {
  const { data, error } = await client.schema('intel').from('claims').select('subject_entity_id');
  if (error) throw error;

  const counts = new Map<string, number>();
  for (const row of (data as { subject_entity_id: string | null }[] | null) ?? []) {
    const id = row.subject_entity_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const top = Array.from(counts.entries())
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit);
  if (top.length === 0) return [];

  const ids = top.map(([id]) => id);
  const { data: entityRows, error: entErr } = await client
    .schema('intel')
    .from('entities')
    .select('id, canonical_name, entity_type')
    .in('id', ids);
  if (entErr) throw entErr;

  const byId = new Map<string, { canonical_name: string | null; entity_type: string | null }>();
  for (const e of (entityRows as {
    id: string;
    canonical_name: string | null;
    entity_type: string | null;
  }[] | null) ?? []) {
    byId.set(e.id, { canonical_name: e.canonical_name, entity_type: e.entity_type });
  }

  return top.map(([id, count]) => ({
    id,
    canonical_name: byId.get(id)?.canonical_name ?? null,
    entity_type: byId.get(id)?.entity_type ?? null,
    claim_count: count,
  }));
}

// ── Entity name map (for Command inline links) ──

export interface EntityNameEntry {
  id: string;
  name: string; // canonical_name (fallback to name)
}

export async function fetchEntityNameMap(
  client: SupabaseClient,
  limit = 1000
): Promise<EntityNameEntry[]> {
  const { data, error } = await client
    .schema('intel')
    .from('entities')
    .select('id, canonical_name, name, updated_at')
    .order('updated_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data as { id: string; canonical_name: string | null; name: string | null }[] | null) ?? [];
  return rows
    .map((r) => ({
      id: r.id,
      name: (r.canonical_name ?? r.name ?? '').trim(),
    }))
    .filter((e) => e.name.length >= 3); // avoid noisy 1-2 char matches
}

// ── Entity connections ──

export interface EntityConnection {
  otherEntityId: string;
  otherEntityName: string;
  predicate: string;
  direction: 'outgoing' | 'incoming';
  claimCount: number;
}

// Fetch both outgoing (this → other) and incoming (other → this) object-linked
// claims for an entity, aggregated by (other entity, predicate, direction).
export async function fetchConnectionsForEntity(
  client: SupabaseClient,
  entityId: string
): Promise<EntityConnection[]> {
  const [outRes, inRes] = await Promise.all([
    client
      .schema('intel')
      .from('claims')
      .select(
        `
        predicate,
        object_entity_id,
        object_entity:entities!claims_object_entity_id_fkey(id, canonical_name)
      `
      )
      .eq('subject_entity_id', entityId)
      .not('object_entity_id', 'is', null),
    client
      .schema('intel')
      .from('claims')
      .select(
        `
        predicate,
        subject_entity_id,
        subject_entity:entities!claims_subject_entity_id_fkey(id, canonical_name)
      `
      )
      .eq('object_entity_id', entityId)
      .not('subject_entity_id', 'is', null),
  ]);

  if (outRes.error) throw outRes.error;
  if (inRes.error) throw inRes.error;

  const agg = new Map<string, EntityConnection>();
  const bump = (
    otherId: string | null | undefined,
    otherName: string | null | undefined,
    predicate: string | null | undefined,
    direction: 'outgoing' | 'incoming'
  ) => {
    if (!otherId || !predicate) return;
    const key = `${direction}|${otherId}|${predicate}`;
    const existing = agg.get(key);
    if (existing) {
      existing.claimCount += 1;
    } else {
      agg.set(key, {
        otherEntityId: otherId,
        otherEntityName: otherName ?? 'Unknown entity',
        predicate,
        direction,
        claimCount: 1,
      });
    }
  };

  for (const row of (outRes.data as any[]) ?? []) {
    bump(row.object_entity_id, row.object_entity?.canonical_name, row.predicate, 'outgoing');
  }
  for (const row of (inRes.data as any[]) ?? []) {
    bump(row.subject_entity_id, row.subject_entity?.canonical_name, row.predicate, 'incoming');
  }

  return Array.from(agg.values()).sort((a, b) => b.claimCount - a.claimCount);
}

export async function fetchClaimCountsBySource(
  client: SupabaseClient
): Promise<Map<string, number>> {
  // PostgREST doesn't support group-by directly. Pulling the single
  // asserted_source_id column for all claims keeps the payload tiny
  // and counting client-side scales well into the tens of thousands.
  const { data, error } = await client
    .schema('intel')
    .from('claims')
    .select('asserted_source_id');
  if (error) throw error;
  const counts = new Map<string, number>();
  for (const row of (data as { asserted_source_id: string | null }[] | null) ?? []) {
    const id = row.asserted_source_id;
    if (!id) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  return counts;
}

export async function fetchAllSources(
  client: SupabaseClient,
  limit = 200
): Promise<Source[]> {
  const { data, error } = await client
    .schema('intel')
    .from('sources')
    .select('*')
    .order('trust_score', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Source[]) ?? [];
}

// ── Entity similarity (merge suggestions) ──

export interface SimilarEntity {
  id: string;
  canonical_name: string | null;
  entity_type: string | null;
  distance: number;
}

// Fetches candidate entities sharing a lexical prefix and returns those within
// Levenshtein distance <= `maxDistance` from the source name. PostgREST can't
// do edit-distance server-side without the fuzzystrmatch extension, so we
// narrow via ilike first and finish the comparison client-side.
export async function fetchSimilarEntities(
  client: SupabaseClient,
  sourceId: string,
  sourceName: string,
  maxDistance = 3
): Promise<SimilarEntity[]> {
  const name = (sourceName ?? '').trim();
  if (name.length < 3) return [];

  const prefix = name.slice(0, 2).replace(/[%_]/g, (m) => `\\${m}`);
  const { data, error } = await client
    .schema('intel')
    .from('entities')
    .select('id, canonical_name, name, entity_type')
    .or(`canonical_name.ilike.%${prefix}%,name.ilike.%${prefix}%`)
    .neq('id', sourceId)
    .limit(200);

  if (error) throw error;

  const lowerSource = name.toLowerCase();
  const rows = (data as {
    id: string;
    canonical_name: string | null;
    name: string | null;
    entity_type: string | null;
  }[] | null) ?? [];

  const candidates: SimilarEntity[] = [];
  for (const r of rows) {
    const candidateName = (r.canonical_name ?? r.name ?? '').toLowerCase();
    if (!candidateName) continue;
    const d = levenshtein(lowerSource, candidateName);
    if (d > 0 && d <= maxDistance) {
      candidates.push({
        id: r.id,
        canonical_name: r.canonical_name ?? r.name,
        entity_type: r.entity_type,
        distance: d,
      });
    }
  }

  return candidates.sort((a, b) => a.distance - b.distance).slice(0, 5);
}

// Iterative Levenshtein distance with row-wise DP (O(min(m,n)) space).
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  let prevRow = new Array(n + 1);
  for (let j = 0; j <= n; j++) prevRow[j] = j;

  const currRow = new Array(n + 1);
  for (let i = 1; i <= m; i++) {
    currRow[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a.charCodeAt(i - 1) === b.charCodeAt(j - 1) ? 0 : 1;
      currRow[j] = Math.min(
        currRow[j - 1] + 1, // insert
        prevRow[j] + 1, // delete
        prevRow[j - 1] + cost // substitute
      );
    }
    // Swap rows
    const tmp = prevRow;
    prevRow = currRow.slice();
    currRow.length = tmp.length;
    for (let k = 0; k < tmp.length; k++) currRow[k] = 0;
  }
  return prevRow[n];
}

// ── Corrections / supersedes ──

export interface SupersedingClaim {
  id: string;
  predicate: string | null;
  status: ClaimStatus;
  created_at: string;
  confidence_score: number | null;
  source: { source_name: string; trust_score: number } | null;
}

// Given a claim, return any claim with the same (subject_entity_id, predicate)
// that was created AFTER this claim. These are the rows that would "supersede"
// the current claim in a corrections chain.
export async function fetchSupersedingClaims(
  client: SupabaseClient,
  claimId: string,
  subjectEntityId: string | null,
  predicate: string | null,
  createdAt: string
): Promise<SupersedingClaim[]> {
  if (!subjectEntityId || !predicate) return [];
  const { data, error } = await client
    .schema('intel')
    .from('claims')
    .select(
      `
      id,
      predicate,
      status,
      created_at,
      confidence_score,
      source:sources!claims_asserted_source_id_fkey(source_name, trust_score)
    `
    )
    .eq('subject_entity_id', subjectEntityId)
    .eq('predicate', predicate)
    .gt('created_at', createdAt)
    .neq('id', claimId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return ((data as unknown) as SupersedingClaim[]) ?? [];
}

// ── Command chat operator context ──

export interface CommandOperatorContext {
  recentActions: Array<{
    action: string;
    entity_table: string | null;
    entity_id: string | null;
    at: string;
  }>;
  queueByEntityType: Record<string, number>;
  queueByCategory: Record<string, number>;
  queueTotal: number;
}

// Fetches a compact snapshot used to prime the Command chat Edge Function:
//   - last 5 operator audit_log entries
//   - queue composition by subject entity type and predicate category
export async function fetchCommandOperatorContext(
  client: SupabaseClient
): Promise<CommandOperatorContext> {
  const [auditRes, queueRes, registryRes] = await Promise.all([
    client
      .schema('intel')
      .from('audit_log')
      .select('action_type, entity_table, entity_id, created_at')
      .eq('actor', 'operator')
      .order('created_at', { ascending: false })
      .limit(5),
    client
      .schema('intel')
      .from('claims')
      .select(
        'predicate, subject_entity:entities!claims_subject_entity_id_fkey(entity_type)'
      )
      .in('status', ['draft', 'pending_review']),
    client
      .schema('intel')
      .from('predicate_registry')
      .select('predicate_key, category'),
  ]);

  if (auditRes.error) throw auditRes.error;
  if (queueRes.error) throw queueRes.error;
  if (registryRes.error) throw registryRes.error;

  const categoryByKey = new Map<string, string>();
  for (const r of (registryRes.data as { predicate_key: string; category: string }[] | null) ?? []) {
    categoryByKey.set(r.predicate_key, r.category);
  }

  const queueByEntityType: Record<string, number> = {};
  const queueByCategory: Record<string, number> = {};
  let queueTotal = 0;
  for (const row of (queueRes.data as any[] | null) ?? []) {
    queueTotal++;
    const type = row.subject_entity?.entity_type ?? 'unknown';
    queueByEntityType[type] = (queueByEntityType[type] ?? 0) + 1;
    const category = categoryByKey.get(row.predicate) ?? 'uncategorized';
    queueByCategory[category] = (queueByCategory[category] ?? 0) + 1;
  }

  const recentActions = (
    (auditRes.data as {
      action_type: string;
      entity_table: string | null;
      entity_id: string | null;
      created_at: string;
    }[] | null) ?? []
  ).map((r) => ({
    action: r.action_type,
    entity_table: r.entity_table,
    entity_id: r.entity_id,
    at: r.created_at,
  }));

  return { recentActions, queueByEntityType, queueByCategory, queueTotal };
}

export function buildOperatorContextMessage(
  ctx: CommandOperatorContext
): string {
  const lines: string[] = ['# Operator context (auto-injected)'];

  lines.push('');
  lines.push('## Recent operator actions (last 5)');
  if (ctx.recentActions.length === 0) {
    lines.push('- (none in recent history)');
  } else {
    for (const a of ctx.recentActions) {
      const when = new Date(a.at).toISOString().slice(0, 16).replace('T', ' ');
      const target =
        a.entity_table && a.entity_id
          ? `${a.entity_table}:${a.entity_id.slice(0, 8)}`
          : a.entity_table ?? '';
      lines.push(`- [${when}] ${a.action} ${target}`.trim());
    }
  }

  lines.push('');
  lines.push(`## Queue composition (${ctx.queueTotal} pending)`);
  const typeEntries = Object.entries(ctx.queueByEntityType).sort(
    ([, a], [, b]) => b - a
  );
  if (typeEntries.length === 0) {
    lines.push('- (queue empty)');
  } else {
    lines.push('### By entity type');
    for (const [t, c] of typeEntries) lines.push(`- ${t}: ${c}`);
  }
  const catEntries = Object.entries(ctx.queueByCategory).sort(
    ([, a], [, b]) => b - a
  );
  if (catEntries.length > 0) {
    lines.push('### By predicate category');
    for (const [c, n] of catEntries) lines.push(`- ${c}: ${n}`);
  }

  return lines.join('\n');
}

// ── Governance policies ──

export async function fetchGovernancePolicies(
  client: SupabaseClient
): Promise<GovernancePolicy[]> {
  const { data, error } = await client
    .schema('intel')
    .from('governance_policies')
    .select(
      'id, name, description, is_active, min_trust_score, min_confidence_score, min_corroborations, action, applies_to_predicates, applies_to_entity_types'
    )
    .order('name', { ascending: true });
  if (error) throw error;
  return (data as GovernancePolicy[]) ?? [];
}

export async function updateGovernancePolicy(
  client: SupabaseClient,
  id: string,
  patch: Partial<Omit<GovernancePolicy, 'id'>>
): Promise<void> {
  const { error } = await client
    .schema('intel')
    .from('governance_policies')
    .update(patch)
    .eq('id', id);
  if (error) throw error;
}

export async function createGovernancePolicy(
  client: SupabaseClient,
  policy: Omit<GovernancePolicy, 'id'>
): Promise<GovernancePolicy> {
  const { data, error } = await client
    .schema('intel')
    .from('governance_policies')
    .insert(policy)
    .select()
    .single();
  if (error) throw error;
  return data as GovernancePolicy;
}

export async function runAutoGovernance(
  client: SupabaseClient
): Promise<AutoGovernanceSweepResult> {
  const { data, error } = await client.schema('intel').rpc('run_auto_governance');
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  return {
    approved: Number(row?.approved ?? 0),
    flagged: Number(row?.flagged ?? 0),
    rejected: Number(row?.rejected ?? 0),
  };
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
