import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import supabase from '../lib/supabase';

const STORAGE_KEY = 'stroom.command.last_briefing_at';
const MIN_GAP_MS = 6 * 60 * 60_000; // 6 hours

interface OvernightPayload {
  claims_ingested?: number;
  claims_auto_approved?: number;
  corrections?: number;
  new_entities?: number;
  new_sources?: number;
  claims_still_draft?: number;
  top_source?: {
    name?: string;
    claims?: number;
    trust?: number;
  } | null;
  top_domains?: Array<{ domain: string; claims: number }> | null;
  sweeps?: Array<unknown> | null;
}

// Auto-generates an ephemeral "morning briefing" message for Command when
// the chat is empty and it's been more than 6 hours since the last briefing.
// Calls intel.get_overnight_summary() (default 12h lookback), formats the
// response as Markdown, and returns it ready to render as an assistant
// bubble. The result is NOT persisted to command_sessions — it's
// regenerated locally whenever the conditions hold.
export function useMorningBriefing(enabled: boolean) {
  const [briefing, setBriefing] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const now = Date.now();
      if (raw) {
        const prev = Number(raw);
        if (Number.isFinite(prev) && now - prev < MIN_GAP_MS) {
          return;
        }
      }

      const { data, error } = await supabase.schema('intel').rpc('get_overnight_summary');
      if (error) throw error;
      const payload: OvernightPayload = (Array.isArray(data) ? data[0] : data) ?? {};

      const formatted = formatBriefing(payload);
      if (!formatted) return;

      setBriefing(formatted);
      await AsyncStorage.setItem(STORAGE_KEY, String(now));
    } catch {
      // Briefing is best-effort; don't surface errors to the operator.
    }
  }, []);

  useEffect(() => {
    if (enabled) {
      load();
    }
  }, [enabled, load]);

  return { briefing };
}

function formatBriefing(p: OvernightPayload): string | null {
  if (!p) return null;
  const ingested = p.claims_ingested ?? 0;
  const autoApproved = p.claims_auto_approved ?? 0;
  const corrections = p.corrections ?? 0;
  const newEntities = p.new_entities ?? 0;
  const newSources = p.new_sources ?? 0;
  const stillDraft = p.claims_still_draft ?? 0;
  const sweepCount = Array.isArray(p.sweeps) ? p.sweeps.length : 0;

  const topSourceLine = p.top_source?.name
    ? `Top source: ${p.top_source.name} (${p.top_source.claims ?? 0} claims, trust ${
        p.top_source.trust != null ? Number(p.top_source.trust).toFixed(1) : '—'
      })`
    : null;

  const domainsLine = Array.isArray(p.top_domains) && p.top_domains.length > 0
    ? 'Domains: ' +
      p.top_domains
        .map((d) => `${d.domain} (${d.claims})`)
        .join(', ')
    : null;

  const lines = [
    '☀️ **Overnight Summary**',
    '',
    `${ingested} claims ingested · ${autoApproved} auto-approved · ${corrections} corrections`,
    `${newEntities} new entities · ${newSources} new sources`,
    `Queue: ${stillDraft} drafts waiting`,
  ];
  if (topSourceLine) {
    lines.push('');
    lines.push(topSourceLine);
  }
  if (domainsLine) {
    lines.push('');
    lines.push(domainsLine);
  }
  lines.push('');
  lines.push(`${sweepCount} governance ${sweepCount === 1 ? 'sweep' : 'sweeps'} ran.`);

  return lines.join('\n');
}
