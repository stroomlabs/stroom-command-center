// ── intel.claims ──
export interface Claim {
  id: string;
  subject_entity_id: string | null;
  predicate: string | null;
  value_jsonb: Record<string, unknown> | null;
  object_entity_id: string | null;
  status: ClaimStatus;
  confidence_score: number | null;
  corroboration_score: number | null;
  asserted_source_id: string | null;
  claim_family: string | null;
  scope_context: string | null;
  scope_target_id: string | null;
  scope_target_kind: string | null;
  scope_valid_from: string | null;
  scope_valid_until: string | null;
  extraction_method: string | null;
  effective_at: string | null;
  expires_at: string | null;
  provenance_chain: Record<string, unknown> | null;
  audit_status: string | null;
  primary_sourced: boolean | null;
  single_source: boolean | null;
  contradiction_group_id: string | null;
  is_legacy_migrated: boolean;
  created_at: string;
}

export type ClaimStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'published'
  | 'rejected'
  | 'corrected'
  | 'superseded'
  | 'retracted';

// ── intel.entities ──
export interface Entity {
  id: string;
  domain: string | null;
  entity_type: string | null;
  name: string | null;
  canonical_name: string | null;
  canonical_slug: string | null;
  entity_class: string | null;
  description: string | null;
  visibility_scope: string | null;
  slug: string | null;
  metadata: Record<string, unknown> | null;
  external_ids: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

// ── intel.sources ──
export interface Source {
  id: string;
  source_name: string;
  source_class: string | null;
  trust_score: number;
  source_url: string | null;
  domain: string | null;
  derived_from: string | null;
  notes: string | null;
  operational_reliability: number | null;
  auto_approve: boolean | null;
  monitor_config: Record<string, unknown> | null;
  created_at: string;
}

// ── intel.predicate_registry ──
export interface Predicate {
  predicate_key: string;
  display_name: string;
  category: string;
  description: string | null;
  risk_level: string | null;
  freshness_days: number | null;
  value_type: string;
  applicable_domains: string[] | null;
  applicable_entity_types: string[] | null;
}

// ── intel.claim_corroborations ──
export interface ClaimCorroboration {
  id: string;
  claim_id: string;
  source_id: string;
  source_class: string | null;
  citation_url: string | null;
  confidence: number | null;
  extraction_method: string | null;
  extracted_at: string;
}

// ── intel.audit_log ──
export interface AuditLogEntry {
  id: string;
  entity_id: string | null;
  entity_table: string | null;
  actor: AuditActor;
  action_type: AuditActionType;
  old_state: Record<string, unknown> | null;
  new_state: Record<string, unknown> | null;
  rejection_reason: string | null;
  rejection_detail: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export type AuditActor = 'operator' | 'agent' | 'system';
export type AuditActionType =
  | 'approve'
  | 'reject'
  | 'correct'
  | 'supersede'
  | 'retract'
  | 'create'
  | 'update';

// ── intel.research_queue ──
export interface ResearchQueueItem {
  id: string;
  prompt: string;
  source: ResearchSource;
  priority: ResearchPriority;
  status: ResearchStatus;
  target_entities: string[] | null;
  target_predicates: string[] | null;
  batch_id: string | null;
  recency_window: string | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  claims_staged: number | null;
  sources_discovered: number | null;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export type ResearchSource = 'claude' | 'operator' | 'scheduled' | 'enhance';
export type ResearchPriority = 'urgent' | 'normal' | 'backfill';
export type ResearchStatus =
  | 'queued'
  | 'cost_estimated'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'cancelled';

// ── intel.governance_policies ──
export type GovernanceAction = 'auto_approve' | 'auto_flag' | 'auto_reject';

export interface GovernancePolicy {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  min_trust_score: number | null;
  min_confidence_score: number | null;
  min_corroborations: number | null;
  action: GovernanceAction;
  applies_to_predicates: string[] | null;
  applies_to_entity_types: string[] | null;
}

export interface AutoGovernanceSweepResult {
  approved: number;
  flagged: number;
  rejected: number;
}

// ── intel.policy_config ──
export interface PolicyConfig {
  id: string;
  key: string;
  value: Record<string, unknown>;
  description: string | null;
  created_at: string;
  updated_at: string;
}

// ── intel.command_sessions ──
export interface CommandSession {
  id: string;
  title: string | null;
  messages: CommandMessage[];
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export interface CommandMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
}

// ── intel.operator_profiles ──
export interface OperatorProfile {
  id: string;
  user_id: string;
  expo_push_token: string | null;
  preferences: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ── Pulse screen aggregates ──
export interface PulseData {
  totalClaims: number;
  totalEntities: number;
  totalSources: number;
  queueDepth: number;
  correctionRate: number;
  researchActive: number;
  budgetSpendUsd: number;
}

// ── Rejection reasons ──
export const REJECTION_REASONS = [
  'Contradicts existing',
  'Insufficient sourcing',
  'Incorrect entity',
  'Temporal conflict',
  'Other',
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

// ── Realtime event payloads ──
export interface RealtimeClaimPayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE';
  new: Partial<Claim>;
  old: Partial<Claim>;
}

export interface RealtimeAuditPayload {
  eventType: 'INSERT';
  new: AuditLogEntry;
}
