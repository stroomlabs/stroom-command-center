import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  fetchCommandOperatorContext,
  buildOperatorContextMessage,
} from '@stroom/supabase';
import supabase from '../lib/supabase';
import {
  useCommandMemory,
  buildMemoryContextMessage,
  summarizeConversation,
} from './useCommandMemory';
import { usePinnedMessages, buildPinnedContextMessage } from './usePinnedMessages';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  id: string;
  role: ChatRole;
  content: string;
  timestamp: string;
}

const SESSION_KEY = 'stroom.command.session_id';
const ENDPOINT = `${SUPABASE_URL}/functions/v1/command-chat`;

function makeId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export type SaveState = 'saved' | 'saving' | 'unsaved' | 'offline';

export function useCommandChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>('unsaved');
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const { memories, save: saveMemory } = useCommandMemory();
  const memoriesRef = useRef(memories);
  useEffect(() => {
    memoriesRef.current = memories;
  }, [memories]);
  const { pinned } = usePinnedMessages();
  const pinnedRef = useRef(pinned);
  useEffect(() => {
    pinnedRef.current = pinned;
  }, [pinned]);

  // Load or create session id on mount
  useEffect(() => {
    (async () => {
      let id = await AsyncStorage.getItem(SESSION_KEY);
      if (!id) {
        id = makeId();
        await AsyncStorage.setItem(SESSION_KEY, id);
      }
      setSessionId(id);
    })();
  }, []);

  const resetSession = useCallback(async () => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    // Before dropping the session, stash a compact summary to operator
    // memory so the next fresh session can be primed with continuity.
    if (sessionId && messages.length >= 2) {
      const summary = summarizeConversation(messages);
      if (summary) {
        void saveMemory({
          session_id: sessionId,
          topic: summary.topic,
          summary: summary.summary,
          saved_at: new Date().toISOString(),
        });
      }
    }
    const id = makeId();
    await AsyncStorage.setItem(SESSION_KEY, id);
    setSessionId(id);
    setMessages([]);
    setError(null);
    setSending(false);
    setSaveState('unsaved');
    setLastSavedAt(null);
  }, [sessionId, messages, saveMemory]);

  // Load a previously persisted session (from intel.command_sessions).
  const loadSession = useCallback(
    async (loadedSessionId: string, loadedMessages: Array<{ role: ChatRole; content: string; timestamp?: string }>) => {
      xhrRef.current?.abort();
      xhrRef.current = null;
      await AsyncStorage.setItem(SESSION_KEY, loadedSessionId);
      setSessionId(loadedSessionId);
      setMessages(
        loadedMessages.map((m) => ({
          id: makeId(),
          role: m.role,
          content: m.content,
          timestamp: m.timestamp ?? new Date().toISOString(),
        }))
      );
      setError(null);
      setSending(false);
    },
    []
  );

  const runRequest = useCallback(
    async (convo: ChatMessage[], sid: string) => {
      setError(null);
      const assistantMsg: ChatMessage = {
        id: makeId(),
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };
      setMessages([...convo, assistantMsg]);
      setSending(true);

      try {
        const { data: sess } = await supabase.auth.getSession();
        const accessToken = sess?.session?.access_token ?? SUPABASE_ANON_KEY;

        // Prime the model with a compact operator snapshot (recent actions +
        // queue composition). Best-effort — if the context fetch fails we
        // still send the conversation through.
        let contextMessage: { role: 'system'; content: string } | null = null;
        try {
          const ctx = await fetchCommandOperatorContext(supabase);
          contextMessage = {
            role: 'system',
            content: buildOperatorContextMessage(ctx),
          };
        } catch {
          // swallow — context is an enhancement, not a requirement
        }

        // On the first user turn of a session, inject prior-session memory
        // summaries so Claude has continuity across fresh sessions. Only the
        // first turn carries the memory block to keep token usage down.
        let memoryMessage: { role: 'system'; content: string } | null = null;
        const isFirstTurn =
          convo.filter((m) => m.role === 'user').length <= 1;
        if (isFirstTurn) {
          const memoryText = buildMemoryContextMessage(memoriesRef.current);
          if (memoryText) {
            memoryMessage = { role: 'system', content: memoryText };
          }
        }

        // Pinned messages are injected on every turn (unlike memory which
        // only goes on the first) so they function as durable context
        // Claude sees for as long as they remain pinned.
        let pinnedMessage: { role: 'system'; content: string } | null = null;
        const pinnedText = buildPinnedContextMessage(pinnedRef.current);
        if (pinnedText) {
          pinnedMessage = { role: 'system', content: pinnedText };
        }

        const payloadMessages = [
          ...(contextMessage ? [contextMessage] : []),
          ...(memoryMessage ? [memoryMessage] : []),
          ...(pinnedMessage ? [pinnedMessage] : []),
          ...convo.map(({ role, content }) => ({ role, content })),
        ];

        const body = JSON.stringify({
          messages: payloadMessages,
          session_id: sid,
          stream: true,
        });

        setSaveState('saving');

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;
          xhr.open('POST', ENDPOINT);
          xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
          xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
          xhr.setRequestHeader('Content-Type', 'application/json');
          xhr.setRequestHeader('Accept', 'text/event-stream, text/plain, application/json');

          const applyStreamText = () => {
            const text = parseStreamChunk(xhr.responseText);
            if (text == null) return; // no progressive text available yet (e.g. final-JSON shape)
            setMessages((prev) => {
              const copy = [...prev];
              for (let i = copy.length - 1; i >= 0; i--) {
                if (copy[i].role === 'assistant' && copy[i].id === assistantMsg.id) {
                  copy[i] = { ...copy[i], content: text };
                  break;
                }
              }
              return copy;
            });
          };

          xhr.onprogress = applyStreamText;

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              // Final pass: prefer streamed text; fall back to JSON {content,...}
              const streamed = parseStreamChunk(xhr.responseText);
              let finalText: string;
              if (streamed != null && streamed.length > 0) {
                finalText = streamed;
              } else {
                try {
                  const parsed = JSON.parse(xhr.responseText);
                  finalText =
                    typeof parsed?.content === 'string'
                      ? parsed.content
                      : xhr.responseText;
                } catch {
                  finalText = xhr.responseText;
                }
              }
              setMessages((prev) => {
                const copy = [...prev];
                for (let i = copy.length - 1; i >= 0; i--) {
                  if (copy[i].role === 'assistant' && copy[i].id === assistantMsg.id) {
                    copy[i] = { ...copy[i], content: finalText };
                    break;
                  }
                }
                return copy;
              });
              // The edge function persists the session on each successful
              // request, so mark as saved.
              setSaveState('saved');
              setLastSavedAt(new Date());
              resolve();
            } else {
              let errText = xhr.responseText || 'Request failed';
              try {
                const parsed = JSON.parse(xhr.responseText);
                errText = parsed?.error ?? parsed?.message ?? errText;
              } catch {}
              reject(new Error(`HTTP ${xhr.status}: ${errText}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error contacting command-chat'));
          xhr.onabort = () => reject(new Error('aborted'));
          xhr.ontimeout = () => reject(new Error('Request timed out'));
          xhr.timeout = 120_000;

          xhr.send(body);
        });
      } catch (e: any) {
        if (e?.message === 'aborted') {
          // Silent — user cancelled or reset
        } else {
          setError(e.message ?? 'Send failed');
          setSaveState('unsaved');
        }
        // Remove the empty assistant placeholder on failure
        setMessages((prev) => {
          const last = prev[prev.length - 1];
          if (last?.role === 'assistant' && last.content === '') {
            return prev.slice(0, -1);
          }
          return prev;
        });
      } finally {
        setSending(false);
        xhrRef.current = null;
      }
    },
    []
  );

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending || !sessionId) return;
      const userMsg: ChatMessage = {
        id: makeId(),
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      await runRequest([...messages, userMsg], sessionId);
    },
    [messages, sending, sessionId, runRequest]
  );

  const cancel = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setSending(false);
  }, []);

  const deleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  // Retry an assistant message: remove it (and any trailing assistant) and re-run
  // the request with the conversation up to the preceding user message.
  const retryFrom = useCallback(
    async (messageId: string) => {
      if (sending || !sessionId) return;
      const idx = messages.findIndex((m) => m.id === messageId);
      if (idx < 0) return;
      // Walk backward to the last user message before `idx`
      let userIdx = idx - 1;
      while (userIdx >= 0 && messages[userIdx].role !== 'user') userIdx--;
      if (userIdx < 0) return;
      const convo = messages.slice(0, userIdx + 1);
      await runRequest(convo, sessionId);
    },
    [messages, sending, sessionId, runRequest]
  );

  return {
    messages,
    sending,
    error,
    sessionId,
    saveState,
    lastSavedAt,
    send,
    cancel,
    resetSession,
    loadSession,
    deleteMessage,
    retryFrom,
  };
}

// Parse a (potentially partial) streaming response body.
//
// Primary shape is Anthropic SSE: an interleaved sequence of `event:` and
// `data:` lines where each data line is a JSON frame. We only accumulate
// text_delta content from content_block_delta frames; all other frame
// types (message_start, content_block_start/stop, message_delta,
// message_stop, ping, etc.) are ignored. OpenAI-style `choices[0].delta.
// content` and generic wrappers are supported as fallbacks so the same
// parser works regardless of which upstream the edge function wires.
//
// Never pushes raw SSE text on JSON parse failure — a partially received
// chunk is dropped until the next onprogress tick delivers the full line.
//
// Returns null if the body *looks* like a complete JSON envelope (starts
// with `{` and has no data: prefix) so the caller can fall back to
// JSON.parse for non-streaming responses.
function parseStreamChunk(raw: string): string | null {
  if (!raw) return '';
  const trimmedStart = raw.trimStart();

  const looksLikeSse =
    trimmedStart.includes('data:') || trimmedStart.startsWith('event:');

  if (looksLikeSse) {
    const out: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      // Ignore event:, id:, retry:, blank lines — only data: carries JSON.
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;

      let obj: any;
      try {
        obj = JSON.parse(payload);
      } catch {
        // Partial JSON from a chunk boundary — skip this line; it will
        // re-appear on the next onprogress tick with the rest of the
        // bytes. Never fall through to pushing raw SSE text.
        continue;
      }

      // ── Anthropic streaming ──
      // content_block_delta → { type, index, delta: { type: 'text_delta', text } }
      if (
        obj?.type === 'content_block_delta' &&
        obj.delta?.type === 'text_delta' &&
        typeof obj.delta.text === 'string'
      ) {
        out.push(obj.delta.text);
        continue;
      }
      // Explicitly drop non-text Anthropic frames.
      if (
        obj?.type === 'message_start' ||
        obj?.type === 'message_delta' ||
        obj?.type === 'message_stop' ||
        obj?.type === 'content_block_start' ||
        obj?.type === 'content_block_stop' ||
        obj?.type === 'ping' ||
        obj?.type === 'error'
      ) {
        continue;
      }

      // ── OpenAI streaming ──
      // { choices: [{ delta: { content: '...' } }] }
      const openaiDelta = obj?.choices?.[0]?.delta?.content;
      if (typeof openaiDelta === 'string') {
        out.push(openaiDelta);
        continue;
      }

      // ── Generic wrappers returned by lightweight edge function shims ──
      if (typeof obj?.delta === 'string') {
        out.push(obj.delta);
        continue;
      }
      if (typeof obj?.content === 'string') {
        out.push(obj.content);
        continue;
      }
      if (typeof obj?.text === 'string') {
        out.push(obj.text);
        continue;
      }
      // Anything else — including unknown event types — is ignored.
    }
    return out.join('');
  }

  if (trimmedStart.startsWith('{')) {
    // Looks like a single JSON envelope — let caller handle with JSON.parse
    return null;
  }

  // Plain text stream — return cumulative body as-is
  return raw;
}
