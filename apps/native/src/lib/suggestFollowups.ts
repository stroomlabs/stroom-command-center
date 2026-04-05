export interface FollowupSuggestion {
  label: string;
  prompt: string;
  kind:
    | 'coverage'
    | 'sweep'
    | 'health'
    | 'queue'
    | 'entity'
    | 'source'
    | 'research'
    | 'audit'
    | 'default';
}

// Derive 2–3 contextual follow-up suggestions from an assistant reply.
// Purely local keyword matching — no LLM call. Order matters: the first
// match in each bucket wins, and we cap the output at 3. Each suggestion
// contains both a short chip label and the full prompt that should be
// sent when the operator taps it.
export function suggestFollowups(
  content: string,
  opts: { lastUserMessage?: string } = {}
): FollowupSuggestion[] {
  const text = (content ?? '').toLowerCase();
  if (text.trim().length === 0) return [];

  const out: FollowupSuggestion[] = [];
  const seen = new Set<string>();
  const push = (s: FollowupSuggestion) => {
    if (seen.has(s.kind) || out.length >= 3) return;
    seen.add(s.kind);
    out.push(s);
  };

  // Coverage signals — the assistant mentioned gaps, thin entities, missing
  // claims, or the coverage score.
  if (/\bcoverage\b|\bgap|thin\b|missing claim|few claims/.test(text)) {
    push({
      kind: 'coverage',
      label: 'Dig into coverage gaps',
      prompt:
        'Show me the entities with the worst coverage gaps right now and suggest what to research first.',
    });
  }

  // Governance sweep / auto-approve signals.
  if (/\bsweep\b|auto[- ]?approve|governance engine|auto[- ]?govern/.test(text)) {
    push({
      kind: 'sweep',
      label: 'Run a sweep now',
      prompt:
        'Summarize what would happen if I ran a governance sweep right now, then tell me the safest way to trigger it.',
    });
  }

  // Graph health signals.
  if (/\bhealth\b|stale|orphan|low[- ]?confidence|corroboration|failing source/.test(text)) {
    push({
      kind: 'health',
      label: 'Graph health check',
      prompt:
        'Run a full graph health check and flag anything above warning thresholds with suggested fixes.',
    });
  }

  // Queue / review backlog signals.
  if (/\bqueue\b|pending review|backlog|triage|draft claim/.test(text)) {
    push({
      kind: 'queue',
      label: 'Triage the queue',
      prompt:
        'Walk me through the current review queue, prioritized by risk and entity importance. What should I approve or reject first?',
    });
  }

  // Entity-specific signals — the reply references an entity by name.
  const entityMatch = /entit(?:y|ies)\s+(?:called|named)?\s*"?([a-z0-9 .\-]{2,40})"?/i.exec(
    content
  );
  if (entityMatch) {
    const name = entityMatch[1].trim().replace(/\.$/, '');
    if (name.length > 1) {
      push({
        kind: 'entity',
        label: `More on ${truncate(name, 28)}`,
        prompt: `Tell me more about the entity "${name}" — recent claims, corroboration, and any open research tasks.`,
      });
    }
  }

  // Source trust signals.
  if (/trust score|low[- ]?trust|unreliable source|primary source/.test(text)) {
    push({
      kind: 'source',
      label: 'Audit sources',
      prompt:
        'List our lowest-trust sources and the claims they are currently supporting. What should I deprecate?',
    });
  }

  // Research queue signals.
  if (/research|perplexity|follow[- ]?up research|open question/.test(text)) {
    push({
      kind: 'research',
      label: 'Review research queue',
      prompt:
        'Show the active research queue and suggest which items are most likely to unblock pending claims.',
    });
  }

  // Audit trail signals.
  if (/audit|operator action|recent changes|who changed/.test(text)) {
    push({
      kind: 'audit',
      label: 'Explain recent audit activity',
      prompt:
        'Summarize the last 24 hours of audit activity and flag anything unusual.',
    });
  }

  // Default fallback — if nothing matched keep a single generic chip so
  // the UI never feels empty after a short response.
  if (out.length === 0) {
    push({
      kind: 'default',
      label: 'Go deeper',
      prompt:
        (opts.lastUserMessage
          ? `Expand on your previous answer about "${truncate(opts.lastUserMessage, 80)}" — what are the key follow-ups?`
          : 'Go deeper on your previous answer — what are the most important follow-ups I should consider?'),
    });
  }

  return out.slice(0, 3);
}

function truncate(s: string, max: number): string {
  if (s.length <= max) return s;
  return s.slice(0, max - 1).trimEnd() + '…';
}
