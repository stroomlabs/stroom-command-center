import { useCallback, useEffect, useState } from 'react';
import supabase from '../lib/supabase';

export interface ConversationSummary {
  session_id: string;
  topic: string;
  summary: string;
  saved_at: string;
}

const MAX_MEMORIES = 3;
const PREFERENCES_KEY = 'command_memory';

// Reads/writes the last N conversation summaries from
// intel.operator_profiles.preferences.command_memory so fresh Command
// sessions can be primed with continuity context.
export function useCommandMemory() {
  const [memories, setMemories] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setMemories([]);
        return;
      }
      const { data } = await supabase
        .from('operator_profiles')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle();
      const prefs = (data?.preferences ?? {}) as Record<string, unknown>;
      const raw = prefs[PREFERENCES_KEY];
      if (Array.isArray(raw)) {
        setMemories(
          (raw as ConversationSummary[])
            .filter((m) => m && m.topic && m.summary)
            .slice(0, MAX_MEMORIES)
        );
      } else {
        setMemories([]);
      }
    } catch {
      setMemories([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const save = useCallback(async (next: ConversationSummary) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: existing } = await supabase
        .from('operator_profiles')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle();
      const prefs = (existing?.preferences ?? {}) as Record<string, unknown>;
      const current = Array.isArray(prefs[PREFERENCES_KEY])
        ? ((prefs[PREFERENCES_KEY] as ConversationSummary[]) ?? [])
        : [];
      // Dedup by session id, keep newest at the front, cap to MAX_MEMORIES.
      const deduped = current.filter((m) => m.session_id !== next.session_id);
      const updated = [next, ...deduped].slice(0, MAX_MEMORIES);

      await supabase.from('operator_profiles').upsert(
        {
          user_id: user.id,
          preferences: { ...prefs, [PREFERENCES_KEY]: updated },
        },
        { onConflict: 'user_id' }
      );
      setMemories(updated);
    } catch {
      // memory save is best-effort
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data: existing } = await supabase
        .from('operator_profiles')
        .select('preferences')
        .eq('user_id', user.id)
        .maybeSingle();
      const prefs = (existing?.preferences ?? {}) as Record<string, unknown>;
      delete (prefs as any)[PREFERENCES_KEY];
      await supabase.from('operator_profiles').upsert(
        { user_id: user.id, preferences: prefs },
        { onConflict: 'user_id' }
      );
      setMemories([]);
    } catch {}
  }, []);

  return { memories, loading, save, clear, refresh: load };
}

// Build a short Markdown memory block that can be injected as a system
// message to give Claude continuity with previous conversations.
export function buildMemoryContextMessage(
  memories: ConversationSummary[]
): string | null {
  if (memories.length === 0) return null;
  const lines = [
    '# Previous conversation memory',
    '',
    'The operator has chatted with you in prior sessions. Here are the last',
    `${memories.length} conversation summaries, newest first. Use them as`,
    'background context; the operator may or may not reference them.',
    '',
  ];
  for (const m of memories) {
    lines.push(`## ${m.topic}`);
    lines.push(`_${new Date(m.saved_at).toLocaleString()}_`);
    lines.push('');
    lines.push(m.summary);
    lines.push('');
  }
  return lines.join('\n');
}

// Derive a short topic + summary from a conversation thread. Cheap local
// heuristic — no LLM call needed. Topic is the first user message (trimmed
// to 60 chars). Summary is the first user turn and the last assistant reply
// concatenated.
export function summarizeConversation(
  messages: Array<{ role: string; content: string }>
): { topic: string; summary: string } | null {
  const firstUser = messages.find((m) => m.role === 'user');
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content.trim().length > 0);
  if (!firstUser) return null;
  const topic = firstUser.content.trim().slice(0, 60).replace(/\s+/g, ' ');
  const summaryParts: string[] = [];
  summaryParts.push(`Q: ${firstUser.content.trim().slice(0, 240)}`);
  if (lastAssistant) {
    summaryParts.push(`A: ${lastAssistant.content.trim().slice(0, 400)}`);
  }
  return { topic, summary: summaryParts.join('\n') };
}
