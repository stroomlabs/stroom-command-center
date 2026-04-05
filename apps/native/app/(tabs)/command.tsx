import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useCommandChat, type ChatMessage } from '../../src/hooks/useCommandChat';
import supabase from '../../src/lib/supabase';
import { usePinnedMessages } from '../../src/hooks/usePinnedMessages';
import { suggestFollowups } from '../../src/lib/suggestFollowups';
import Animated, {
  FadeIn,
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
  runOnJS,
} from 'react-native-reanimated';
import { useEntityNameMap, type EntityLookup } from '../../src/hooks/useEntityNameMap';
import { useSessionHistory } from '../../src/hooks/useSessionHistory';
import { ActionSheet, type ActionSheetAction } from '../../src/components/ActionSheet';
import { SessionHistorySheet } from '../../src/components/SessionHistorySheet';
import { useBrandAlert } from '../../src/components/BrandAlert';
import { GlowSpot } from '../../src/components/GlowSpot';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import type { CommandSession } from '@stroom/types';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function CommandScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const {
    messages,
    sending,
    error,
    sessionId,
    send,
    resetSession,
    loadSession,
    deleteMessage,
    retryFrom,
  } = useCommandChat();
  const history = useSessionHistory();
  const entityLookup = useEntityNameMap();
  const { alert } = useBrandAlert();

  const handleEntityLinkPress = useCallback(
    (id: string) => {
      router.push({ pathname: '/entity/[id]', params: { id } } as any);
    },
    [router]
  );
  const [input, setInput] = useState('');
  const [slashRunning, setSlashRunning] = useState(false);
  const { pinned, pin, unpin } = usePinnedMessages();
  const [pinnedExpanded, setPinnedExpanded] = useState(false);
  const [menuTarget, setMenuTarget] = useState<ChatMessage | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  const scrollRef = useRef<ScrollView>(null);
  const consumedPromptRef = useRef<string | null>(null);

  // If navigated in with a pre-filled prompt (e.g. from entity detail), seed
  // the composer and clear the param so back-nav doesn't re-trigger it.
  useEffect(() => {
    const p = params.prompt;
    if (typeof p === 'string' && p.length > 0 && consumedPromptRef.current !== p) {
      consumedPromptRef.current = p;
      setInput(p);
      router.setParams({ prompt: undefined } as any);
    }
  }, [params.prompt, router]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages.length, messages[messages.length - 1]?.content]);

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || sending) return;
    if (text.startsWith('/')) {
      runSlashCommand(text);
      return;
    }
    Haptics.selectionAsync();
    setInput('');
    send(text);
  }, [input, sending, send, runSlashCommand]);

  // --- Slash commands ---
  const runSlashCommand = useCallback(
    async (raw: string) => {
      if (slashRunning || sending) return;
      const trimmed = raw.trim();
      if (!trimmed.startsWith('/')) return;
      const [cmd, ...rest] = trimmed.slice(1).split(/\s+/);
      const arg = rest.join(' ').trim();
      Haptics.selectionAsync();
      setSlashRunning(true);
      setInput('');
      try {
        let prompt: string;
        switch (cmd) {
          case 'health': {
            const { data } = await supabase.rpc('get_graph_health');
            prompt = [
              'Graph health snapshot (run via /health):',
              '',
              '```json',
              JSON.stringify(data ?? {}, null, 2),
              '```',
              '',
              'Summarize the current state of the graph and flag anything above warning thresholds.',
            ].join('\n');
            break;
          }
          case 'sweep': {
            const { data } = await supabase.rpc('run_governance_sweep');
            prompt = [
              'Governance sweep just executed (/sweep):',
              '',
              '```json',
              JSON.stringify(data ?? {}, null, 2),
              '```',
              '',
              'Summarize what changed and whether any policies need attention.',
            ].join('\n');
            break;
          }
          case 'entity': {
            if (!arg) {
              prompt = 'Please specify an entity name after /entity, e.g. /entity Max Verstappen';
              break;
            }
            const { data } = await supabase
              .from('entities')
              .select('id, canonical_name, entity_type, domain, description')
              .ilike('canonical_name', `%${arg}%`)
              .limit(5);
            prompt = [
              `Entity lookup for "${arg}" (/entity):`,
              '',
              '```json',
              JSON.stringify(data ?? [], null, 2),
              '```',
              '',
              'Describe the matching entities and highlight the most relevant one.',
            ].join('\n');
            break;
          }
          case 'queue': {
            const { data } = await supabase.rpc('get_command_pulse');
            const d: any = data ?? {};
            prompt = [
              'Queue summary (/queue):',
              '',
              `- Queue depth: ${d.queue_depth ?? 0}`,
              `- Total claims: ${d.total_claims ?? 0}`,
              `- Claims today: ${d.claims_today ?? 0}`,
              `- Status breakdown: ${JSON.stringify(d.status_breakdown ?? {})}`,
              '',
              'Summarize the governance backlog and suggest what to triage first.',
            ].join('\n');
            break;
          }
          default:
            prompt = `Unknown slash command: /${cmd}. Try /health, /sweep, /entity, or /queue.`;
        }
        send(prompt);
      } catch (e: any) {
        send(`Slash command /${cmd} failed: ${e?.message ?? 'unknown error'}`);
      } finally {
        setSlashRunning(false);
      }
    },
    [slashRunning, sending, send]
  );

  const slashMatches = React.useMemo(() => {
    if (!input.startsWith('/')) return null;
    const q = input.slice(1).toLowerCase();
    const cmds = [
      { key: 'health', label: '/health', desc: 'Run graph health check' },
      { key: 'sweep', label: '/sweep', desc: 'Run governance sweep' },
      { key: 'entity', label: '/entity [name]', desc: 'Look up entity by name' },
      { key: 'queue', label: '/queue', desc: 'Show queue summary' },
    ];
    const filtered = cmds.filter((c) => c.key.startsWith(q.split(' ')[0] ?? ''));
    return filtered.length > 0 ? filtered : null;
  }, [input]);

  const handleExport = useCallback(async () => {
    if (messages.length === 0) {
      alert('Nothing to export', 'Start a conversation first.');
      return;
    }
    const ts = new Date().toISOString();
    const md = [
      `# Command conversation export`,
      ``,
      `_Exported ${ts}_`,
      `_Session: ${sessionId ?? 'unsaved'}_`,
      ``,
      '---',
      ``,
      ...messages.map((m) => {
        const role = m.role === 'user' ? '**You**' : '**Claude**';
        return `### ${role}\n\n${m.content}\n`;
      }),
    ].join('\n');
    try {
      await Clipboard.setStringAsync(md);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      alert('Copied to clipboard', `${messages.length} messages exported as Markdown.`);
    } catch {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [messages, sessionId, alert]);

  const openHistory = useCallback(() => {
    Keyboard.dismiss();
    Haptics.selectionAsync();
    history.refresh();
    setHistoryVisible(true);
  }, [history]);

  const handleLoadSession = useCallback(
    (session: CommandSession) => {
      const raw = Array.isArray(session.messages) ? session.messages : [];
      const normalized = raw
        .filter((m: any) => m && typeof m.content === 'string' && (m.role === 'user' || m.role === 'assistant'))
        .map((m: any) => ({
          role: m.role as 'user' | 'assistant',
          content: m.content as string,
          timestamp: (m.timestamp as string) ?? session.updated_at,
        }));
      loadSession(session.id, normalized);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    },
    [loadSession]
  );

  const handleReset = useCallback(() => {
    Keyboard.dismiss();
    if (messages.length === 0) {
      resetSession();
      return;
    }
    alert(
      'Start new session?',
      'This will clear the current thread and rotate the session id.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'New session',
          style: 'destructive',
          onPress: () => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            resetSession();
          },
        },
      ]
    );
  }, [alert, messages.length, resetSession]);

  const copyMessage = useCallback(async (content: string) => {
    if (!content) return;
    await Clipboard.setStringAsync(content);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const showMessageMenu = useCallback((message: ChatMessage) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setMenuTarget(message);
  }, []);

  const menuActions: ActionSheetAction[] = React.useMemo(() => {
    if (!menuTarget) return [];
    const canRetry = menuTarget.role === 'assistant' && !sending;
    const alreadyPinned = pinned.some((p) => p.id === menuTarget.id);
    const actions: ActionSheetAction[] = [
      {
        label: 'Copy',
        icon: 'copy-outline',
        tone: 'accent',
        onPress: () => copyMessage(menuTarget.content),
      },
    ];
    actions.push({
      label: alreadyPinned ? 'Unpin' : 'Pin',
      icon: alreadyPinned ? 'bookmark' : 'bookmark-outline',
      tone: 'accent',
      onPress: () => {
        if (alreadyPinned) {
          unpin(menuTarget.id);
        } else {
          pin({
            id: menuTarget.id,
            role: menuTarget.role === 'user' ? 'user' : 'assistant',
            content: menuTarget.content,
            pinned_at: new Date().toISOString(),
            session_id: sessionId,
          });
        }
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
    });
    if (canRetry) {
      actions.push({
        label: 'Retry',
        icon: 'refresh',
        tone: 'accent',
        onPress: () => retryFrom(menuTarget.id),
      });
    }
    actions.push({
      label: 'Delete',
      icon: 'trash-outline',
      tone: 'destructive',
      onPress: () => {
        deleteMessage(menuTarget.id);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
      },
    });
    return actions;
  }, [
    menuTarget,
    sending,
    copyMessage,
    retryFrom,
    deleteMessage,
    pinned,
    pin,
    unpin,
    sessionId,
  ]);

  // Derive follow-up chips from the most recent completed assistant reply.
  // Hidden while streaming or when the last message is a user turn.
  const followupSuggestions = React.useMemo(() => {
    if (sending || messages.length === 0) return [];
    const last = messages[messages.length - 1];
    if (last.role !== 'assistant' || last.content.trim().length === 0) return [];
    const lastUser = [...messages]
      .reverse()
      .find((m) => m.role === 'user')?.content;
    return suggestFollowups(last.content, { lastUserMessage: lastUser });
  }, [messages, sending]);

  const showTypingIndicator =
    sending &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant' &&
    messages[messages.length - 1].content === '';

  return (
    <ScreenTransition>
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      {/* Soft teal glow behind the header */}
      <GlowSpot size={360} opacity={0.08} top={insets.top - 80} left={-80} breathe />

      <KeyboardAvoidingView
        style={styles.container}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
      >
        {/* Header */}
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <View>
            <Text style={styles.title}>Command</Text>
            <Text style={styles.subtitle}>Query the knowledge graph</Text>
          </View>
          <View style={styles.headerActions}>
            <Pressable
              onPress={openHistory}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Ionicons name="time-outline" size={20} color={colors.silver} />
            </Pressable>
            <Pressable
              onPress={handleExport}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
              accessibilityLabel="Export conversation as Markdown"
            >
              <Ionicons name="share-outline" size={20} color={colors.silver} />
            </Pressable>
            <Pressable
              onPress={handleReset}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Ionicons name="refresh" size={20} color={colors.silver} />
            </Pressable>
            <Pressable
              onPress={() => router.push('/more' as any)}
              style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
              hitSlop={8}
            >
              <Ionicons name="settings-outline" size={20} color={colors.silver} />
            </Pressable>
          </View>
        </View>

        {/* Messages */}
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Pinned context */}
          {pinned.length > 0 && (
            <View style={styles.pinnedCard}>
              <Pressable
                onPress={() => setPinnedExpanded((v) => !v)}
                style={({ pressed }) => [
                  styles.pinnedHeader,
                  pressed && { opacity: 0.7 },
                ]}
              >
                <Ionicons name="bookmark" size={12} color={colors.teal} />
                <Text style={styles.pinnedHeaderText}>
                  PINNED · {pinned.length}
                </Text>
                <View style={{ flex: 1 }} />
                <Ionicons
                  name={pinnedExpanded ? 'chevron-up' : 'chevron-down'}
                  size={14}
                  color={colors.slate}
                />
              </Pressable>
              {pinnedExpanded && (
                <View style={styles.pinnedList}>
                  {pinned.map((p) => (
                    <View key={p.id} style={styles.pinnedRow}>
                      <Text style={styles.pinnedRole}>
                        {p.role === 'user' ? 'YOU' : 'CLAUDE'}
                      </Text>
                      <Text
                        style={styles.pinnedContent}
                        numberOfLines={3}
                      >
                        {p.content}
                      </Text>
                      <Pressable
                        onPress={() => unpin(p.id)}
                        hitSlop={8}
                        style={({ pressed }) => [
                          pressed && { opacity: 0.6 },
                        ]}
                      >
                        <Ionicons
                          name="close"
                          size={14}
                          color={colors.slate}
                        />
                      </Pressable>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {messages.length === 0 && !sending && (
            <EmptyState
              onSuggest={(prompt) => {
                Haptics.selectionAsync();
                send(prompt);
              }}
            />
          )}

          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            return (
              <MessageBubble
                key={msg.id}
                message={msg}
                showTyping={showTypingIndicator && isLast}
                streaming={
                  sending &&
                  isLast &&
                  msg.role === 'assistant' &&
                  msg.content.length > 0
                }
                onCopy={() => copyMessage(msg.content)}
                onLongPress={() => showMessageMenu(msg)}
                entityLookup={entityLookup}
                onEntityPress={handleEntityLinkPress}
              />
            );
          })}

          {followupSuggestions.length > 0 && (
            <View style={styles.followupRow}>
              {followupSuggestions.map((s) => (
                <Pressable
                  key={s.kind + s.label}
                  onPress={() => {
                    Haptics.selectionAsync();
                    send(s.prompt);
                  }}
                  style={({ pressed }) => [
                    styles.followupChip,
                    pressed && {
                      opacity: 0.75,
                      transform: [{ scale: 0.97 }],
                    },
                  ]}
                >
                  <Ionicons name="arrow-forward" size={11} color={colors.teal} />
                  <Text style={styles.followupChipText}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          )}

          {error && (
            <View style={styles.errorBubble}>
              <Ionicons name="warning-outline" size={14} color={colors.statusReject} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

        {/* Slash command suggestions */}
        {slashMatches && (
          <View style={styles.slashMenu}>
            {slashMatches.map((s) => (
              <Pressable
                key={s.key}
                onPress={() => {
                  if (s.key === 'entity') {
                    setInput('/entity ');
                  } else {
                    runSlashCommand(`/${s.key}`);
                  }
                }}
                style={({ pressed }) => [
                  styles.slashRow,
                  pressed && { backgroundColor: 'rgba(0,161,155,0.08)' },
                ]}
              >
                <Text style={styles.slashLabel}>{s.label}</Text>
                <Text style={styles.slashDesc}>{s.desc}</Text>
              </Pressable>
            ))}
          </View>
        )}

        {/* Composer */}
        <View
          style={[
            styles.composer,
            { paddingBottom: Math.max(insets.bottom, spacing.md) },
          ]}
        >
          <View style={styles.inputWrap}>
            <TextInput
              value={input}
              onChangeText={setInput}
              placeholder="Ask about claims, entities, sources…"
              placeholderTextColor={colors.slate}
              style={styles.input}
              multiline
              maxLength={4000}
              editable={!sending}
              returnKeyType="send"
              blurOnSubmit={false}
              onSubmitEditing={handleSend}
            />
            <Pressable
              onPress={handleSend}
              disabled={!input.trim() || sending}
              style={({ pressed }) => [
                styles.sendBtn,
                (!input.trim() || sending) && styles.sendBtnDisabled,
                pressed && input.trim() && !sending && styles.sendBtnPressed,
              ]}
            >
              {sending ? (
                <ActivityIndicator size="small" color={colors.obsidian} />
              ) : (
                <Ionicons
                  name="arrow-up"
                  size={20}
                  color={input.trim() ? colors.obsidian : colors.slate}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ActionSheet
        visible={menuTarget !== null}
        title="Message"
        subtitle={menuTarget?.role === 'assistant' ? 'Assistant reply' : 'Your message'}
        actions={menuActions}
        onDismiss={() => setMenuTarget(null)}
      />

      <SessionHistorySheet
        visible={historyVisible}
        sessions={history.sessions}
        loading={history.loading}
        error={history.error}
        currentSessionId={sessionId}
        onSelect={handleLoadSession}
        onDismiss={() => setHistoryVisible(false)}
      />
    </LinearGradient>
    </ScreenTransition>
  );
}

const SUGGESTED_PROMPTS = [
  'Graph health check',
  'What needs review?',
  'Coverage gaps report',
  'Source reliability audit',
] as const;

function EmptyState({ onSuggest }: { onSuggest: (prompt: string) => void }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name="sparkles-outline" size={28} color={colors.teal} />
      </View>
      <Text style={styles.emptyTitle}>Command the Graph</Text>
      <Text style={styles.emptyBody}>
        Ask Claude to surface claims, trace sources, compare entities, or
        explain contradictions in the StroomHelix intelligence graph.
      </Text>
      <View style={styles.suggestions}>
        {SUGGESTED_PROMPTS.map((prompt) => (
          <Suggestion key={prompt} text={prompt} onPress={() => onSuggest(prompt)} />
        ))}
      </View>
    </View>
  );
}

function Suggestion({
  text,
  onPress,
}: {
  text: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.suggestion, pressed && { opacity: 0.7 }]}
    >
      <Ionicons name="arrow-forward" size={12} color={colors.teal} />
      <Text style={styles.suggestionText}>{text}</Text>
    </Pressable>
  );
}

// Thin blinking teal cursor shown at the end of the assistant bubble.
// While `active`, opacity oscillates 1 ↔ 0.2 on a 1s cycle. When the
// parent flips `active` to false the cursor eases opacity to 0 over
// 240ms, then unmounts via the local `mounted` state — no instant pop.
function StreamingCursor({ active }: { active: boolean }) {
  const opacity = useSharedValue(active ? 1 : 0);
  const [mounted, setMounted] = React.useState(active);

  React.useEffect(() => {
    if (active) {
      setMounted(true);
      // Cancel any pending fade-out and restart the blink loop.
      cancelAnimation(opacity);
      opacity.value = 1;
      opacity.value = withRepeat(
        withSequence(
          withTiming(0.2, { duration: 500, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 500, easing: Easing.inOut(Easing.ease) })
        ),
        -1,
        false
      );
    } else {
      cancelAnimation(opacity);
      opacity.value = withTiming(
        0,
        { duration: 240, easing: Easing.out(Easing.ease) },
        (done) => {
          if (done) runOnJS(setMounted)(false);
        }
      );
    }
  }, [active, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!mounted) return null;
  return <Animated.View style={[styles.streamCursor, style]} />;
}

interface MessageBubbleProps {
  message: ChatMessage;
  showTyping: boolean;
  streaming: boolean;
  onCopy: () => void;
  onLongPress: () => void;
  entityLookup: EntityLookup | null;
  onEntityPress: (id: string) => void;
}

function MessageBubble({
  message,
  showTyping,
  streaming,
  onCopy,
  onLongPress,
  entityLookup,
  onEntityPress,
}: MessageBubbleProps) {
  const isUser = message.role === 'user';

  if (showTyping && !message.content) {
    return (
      <View style={[styles.bubbleRow, styles.assistantRow]}>
        <View style={[styles.bubble, styles.assistantBubble]}>
          <TypingDots />
        </View>
      </View>
    );
  }

  // Tap-to-copy applies to assistant messages only; long-press works for both.
  const handlePress = !isUser && message.content ? onCopy : undefined;

  return (
    <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.assistantRow]}>
      <Pressable
        onPress={handlePress}
        onLongPress={message.content ? onLongPress : undefined}
        delayLongPress={350}
        style={({ pressed }) => [
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
          pressed && handlePress && styles.bubblePressed,
        ]}
      >
        <RichContent
          content={message.content}
          isUser={isUser}
          entityLookup={entityLookup}
          onEntityPress={onEntityPress}
        />
        {!isUser && <StreamingCursor active={streaming} />}
      </Pressable>
    </View>
  );
}

// Markdown renderer for assistant messages — supports headers (# ## ###),
// bold (**text**), inline code (`code`), fenced code blocks (```), and
// bullet lists (-/*). User messages render as plain text.
function RichContent({
  content,
  isUser,
  entityLookup,
  onEntityPress,
}: {
  content: string;
  isUser: boolean;
  entityLookup: EntityLookup | null;
  onEntityPress: (id: string) => void;
}) {
  if (isUser) {
    return <Text style={styles.userText}>{content}</Text>;
  }
  return <>{renderMarkdownBlocks(content, entityLookup, onEntityPress)}</>;
}

type Block =
  | { kind: 'code'; text: string }
  | { kind: 'heading'; level: 1 | 2 | 3; text: string }
  | { kind: 'list'; items: string[] }
  | { kind: 'paragraph'; text: string };

function parseMarkdown(src: string): Block[] {
  const blocks: Block[] = [];
  const lines = src.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Fenced code block
    const fence = line.match(/^```(\w*)\s*$/);
    if (fence) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        codeLines.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // consume closing fence
      blocks.push({ kind: 'code', text: codeLines.join('\n') });
      continue;
    }

    // Heading
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      const level = heading[1].length as 1 | 2 | 3;
      blocks.push({ kind: 'heading', level, text: heading[2] });
      i++;
      continue;
    }

    // Bullet list
    if (/^\s*[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ''));
        i++;
      }
      blocks.push({ kind: 'list', items });
      continue;
    }

    // Blank line — separator
    if (line.trim() === '') {
      i++;
      continue;
    }

    // Paragraph — collect consecutive non-blank, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== '' &&
      !/^```/.test(lines[i]) &&
      !/^#{1,3}\s+/.test(lines[i]) &&
      !/^\s*[-*]\s+/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ kind: 'paragraph', text: paraLines.join(' ') });
    }
  }

  return blocks;
}

function renderMarkdownBlocks(
  src: string,
  entityLookup: EntityLookup | null,
  onEntityPress: (id: string) => void
): React.ReactNode[] {
  const blocks = parseMarkdown(src);
  // Each block is wrapped in an Animated.View with FadeIn entering so newly
  // streamed blocks gently appear. Existing blocks keep their index key and
  // re-render without re-mounting, so only the tail-most block fades in.
  const lineFade = FadeIn.duration(180);
  return blocks.map((block, idx) => {
    switch (block.kind) {
      case 'code':
        return (
          <Animated.View key={idx} entering={lineFade} style={styles.codeBlock}>
            <Text style={styles.codeText}>{block.text}</Text>
          </Animated.View>
        );
      case 'heading': {
        const style =
          block.level === 1
            ? styles.h1
            : block.level === 2
            ? styles.h2
            : styles.h3;
        return (
          <Animated.View key={idx} entering={lineFade}>
            <Text style={style}>
              {renderInline(block.text, entityLookup, onEntityPress)}
            </Text>
          </Animated.View>
        );
      }
      case 'list':
        return (
          <Animated.View key={idx} entering={lineFade} style={styles.list}>
            {block.items.map((item, j) => (
              <View key={j} style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.assistantText}>
                  {renderInline(item, entityLookup, onEntityPress)}
                </Text>
              </View>
            ))}
          </Animated.View>
        );
      case 'paragraph':
      default:
        return (
          <Animated.View key={idx} entering={lineFade}>
            <Text style={styles.assistantText}>
              {renderInline(block.text, entityLookup, onEntityPress)}
            </Text>
          </Animated.View>
        );
    }
  });
}

// Inline parser: **bold**, `code`, and (after extraction) entity links in plain text runs.
function renderInline(
  text: string,
  entityLookup: EntityLookup | null,
  onEntityPress: (id: string) => void
): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  const pushText = (segment: string) => {
    const linked = linkifyEntities(segment, entityLookup, onEntityPress, key);
    key += linked.consumed;
    for (const node of linked.nodes) tokens.push(node);
  };

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      pushText(text.slice(lastIndex, match.index));
    }
    const token = match[0];
    if (token.startsWith('**')) {
      tokens.push(
        <Text key={`b${key++}`} style={styles.bold}>
          {token.slice(2, -2)}
        </Text>
      );
    } else {
      tokens.push(
        <Text key={`c${key++}`} style={styles.inlineCode}>
          {token.slice(1, -1)}
        </Text>
      );
    }
    lastIndex = match.index + token.length;
  }
  if (lastIndex < text.length) {
    pushText(text.slice(lastIndex));
  }
  return tokens;
}

