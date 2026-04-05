import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@stroom/supabase';
import supabase from '../lib/supabase';

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

export function useCommandChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

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
    const id = makeId();
    await AsyncStorage.setItem(SESSION_KEY, id);
    setSessionId(id);
    setMessages([]);
    setError(null);
    setSending(false);
  }, []);

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

        const body = JSON.stringify({
          messages: convo.map(({ role, content }) => ({ role, content })),
          session_id: sid,
        });

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
    send,
    cancel,
    resetSession,
    deleteMessage,
    retryFrom,
  };
}

// Parse a (potentially partial) streaming response body.
//
// Supports:
//   - Server-Sent Events frames: lines starting with `data: ` containing either
//     a JSON object with {delta|content|text|content_block_delta.text} or raw text.
//     Handles `[DONE]` sentinel.
//   - Plain text streams: returned as-is.
//
// Returns null if the body *looks* like a complete JSON response (starts with
// `{` and has no `data:` prefix) so the caller can fall back to JSON.parse.
function parseStreamChunk(raw: string): string | null {
  if (!raw) return '';
  const trimmedStart = raw.trimStart();

  if (trimmedStart.includes('data:')) {
    // SSE path
    const out: string[] = [];
    for (const line of raw.split(/\r?\n/)) {
      if (!line.startsWith('data:')) continue;
      const payload = line.slice(5).trim();
      if (!payload || payload === '[DONE]') continue;
      try {
        const obj = JSON.parse(payload);
        const delta =
          obj.delta ??
          obj.content ??
          obj.text ??
          obj.content_block_delta?.text ??
          obj.choices?.[0]?.delta?.content ??
          '';
        if (typeof delta === 'string') out.push(delta);
      } catch {
        // Not JSON — treat payload as literal text
        out.push(payload);
      }
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
