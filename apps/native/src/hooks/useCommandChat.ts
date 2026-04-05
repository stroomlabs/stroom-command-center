import { useCallback, useEffect, useRef, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@stroom/supabase';
import supabase from '../lib/supabase';

export type ChatRole = 'user' | 'assistant' | 'system';

export interface ChatMessage {
  role: ChatRole;
  content: string;
  timestamp: string;
}

const SESSION_KEY = 'stroom.command.session_id';
const ENDPOINT = `${SUPABASE_URL}/functions/v1/command-chat`;

function makeSessionId(): string {
  // RFC4122-ish; good enough for client session id
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
        id = makeSessionId();
        await AsyncStorage.setItem(SESSION_KEY, id);
      }
      setSessionId(id);
    })();
  }, []);

  const resetSession = useCallback(async () => {
    const id = makeSessionId();
    await AsyncStorage.setItem(SESSION_KEY, id);
    setSessionId(id);
    setMessages([]);
    setError(null);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending || !sessionId) return;

      setError(null);
      const userMsg: ChatMessage = {
        role: 'user',
        content: trimmed,
        timestamp: new Date().toISOString(),
      };
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };

      const nextMessages = [...messages, userMsg];
      setMessages([...nextMessages, assistantMsg]);
      setSending(true);

      try {
        const { data: sess } = await supabase.auth.getSession();
        const accessToken = sess?.session?.access_token ?? SUPABASE_ANON_KEY;

        const body = JSON.stringify({
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          session_id: sessionId,
        });

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;
          xhr.open('POST', ENDPOINT);
          xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
          xhr.setRequestHeader('apikey', SUPABASE_ANON_KEY);
          xhr.setRequestHeader('Content-Type', 'application/json');

          xhr.onprogress = () => {
            // responseText is cumulative — replace the trailing assistant message each time
            const text = parseStreamText(xhr.responseText);
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy[copy.length - 1];
              if (last?.role === 'assistant') {
                copy[copy.length - 1] = { ...last, content: text };
              }
              return copy;
            });
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              const finalText = parseStreamText(xhr.responseText);
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last?.role === 'assistant') {
                  copy[copy.length - 1] = { ...last, content: finalText };
                }
                return copy;
              });
              resolve();
            } else {
              reject(new Error(`HTTP ${xhr.status}: ${xhr.responseText || 'Request failed'}`));
            }
          };

          xhr.onerror = () => reject(new Error('Network error contacting command-chat'));
          xhr.ontimeout = () => reject(new Error('Request timed out'));
          xhr.timeout = 120_000;

          xhr.send(body);
        });
      } catch (e: any) {
        setError(e.message ?? 'Send failed');
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
    [messages, sending, sessionId]
  );

  const cancel = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
    setSending(false);
  }, []);

  return { messages, sending, error, sessionId, send, cancel, resetSession };
}

// Accept either plain text stream or SSE (`data: {...}\n\n`). Reconstruct
// plain text either way so the UI renders progressively.
function parseStreamText(raw: string): string {
  if (!raw) return '';
  if (!raw.includes('data:')) return raw;

  const out: string[] = [];
  for (const line of raw.split(/\r?\n/)) {
    if (!line.startsWith('data:')) continue;
    const payload = line.slice(5).trim();
    if (!payload || payload === '[DONE]') continue;
    try {
      const obj = JSON.parse(payload);
      // Common shapes: {delta: "text"}, {content: "text"}, {text: "text"}
      const delta = obj.delta ?? obj.content ?? obj.text ?? '';
      if (typeof delta === 'string') out.push(delta);
    } catch {
      out.push(payload);
    }
  }
  return out.join('');
}