// Walks a plain-text segment looking for entity name substrings (case-insensitive,
// longest-first). Splits it into literal text and tappable teal entity spans.
function linkifyEntities(
  segment: string,
  lookup: EntityLookup | null,
  onEntityPress: (id: string) => void,
  startKey: number
): { nodes: React.ReactNode[]; consumed: number } {
  if (!lookup || lookup.sortedNames.length === 0 || !segment) {
    return { nodes: segment ? [segment] : [], consumed: 0 };
  }

  const lower = segment.toLowerCase();
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  let key = startKey;

  while (cursor < segment.length) {
    // Find the earliest match of any name at position >= cursor
    let bestIdx = -1;
    let bestLen = 0;
    let bestId: string | null = null;
    for (const name of lookup.sortedNames) {
      const idx = lower.indexOf(name, cursor);
      if (idx < 0) continue;
      // Ensure word boundary-ish: char before and after must not be a letter/digit
      const before = idx === 0 ? '' : segment[idx - 1];
      const after = idx + name.length >= segment.length ? '' : segment[idx + name.length];
      const isWord = (c: string) => /[A-Za-z0-9]/.test(c);
      if (before && isWord(before)) continue;
      if (after && isWord(after)) continue;
      if (bestIdx === -1 || idx < bestIdx || (idx === bestIdx && name.length > bestLen)) {
        bestIdx = idx;
        bestLen = name.length;
        bestId = lookup.map.get(name) ?? null;
      }
    }

    if (bestIdx === -1 || !bestId) {
      nodes.push(segment.slice(cursor));
      break;
    }

    if (bestIdx > cursor) {
      nodes.push(segment.slice(cursor, bestIdx));
    }
    const display = segment.slice(bestIdx, bestIdx + bestLen);
    const targetId = bestId;
    nodes.push(
      <Text
        key={`e${key++}`}
        style={styles.entityLink}
        onPress={() => onEntityPress(targetId)}
        suppressHighlighting
      >
        {display}
      </Text>
    );
    cursor = bestIdx + bestLen;
  }

  return { nodes, consumed: key - startKey };
}

