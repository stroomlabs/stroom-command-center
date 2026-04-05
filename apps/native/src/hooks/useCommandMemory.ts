import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ConversationSummary {
  session_id: string;
  topic: string;
  summary: string;
  saved_at: string;
}

const STORAGE_KEY = 'stroom.command_memory';
const MAX_MEMORIES = 5;

// Reads/writes the last N conversation summaries from AsyncStorage so
// fresh Command sessions can be primed with continuity context. Local-only
// — memory is device-scoped rather than tied to the operator profile so
// there's no network round-trip on session start.
export function useCommandMemory() {
  const [memories, setMemories] = useState<ConversationSummary[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          setMemories(
            (parsed as ConversationSummary[])
              .filter((m) => m && m.topic && m.summary)
              .slice(0, MAX_MEMORIES)
          );
          return;
        }
      }
      setMemories([]);
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
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const current: ConversationSummary[] =
        raw && Array.isArray(JSON.parse(raw)) ? JSON.parse(raw) : [];
      // Dedup by session id, keep newest at the front, cap at MAX_MEMORIES.
      const deduped = current.filter((m) => m.session_id !== next.session_id);
      const updated = [next, ...deduped].slice(0, MAX_MEMORIES);
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      setMemories(updated);
    } catch {
      // best-effort
    }
  }, []);

  const clear = useCallback(async () => {
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
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

// Derive a short topic + 1-sentence summary from a conversation thread.
// Cheap local heuristic — no LLM call needed. Topic is the first user
// message (trimmed to 60 chars). Summary tries to grab the first complete
// sentence of the last assistant reply, then falls back to the first user
// turn.
export function summarizeConversation(
  messages: Array<{ role: string; content: string }>
): { topic: string; summary: string } | null {
  const firstUser = messages.find((m) => m.role === 'user');
  const lastAssistant = [...messages]
    .reverse()
    .find((m) => m.role === 'assistant' && m.content.trim().length > 0);
  if (!firstUser) return null;

  const topic = firstUser.content.trim().slice(0, 60).replace(/\s+/g, ' ');

  let sentence: string | null = null;
  if (lastAssistant) {
    // Strip common markdown artifacts, then pull the first sentence.
    const stripped = lastAssistant.content
      .replace(/[#*`_>]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const match = stripped.match(/^([^.!?]+[.!?])/);
    sentence = (match?.[1] ?? stripped).trim();
    if (sentence.length > 240) sentence = sentence.slice(0, 240) + '…';
  }

  const summary =
    sentence ?? `Asked about "${topic}".`;

  return { topic, summary };
}
