import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type {
  Claim,
  Entity,
  Source,
  AuditLogEntry,
  ResearchQueueItem,
  PulseData,
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
  source: { source_name: string; trust_score: number } | null;
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
      source:sources!claims_asserted_source_id_fkey(source_name, trust_score)
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
      source:sources!claims_asserted_source_id_fkey(source_name, trust_score)
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

export { SUPABASE_URL, SUPABASE_ANON_KEY };