function TypingDots() {
  const [tick, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t) => (t + 1) % 3), 400);
    return () => clearInterval(id);
  }, []);
  return (
    <View style={styles.typingWrap}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[styles.typingDot, tick === i && styles.typingDotActive]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.alabaster,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    marginTop: 4,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    justifyContent: 'center',
    alignItems: 'center',
  },
  messages: { flex: 1 },
  messagesContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  empty: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  emptyIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  emptyTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 20,
    color: colors.alabaster,
    letterSpacing: -0.4,
  },
  emptyBody: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    textAlign: 'center',
    lineHeight: 19,
    marginBottom: spacing.md,
  },
  suggestions: {
    width: '100%',
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
  },
  suggestionText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.silver,
  },
  bubbleRow: {
    flexDirection: 'row',
  },
  userRow: { justifyContent: 'flex-end' },
  assistantRow: { justifyContent: 'flex-start' },
  bubble: {
    maxWidth: '85%',
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
  },
  userBubble: {
    backgroundColor: 'rgba(0, 161, 155, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    borderBottomRightRadius: 4,
  },
  assistantBubble: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderBottomLeftRadius: 4,
  },
  followupRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
    marginTop: -spacing.xs,
    marginBottom: spacing.md,
    paddingHorizontal: 2,
  },
  followupChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  followupChipText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.teal,
  },
  pinnedCard: {
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    borderRadius: radius.md,
    marginBottom: spacing.md,
    overflow: 'hidden',
  },
  pinnedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  pinnedHeaderText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.teal,
    letterSpacing: 1,
  },
  pinnedList: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  pinnedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
  },
  pinnedRole: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    color: colors.teal,
    letterSpacing: 0.8,
    width: 52,
  },
  pinnedContent: {
    flex: 1,
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.silver,
    lineHeight: 16,
  },
  streamCursor: {
    width: 2,
    height: 14,
    backgroundColor: colors.teal,
    marginTop: 4,
    borderRadius: 1,
  },
  bubblePressed: {
    opacity: 0.7,
  },
  userText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 15,
    color: colors.alabaster,
    lineHeight: 21,
  },
  assistantText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 15,
    color: colors.silver,
    lineHeight: 21,
  },
  h1: {
    fontFamily: fonts.archivo.bold,
    fontSize: 20,
    color: colors.alabaster,
    letterSpacing: -0.4,
    marginTop: 4,
    marginBottom: 4,
  },
  h2: {
    fontFamily: fonts.archivo.bold,
    fontSize: 17,
    color: colors.alabaster,
    letterSpacing: -0.3,
    marginTop: 4,
    marginBottom: 2,
  },
  h3: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.alabaster,
    marginTop: 2,
    marginBottom: 2,
  },
  bold: {
    fontFamily: fonts.archivo.bold,
    color: colors.alabaster,
  },
  inlineCode: {
    fontFamily: fonts.mono.regular,
    fontSize: 13,
    color: colors.teal,
    backgroundColor: 'rgba(0, 161, 155, 0.1)',
  },
  entityLink: {
    color: colors.teal,
    textDecorationLine: 'underline',
    textDecorationColor: 'rgba(0, 161, 155, 0.4)',
  },
  list: {
    gap: 3,
    marginVertical: 2,
  },
  listItem: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingLeft: 2,
  },
  bullet: {
    fontFamily: fonts.archivo.regular,
    fontSize: 15,
    color: colors.teal,
    lineHeight: 21,
  },
  codeBlock: {
    backgroundColor: colors.obsidian,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    marginVertical: 6,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  codeText: {
    fontFamily: fonts.mono.regular,
    fontSize: 12,
    color: colors.alabaster,
    lineHeight: 17,
  },
  typingWrap: {
    flexDirection: 'row',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.slate,
  },
  typingDotActive: {
    backgroundColor: colors.teal,
  },
  errorBubble: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.statusReject,
    flex: 1,
  },
  slashMenu: {
    marginHorizontal: spacing.lg,
    marginBottom: 6,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  slashRow: {
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  slashLabel: {
    fontFamily: fonts.mono.semibold,
    fontSize: 13,
    color: colors.teal,
  },
  slashDesc: {
    fontFamily: fonts.archivo.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  composer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
    backgroundColor: colors.obsidian,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    paddingLeft: spacing.md,
    paddingRight: 6,
    paddingVertical: 6,
  },
  input: {
    flex: 1,
    fontFamily: fonts.archivo.regular,
    fontSize: 15,
    color: colors.alabaster,
    maxHeight: 120,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.teal,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnDisabled: {
    backgroundColor: colors.surfaceCard,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  sendBtnPressed: {
    opacity: 0.8,
  },
});
