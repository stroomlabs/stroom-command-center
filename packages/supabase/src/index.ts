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
      client.from('claims').select('*', { count: 'exact', head: true }).then((r) => r.count ?? 0),
      client.from('entities').select('*', { count: 'exact', head: true }).then((r) => r.count ?? 0),
      client.from('sources').select('*', { count: 'exact', head: true }).then((r) => r.count ?? 0),
      client
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .in('status', ['draft', 'pending_review'])
        .then((r) => r.count ?? 0),
      client
        .from('research_queue')
        .select('*', { count: 'exact', head: true })
        .in('status', ['queued', 'in_progress'])
        .then((r) => r.count ?? 0),
      client
        .from('research_queue')
        .select('actual_cost_usd')
        .gte('completed_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
        .then((r) => {
          if (!r.data) return 0;
          return r.data.reduce((sum, row) => sum + (row.actual_cost_usd ?? 0), 0);
        }),
      client
        .from('claims')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'corrected')
        .then((r) => r.count ?? 0),
      client
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
  object_entity_id: string | null;
  confidence_score: number | null;
  corroboration_score: number | null;
  status: ClaimStatus;
  created_at: string;
  subject_entity: { canonical_name: string } | null;
  object_entity: { canonical_name: string } | null;
  source: { id: string; source_name: string; trust_score: number } | null;
}

export async function fetchQueueClaims(
  client: SupabaseClient,
  limit = 20,
  offset = 0
): Promise<QueueClaim[]> {
  const { data, error } = await client
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
      object_entity:entities!claims_object_entity_id_fkey(canonical_name),
      source:sources!claims_asserted_source_id_fkey(id, source_name, trust_score)
    `
    )
    .eq('status', 'pending_review')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1);

  // Also fetch draft claims (current pipeline uses 'draft' for unreviewed)
  const { data: draftData, error: draftError } = await client
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
    .from('claims')
    .select('status')
    .eq('id', claimId)
    .single();

  const oldStatus = current?.status ?? 'draft';

  const { error: updateError } = await client
    .from('claims')
    .update({ status: 'approved' })
    .eq('id', claimId);

  if (updateError) throw updateError;

  const { error: auditError } = await client.from('audit_log').insert({
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
    .from('claims')
    .select('status')
    .eq('id', claimId)
    .single();

  const oldStatus = current?.status ?? 'draft';

  const { error: updateError } = await client
    .from('claims')
    .update(patch)
    .eq('id', claimId);
  if (updateError) throw updateError;

  const { error: auditError } = await client.from('audit_log').insert({
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

export async function batchApproveClaims(
  client: SupabaseClient,
  claimIds: string[]
): Promise<void> {
  if (claimIds.length === 0) return;

  // Read current statuses for accurate audit trail
  const { data: current } = await client
    .from('claims')
    .select('id, status')
    .in('id', claimIds);

  const statusById = new Map<string, string>();
  for (const row of (current as { id: string; status: string }[] | null) ?? []) {
    statusById.set(row.id, row.status);
  }

  const { error: updateError } = await client
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

  const { error: auditError } = await client.from('audit_log').insert(auditRows);
  if (auditError) throw auditError;
}

export async function rejectClaim(
  client: SupabaseClient,
  claimId: string,
  reason: RejectionReason,
  notes?: string
): Promise<void> {
  const { data: current } = await client
    .from('claims')
    .select('status')
    .eq('id', claimId)
    .single();

  const oldStatus = current?.status ?? 'draft';

  const { error: updateError } = await client
    .from('claims')
    .update({ status: 'rejected' })
    .eq('id', claimId);

  if (updateError) throw updateError;

  const { error: auditError } = await client.from('audit_log').insert({
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
  const { data, error } = await client.from('claims').select('predicate');
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
      .from('claims')
      .select('created_at, asserted_source_id')
      .gte('created_at', start.toISOString())
      .lt('created_at', end.toISOString()),
    client
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
  const { data, error } = await client.from('claims').select('subject_entity_id');
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
    .from('sources')
    .select('*')
    .order('trust_score', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data as Source[]) ?? [];
}

export { SUPABASE_URL, SUPABASE_ANON_KEY };
