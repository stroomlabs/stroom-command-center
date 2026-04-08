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
import { useNavigation, useRouter, useLocalSearchParams } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useCommandChat, type ChatMessage, type SaveState } from '../../src/hooks/useCommandChat';
import supabase from '../../src/lib/supabase';
import { usePinnedMessages } from '../../src/hooks/usePinnedMessages';
import { useMorningBriefing } from '../../src/hooks/useMorningBriefing';
import { suggestFollowups } from '../../src/lib/suggestFollowups';
import { EmptyState as SharedEmptyState } from '../../src/components/EmptyState';
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
import { useBrandToast } from '../../src/components/BrandToast';
import { usePulseContext } from '../../src/lib/PulseContext';
import { useOfflineSync } from '../../src/lib/OfflineSyncContext';
import { GlowSpot } from '../../src/components/GlowSpot';
import { BackgroundCanvas } from '../../src/components/BackgroundCanvas';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import type { CommandSession } from '@stroom/types';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function CommandScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ prompt?: string }>();
  const { data: pulse } = usePulseContext();
  const { isOnline } = useOfflineSync();

  React.useEffect(() => {
    const unsub = (navigation as any).addListener?.('tabPress', () => {
      if ((navigation as any).isFocused?.()) {
        scrollRef.current?.scrollTo({ y: 0, animated: true });
      }
    });
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation]);
  const {
    messages,
    sending,
    error,
    sessionId,
    saveState,
    lastSavedAt,
    send,
    resetSession,
    loadSession,
    deleteMessage,
    retryFrom,
  } = useCommandChat();
  const history = useSessionHistory();
  const entityLookup = useEntityNameMap();
  const { alert } = useBrandAlert();
  const { show: showToast } = useBrandToast();

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
  // Auto-generate a morning briefing when the chat is empty + >6h since
  // last one. Rendered as a synthetic assistant bubble above the real
  // messages list, never persisted.
  const { briefing } = useMorningBriefing(messages.length === 0 && !sending);
  const [menuTarget, setMenuTarget] = useState<ChatMessage | null>(null);
  const [historyVisible, setHistoryVisible] = useState(false);
  // Session search — search icon in the header toggles an inline search
  // bar at the top of the chat. While a query is active, the chat is
  // replaced with a filtered list of past sessions whose messages match.
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearchQuery(searchQuery), 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const filteredSessions = React.useMemo(() => {
    const q = debouncedSearchQuery.trim().toLowerCase();
    if (!q) return [];
    return (history.sessions ?? []).filter((s: any) => {
      const msgs = Array.isArray(s.messages) ? s.messages : [];
      for (const m of msgs) {
        const c = String(m?.content ?? '').toLowerCase();
        if (c.includes(q)) return true;
      }
      if (String(s.title ?? '').toLowerCase().includes(q)) return true;
      return false;
    });
  }, [debouncedSearchQuery, history.sessions]);

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

  // Scroll pin tracking — the list stays pinned to the bottom while the
  // user is within ~100px of the end. As soon as they scroll further up we
  // stop auto-scrolling and surface a "New messages" pill so incoming
  // assistant content doesn't yank the viewport away from them.
  const [isPinned, setIsPinned] = React.useState(true);
  const contentHeightRef = React.useRef(0);
  const scrollViewHeightRef = React.useRef(0);

  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      const distanceFromBottom =
        contentHeightRef.current - (y + scrollViewHeightRef.current);
      const nowPinned = distanceFromBottom < 100;
      setIsPinned((prev) => (prev === nowPinned ? prev : nowPinned));
    },
    []
  );

  const scrollToBottom = useCallback((animated = true) => {
    scrollRef.current?.scrollToEnd({ animated });
    setIsPinned(true);
  }, []);

  // Auto-scroll to bottom on new messages, but only when the list is
  // currently pinned to the end — otherwise respect the operator's scroll.
  useEffect(() => {
    if (!isPinned) return;
    const t = setTimeout(() => {
      scrollRef.current?.scrollToEnd({ animated: true });
    }, 50);
    return () => clearTimeout(t);
  }, [messages.length, messages[messages.length - 1]?.content, isPinned]);

  // When the keyboard opens, always drop back to the bottom so the input
  // field sits directly above the latest message.
  useEffect(() => {
    const sub = Keyboard.addListener('keyboardDidShow', () => {
      scrollRef.current?.scrollToEnd({ animated: true });
      setIsPinned(true);
    });
    return () => sub.remove();
  }, []);

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
    // Always snap to bottom when the operator submits — overrides any
    // prior scroll-up state.
    setIsPinned(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
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
            const { data } = await supabase.schema('intel').rpc('get_graph_health');
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
            const { data } = await supabase.schema('intel').rpc('run_governance_sweep');
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
              .schema('intel')
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
            const { data } = await supabase.schema('intel').rpc('get_command_pulse');
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
          case 'stale': {
            // Fetch predicate freshness rules then find claims older than
            // their predicate's freshness window, ordered by staleness.
            const { data: registry } = await supabase
              .schema('intel')
              .from('predicate_registry')
              .select('predicate_key, freshness_days');
            const freshMap = new Map<string, number>();
            for (const r of (registry ?? []) as Array<{
              predicate_key: string;
              freshness_days: number | null;
            }>) {
              if (r.freshness_days != null && r.freshness_days > 0) {
                freshMap.set(r.predicate_key, r.freshness_days);
              }
            }
            const predicateKeys = Array.from(freshMap.keys());
            if (predicateKeys.length === 0) {
              prompt = 'No predicate freshness rules configured in the registry.';
              break;
            }
            const { data: staleClaims } = await supabase
              .schema('intel')
              .from('claims')
              .select(
                'id, predicate, created_at, subject_entity:entities!claims_subject_entity_id_fkey(canonical_name)'
              )
              .in('predicate', predicateKeys)
              .in('status', ['published', 'approved'])
              .order('created_at', { ascending: true })
              .limit(50);
            const now = Date.now();
            const staleRows = ((staleClaims ?? []) as any[])
              .filter((c) => {
                const days = freshMap.get(c.predicate);
                if (!days) return false;
                return now - new Date(c.created_at).getTime() > days * 86_400_000;
              })
              .slice(0, 10);
            const lines = staleRows.map((c, i) => {
              const ageDays = Math.floor(
                (now - new Date(c.created_at).getTime()) / 86_400_000
              );
              const name = c.subject_entity?.canonical_name ?? 'Unknown';
              const pred = (c.predicate ?? '').split('.').pop()?.replace(/_/g, ' ') ?? c.predicate;
              const threshold = freshMap.get(c.predicate) ?? '?';
              return `${i + 1}. **${name}** — ${pred} — ${ageDays}d old (threshold: ${threshold}d)`;
            });
            prompt = [
              'Stale claims report (/stale):',
              '',
              lines.length > 0 ? lines.join('\n') : 'No stale claims found.',
              '',
              'Analyze these stale claims and suggest which predicates to prioritize for refresh.',
            ].join('\n');
            break;
          }
          case 'coverage': {
            if (!arg) {
              prompt = 'Please specify an entity name, e.g. /coverage Max Verstappen';
              break;
            }
            const { data: entities } = await supabase
              .schema('intel')
              .from('entities')
              .select('id, canonical_name, entity_type, domain')
              .ilike('canonical_name', `%${arg}%`)
              .limit(1);
            const ent = (entities as any[])?.[0];
            if (!ent) {
              prompt = `No entity found matching "${arg}".`;
              break;
            }
            const { data: entClaims } = await supabase
              .schema('intel')
              .from('claims')
              .select('predicate, status, created_at, confidence_score, corroboration_score')
              .eq('subject_entity_id', ent.id);
            const claimList = (entClaims ?? []) as any[];
            const predCounts = new Map<string, number>();
            const predCategories = new Set<string>();
            let staleCount = 0;
            for (const c of claimList) {
              const p = c.predicate ?? 'unknown';
              predCounts.set(p, (predCounts.get(p) ?? 0) + 1);
              predCategories.add(p.includes('.') ? p.split('.')[0] : 'other');
            }
            const topPreds = Array.from(predCounts.entries())
              .sort(([, a], [, b]) => b - a)
              .slice(0, 10)
              .map(([k, v]) => `  - ${k.split('.').pop()?.replace(/_/g, ' ')}: ${v}`);
            const published = claimList.filter((c) => c.status === 'published').length;
            const corroborated = claimList.filter(
              (c) => (c.corroboration_score ?? 0) >= 1
            ).length;
            const coverageScore = Math.round(
              ((Math.min(1, claimList.length / 10) +
                Math.min(1, predCategories.size / 5) +
                (claimList.length > 0 ? corroborated / claimList.length : 0)) /
                3) *
                100
            );
            prompt = [
              `Coverage report for **${ent.canonical_name}** (/coverage):`,
              '',
              `- Type: ${ent.entity_type ?? 'unknown'}`,
              `- Domain: ${ent.domain ?? 'none'}`,
              `- Coverage score: **${coverageScore}%**`,
              `- Total claims: ${claimList.length}`,
              `- Published: ${published}`,
              `- Corroborated: ${corroborated}`,
              `- Stale: ${staleCount}`,
              `- Predicate families: ${predCategories.size}`,
              '',
              'Top predicates:',
              topPreds.join('\n'),
              '',
              'Identify coverage gaps and suggest which predicate families are missing.',
            ].join('\n');
            break;
          }
          case 'compare': {
            const vsMatch = arg.match(/^(.+?)\s+vs\.?\s+(.+)$/i);
            if (!vsMatch) {
              prompt = 'Usage: /compare Entity A vs Entity B';
              break;
            }
            const [, nameA, nameB] = vsMatch;
            const [{ data: entsA }, { data: entsB }] = await Promise.all([
              supabase
                .schema('intel')
                .from('entities')
                .select('id, canonical_name, entity_type, domain')
                .ilike('canonical_name', `%${nameA.trim()}%`)
                .limit(1),
              supabase
                .schema('intel')
                .from('entities')
                .select('id, canonical_name, entity_type, domain')
                .ilike('canonical_name', `%${nameB.trim()}%`)
                .limit(1),
            ]);
            const eA = (entsA as any[])?.[0];
            const eB = (entsB as any[])?.[0];
            if (!eA || !eB) {
              prompt = `Could not find both entities. Found: ${eA?.canonical_name ?? 'none'}, ${eB?.canonical_name ?? 'none'}`;
              break;
            }
            const [{ data: claimsA }, { data: claimsB }] = await Promise.all([
              supabase
                .schema('intel')
                .from('claims')
                .select('predicate, status, corroboration_score')
                .eq('subject_entity_id', eA.id),
              supabase
                .schema('intel')
                .from('claims')
                .select('predicate, status, corroboration_score')
                .eq('subject_entity_id', eB.id),
            ]);
            const predsA = new Set(((claimsA ?? []) as any[]).map((c) => c.predicate).filter(Boolean));
            const predsB = new Set(((claimsB ?? []) as any[]).map((c) => c.predicate).filter(Boolean));
            const shared = Array.from(predsA).filter((p) => predsB.has(p));
            const uniqueA = Array.from(predsA).filter((p) => !predsB.has(p));
            const uniqueB = Array.from(predsB).filter((p) => !predsA.has(p));
            const fmt = (p: string) => p.split('.').pop()?.replace(/_/g, ' ') ?? p;
            prompt = [
              `Comparison: **${eA.canonical_name}** vs **${eB.canonical_name}** (/compare):`,
              '',
              `| | ${eA.canonical_name} | ${eB.canonical_name} |`,
              '|---|---|---|',
              `| Claims | ${(claimsA ?? []).length} | ${(claimsB ?? []).length} |`,
              `| Published | ${((claimsA ?? []) as any[]).filter((c) => c.status === 'published').length} | ${((claimsB ?? []) as any[]).filter((c) => c.status === 'published').length} |`,
              `| Predicates | ${predsA.size} | ${predsB.size} |`,
              '',
              `**Shared predicates** (${shared.length}): ${shared.slice(0, 8).map(fmt).join(', ') || 'none'}`,
              `**Unique to ${eA.canonical_name}** (${uniqueA.length}): ${uniqueA.slice(0, 8).map(fmt).join(', ') || 'none'}`,
              `**Unique to ${eB.canonical_name}** (${uniqueB.length}): ${uniqueB.slice(0, 8).map(fmt).join(', ') || 'none'}`,
              '',
              'Analyze the comparison and highlight notable differences in coverage.',
            ].join('\n');
            break;
          }
          default:
            prompt = `Unknown slash command: /${cmd}. Try /health, /sweep, /entity, /queue, /stale, /coverage, or /compare.`;
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
      { key: 'stale', label: '/stale', desc: 'Top 10 stalest claims report' },
      { key: 'coverage', label: '/coverage [name]', desc: 'Entity coverage breakdown' },
      { key: 'compare', label: '/compare A vs B', desc: 'Side-by-side entity comparison' },
    ];
    const filtered = cmds.filter((c) => c.key.startsWith(q.split(' ')[0] ?? ''));
    return filtered.length > 0 ? filtered : null;
  }, [input]);

  // Predicate autocomplete — triggered when input contains a period-separated
  // word pattern (e.g. "economics." or "performance.lap"). Queries the
  // predicate_registry for matching keys and shows a compact dropdown.
  const predicateQuery = React.useMemo(() => {
    const match = input.match(/\b(\w+\.\w*)\s*$/);
    return match ? match[1] : null;
  }, [input]);

  const [predicateResults, setPredicateResults] = useState<
    Array<{ predicate_key: string; display_name: string }>
  >([]);

  useEffect(() => {
    if (!predicateQuery || predicateQuery.length < 3) {
      setPredicateResults([]);
      return;
    }
    let cancelled = false;
    supabase
      .schema('intel')
      .from('predicate_registry')
      .select('predicate_key, display_name')
      .ilike('predicate_key', `%${predicateQuery}%`)
      .limit(8)
      .then(({ data }) => {
        if (!cancelled && data) {
          setPredicateResults(
            data as Array<{ predicate_key: string; display_name: string }>
          );
        }
      });
    return () => { cancelled = true; };
  }, [predicateQuery]);

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
    <View style={styles.container}>
      <BackgroundCanvas />

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
          <View style={styles.headerRight}>
            <View style={styles.headerActions}>
              <Pressable
                onPress={() => {
                  Haptics.selectionAsync();
                  setSearchOpen((prev) => {
                    const next = !prev;
                    if (next) history.refresh();
                    else {
                      setSearchQuery('');
                      setDebouncedSearchQuery('');
                    }
                    return next;
                  });
                }}
                style={({ pressed }) => [
                  styles.iconBtn,
                  searchOpen && styles.iconBtnActive,
                  pressed && { opacity: 0.6 },
                ]}
                hitSlop={8}
                accessibilityLabel="Search sessions"
              >
                <Ionicons
                  name="search"
                  size={20}
                  color={searchOpen ? colors.teal : colors.silver}
                />
              </Pressable>
              <Pressable
                onPress={openHistory}
                style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.6 }]}
                hitSlop={8}
                accessibilityLabel="Open session history"
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
            {/* Session indicator — rendered below the icon row so it doesn't
                stretch any of the icon buttons. Tappable for the save-state toast. */}
            <Pressable
              onPress={() => {
                Haptics.selectionAsync();
                const effectiveState: SaveState =
                  !isOnline ? 'offline'
                  : messages.length === 0 ? 'unsaved'
                  : saveState;
                if (effectiveState === 'saved' && lastSavedAt) {
                  const ago = Math.max(0, Math.floor((Date.now() - lastSavedAt.getTime()) / 60_000));
                  showToast(
                    ago < 1 ? 'Session saved just now' : `Session saved ${ago} min ago`,
                    'success'
                  );
                } else if (effectiveState === 'saving') {
                  showToast('Saving…', 'info');
                } else if (effectiveState === 'offline') {
                  showToast('Offline — will sync when reconnected', 'warn');
                } else {
                  showToast('Session not yet saved', 'info');
                }
              }}
              hitSlop={8}
              style={styles.sessionIndicator}
              accessibilityRole="button"
              accessibilityLabel="Session save status"
            >
              <View
                style={[
                  styles.sessionDot,
                  {
                    backgroundColor:
                      !isOnline
                        ? colors.slate
                        : saveState === 'saving'
                        ? colors.statusPending
                        : saveState === 'saved' && messages.length > 0
                        ? colors.statusApprove
                        : colors.slate,
                  },
                ]}
              />
              <Text style={styles.sessionLabel}>
                {!isOnline
                  ? 'Offline'
                  : saveState === 'saving'
                  ? 'Saving'
                  : saveState === 'saved' && messages.length > 0
                  ? 'Saved'
                  : 'New'}
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Context indicator — a subtle single-line reminder of what Claude
            has access to. Updates live from PulseContext; swaps to an amber
            "offline" hint when the device loses connectivity. */}
        <View style={styles.contextBar}>
          <Text
            style={[
              styles.contextText,
              !isOnline && { color: '#D97706' },
            ]}
            numberOfLines={1}
          >
            {isOnline
              ? `Graph: ${formatCount(pulse?.totalClaims)} claims · ${formatCount(pulse?.totalEntities)} entities · Queue: ${pulse?.queueDepth ?? 0}`
              : 'Offline — cached context'}
          </Text>
        </View>

        {/* Inline session search — when open, replaces the chat with a
            filtered list of past sessions whose messages match the query. */}
        {searchOpen && (
          <View style={styles.searchBar}>
            <Ionicons name="search" size={16} color={colors.slate} />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search past sessions…"
              placeholderTextColor={colors.slate}
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
              autoFocus
              keyboardAppearance="dark"
              selectionColor={colors.teal}
            />
            {searchQuery.length > 0 ? (
              <Pressable
                onPress={() => {
                  setSearchQuery('');
                  setDebouncedSearchQuery('');
                }}
                hitSlop={8}
              >
                <Ionicons name="close-circle" size={16} color={colors.slate} />
              </Pressable>
            ) : null}
          </View>
        )}

        {searchOpen && debouncedSearchQuery.trim().length > 0 ? (
          <ScrollView
            style={styles.messages}
            contentContainerStyle={styles.searchResults}
            keyboardShouldPersistTaps="handled"
          >
            {filteredSessions.length === 0 ? (
              <Text style={styles.searchEmpty}>
                No sessions match "{debouncedSearchQuery.trim()}"
              </Text>
            ) : (
              filteredSessions.map((s: any) => (
                <Pressable
                  key={s.id}
                  onPress={() => {
                    Haptics.selectionAsync();
                    setSearchOpen(false);
                    setSearchQuery('');
                    setDebouncedSearchQuery('');
                    handleLoadSession(s);
                  }}
                  style={({ pressed }) => [
                    styles.searchRow,
                    pressed && { opacity: 0.75, transform: [{ scale: 0.98 }] },
                  ]}
                >
                  <Ionicons
                    name="chatbubble-outline"
                    size={14}
                    color={colors.teal}
                  />
                  <View style={{ flex: 1 }}>
                    <HighlightedText
                      text={deriveSessionTitle(s)}
                      query={debouncedSearchQuery.trim()}
                      style={styles.searchRowTitle}
                    />
                    <Text style={styles.searchRowMeta} numberOfLines={1}>
                      {Array.isArray(s.messages) ? s.messages.length : 0}{' '}
                      messages · {formatSearchRelative(s.updated_at)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color={colors.slate}
                  />
                </Pressable>
              ))
            )}
          </ScrollView>
        ) : (
        /* Messages */
        <ScrollView
          ref={scrollRef}
          style={styles.messages}
          contentContainerStyle={styles.messagesContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={handleScroll}
          scrollEventThrottle={32}
          onContentSizeChange={(_w, h) => {
            contentHeightRef.current = h;
            if (isPinned) {
              scrollRef.current?.scrollToEnd({ animated: true });
            }
          }}
          onLayout={(e) => {
            scrollViewHeightRef.current = e.nativeEvent.layout.height;
          }}
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

          {briefing && (
            <MessageBubble
              message={{
                id: 'briefing',
                role: 'assistant',
                content: briefing,
                timestamp: new Date().toISOString(),
              }}
              showTyping={false}
              streaming={false}
              onCopy={() => copyMessage(briefing)}
              onLongPress={() => {}}
              entityLookup={entityLookup}
              onEntityPress={handleEntityLinkPress}
            />
          )}

          {messages.length === 0 && !sending && !briefing && (
            <SharedEmptyState
              icon="chatbubble-ellipses"
              title="Stroom Command"
              subtitle="Ask anything about your knowledge graph"
              actionLabel="Try: /health"
              onAction={() => {
                Haptics.selectionAsync();
                send('/health');
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
        )}

        {/* "New messages" pill — visible when the user has scrolled up
            while a message arrives. Tap to snap to bottom. */}
        <NewMessagesPill visible={!isPinned} onPress={() => scrollToBottom(true)} />

        {/* Smart contextual suggestions — shown above the input when
            the composer is empty and no slash/predicate autocomplete is
            active. Visible at all times, not just on empty conversations. */}
        {!input.trim() && !slashMatches && predicateResults.length === 0 && (
          <SmartSuggestions
            queueDepth={pulse?.queueDepth ?? 0}
            onSelect={(text) => {
              Haptics.selectionAsync();
              send(text);
            }}
          />
        )}

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

        {/* Predicate autocomplete — shows when input contains a dotted
            predicate pattern like "economics." or "performance.lap" */}
        {predicateResults.length > 0 && !slashMatches && (
          <View style={styles.slashMenu}>
            {predicateResults.map((p) => (
              <Pressable
                key={p.predicate_key}
                onPress={() => {
                  // Replace the trailing dotted-word pattern with the full key.
                  setInput((prev) =>
                    prev.replace(/\b\w+\.\w*\s*$/, p.predicate_key + ' ')
                  );
                  setPredicateResults([]);
                }}
                style={({ pressed }) => [
                  styles.slashRow,
                  pressed && { backgroundColor: 'rgba(0,161,155,0.08)' },
                ]}
              >
                <Text style={styles.slashLabel}>{p.predicate_key}</Text>
                <Text style={styles.slashDesc}>{p.display_name}</Text>
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
    </View>
    </ScreenTransition>
  );
}

const SUGGESTED_PROMPTS = [
  'Graph health check',
  'What needs review?',
  'Coverage gaps report',
  'Source reliability audit',
] as const;

// Deprecated: superseded by the shared EmptyState at
// src/components/EmptyState.tsx. Retained as _LegacyCommandIntro so the
// SUGGESTED_PROMPTS + Suggestion scaffolding stays referenced and the TS
// unused-local lint stays quiet.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
// Compact big-number formatter for the context indicator — "52,501" → "52.5K",
// "4,428" → "4.4K", small numbers render as-is. Null/undefined → "0".
// Time-of-day + graph-state contextual suggestion chips.
const MORNING = [
  'Morning briefing',
  'What changed overnight?',
  'Show stale sources',
];
const AFTERNOON = [
  'Queue status',
  'Run sweep',
  'Top predicates today',
];
const EVENING = [
  'Daily summary',
  "Tomorrow's priorities",
];

function SmartSuggestions({
  queueDepth,
  onSelect,
}: {
  queueDepth: number;
  onSelect: (text: string) => void;
}) {
  const hour = new Date().getHours();
  const base = hour < 12 ? MORNING : hour < 18 ? AFTERNOON : EVENING;
  const chips =
    queueDepth > 20
      ? ['Review queue', ...base.slice(0, 3)]
      : base;

  return (
    <Animated.View entering={FadeIn.duration(200)} style={smartStyles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={smartStyles.scroll}
        keyboardShouldPersistTaps="handled"
      >
        {chips.map((text) => (
          <Pressable
            key={text}
            onPress={() => onSelect(text)}
            style={({ pressed }) => [
              smartStyles.chip,
              pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
            ]}
          >
            <Text style={smartStyles.chipText}>{text}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </Animated.View>
  );
}

const smartStyles = StyleSheet.create({
  wrap: {
    paddingBottom: spacing.sm,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
  },
  chipText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.silver,
    letterSpacing: 0.2,
  },
});

function formatCount(n: number | null | undefined): string {
  if (n == null) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function _LegacyCommandIntro({ onSuggest }: { onSuggest: (prompt: string) => void }) {
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

// Floating "↓ New messages" pill shown above the composer when the user
// has scrolled up while new content is arriving. Fades in/out over 150ms.
function NewMessagesPill({
  visible,
  onPress,
}: {
  visible: boolean;
  onPress: () => void;
}) {
  const opacity = useSharedValue(0);
  const [mounted, setMounted] = React.useState(visible);

  React.useEffect(() => {
    if (visible) {
      setMounted(true);
      opacity.value = withTiming(1, {
        duration: 150,
        easing: Easing.out(Easing.ease),
      });
    } else {
      opacity.value = withTiming(
        0,
        { duration: 150, easing: Easing.in(Easing.ease) },
        (done) => {
          if (done) runOnJS(setMounted)(false);
        }
      );
    }
  }, [visible, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (!mounted) return null;

  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.newMessagesPillWrap, style]}
    >
      <Pressable
        onPress={() => {
          Haptics.selectionAsync();
          onPress();
        }}
        style={({ pressed }) => [
          styles.newMessagesPill,
          pressed && { opacity: 0.85, transform: [{ scale: 0.97 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Scroll to latest messages"
      >
        <Ionicons name="arrow-down" size={13} color={colors.alabaster} />
        <Text style={styles.newMessagesPillText}>New messages</Text>
      </Pressable>
    </Animated.View>
  );
}

// Thin blinking teal cursor shown at the end of the assistant bubble.
// While `active`, opacity oscillates 1 ↔ 0.2 on a 1s cycle. When the
// parent flips `active` to false the cursor eases opacity to 0 over
// 240ms, then unmounts via the local `mounted` state — no instant pop.
// Session title helper for the search-results list — mirrors the
// SessionHistorySheet derivation but kept local so command.tsx doesn't
// need to import the sheet internals.
function deriveSessionTitle(session: any): string {
  if (session?.title && String(session.title).trim().length > 0)
    return String(session.title);
  if (Array.isArray(session?.messages)) {
    const firstUser = session.messages.find((m: any) => m?.role === 'user');
    if (firstUser?.content) {
      const text = String(firstUser.content).trim();
      return text.length > 60 ? text.slice(0, 60) + '…' : text;
    }
  }
  return 'Untitled session';
}

function formatSearchRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// Renders `text` with every case-insensitive occurrence of `query`
// wrapped in a teal-highlighted inline Text segment.
function HighlightedText({
  text,
  query,
  style,
}: {
  text: string;
  query: string;
  style: any;
}) {
  if (!query) return <Text style={style}>{text}</Text>;
  const lower = text.toLowerCase();
  const q = query.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let i = 0;
  while (i < text.length) {
    const hit = lower.indexOf(q, i);
    if (hit === -1) {
      parts.push({ text: text.slice(i), match: false });
      break;
    }
    if (hit > i) parts.push({ text: text.slice(i, hit), match: false });
    parts.push({ text: text.slice(hit, hit + q.length), match: true });
    i = hit + q.length;
  }
  return (
    <Text style={style} numberOfLines={1}>
      {parts.map((p, idx) =>
        p.match ? (
          <Text key={idx} style={styles.searchHighlight}>
            {p.text}
          </Text>
        ) : (
          <Text key={idx}>{p.text}</Text>
        )
      )}
    </Text>
  );
}

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

// Typing indicator — three dots pulsing in sequence with 200ms stagger.
// Each dot cycles between 0.2 and 1.0 opacity on a 900ms sine-wave loop.
// Rendered inside an assistant-style bubble so it looks like the AI is
// composing a message. Reanimated-driven for smooth 60fps.
function TypingDots() {
  const dot0 = useSharedValue(0.2);
  const dot1 = useSharedValue(0.2);
  const dot2 = useSharedValue(0.2);

  useEffect(() => {
    const pulse = (sv: Animated.SharedValue<number>, delay: number) => {
      setTimeout(() => {
        sv.value = withRepeat(
          withSequence(
            withTiming(1, { duration: 450, easing: Easing.inOut(Easing.sin) }),
            withTiming(0.2, { duration: 450, easing: Easing.inOut(Easing.sin) })
          ),
          -1
        );
      }, delay);
    };
    pulse(dot0, 0);
    pulse(dot1, 200);
    pulse(dot2, 400);
  }, [dot0, dot1, dot2]);

  const s0 = useAnimatedStyle(() => ({ opacity: dot0.value }));
  const s1 = useAnimatedStyle(() => ({ opacity: dot1.value }));
  const s2 = useAnimatedStyle(() => ({ opacity: dot2.value }));

  return (
    <Animated.View entering={FadeIn.duration(200)} style={styles.typingBubble}>
      <View style={styles.typingWrap}>
        <Animated.View style={[styles.typingDot, s0]} />
        <Animated.View style={[styles.typingDot, s1]} />
        <Animated.View style={[styles.typingDot, s2]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  contextBar: {
    paddingHorizontal: spacing.lg,
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.04)',
  },
  contextText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 11,
    color: colors.silver,
    letterSpacing: 0.1,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    marginTop: 4,
  },
  headerRight: {
    alignItems: 'flex-end',
    gap: 6,
  },
  headerActions: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },
  sessionIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  sessionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sessionLabel: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 0.3,
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
  iconBtnActive: {
    backgroundColor: colors.tealDim,
    borderColor: 'rgba(0, 161, 155, 0.4)',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginTop: 6,
    marginBottom: 2,
    paddingHorizontal: spacing.md,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  searchInput: {
    flex: 1,
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.alabaster,
    paddingVertical: 0,
  },
  searchResults: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    gap: 6,
  },
  searchEmpty: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    textAlign: 'center',
    paddingVertical: spacing.xl,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
  },
  searchRowTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
  },
  searchRowMeta: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 2,
  },
  searchHighlight: {
    backgroundColor: 'rgba(0, 161, 155, 0.25)',
    color: colors.teal,
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
  typingBubble: {
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(24, 24, 24, 0.65)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginLeft: spacing.lg,
    marginBottom: spacing.sm,
  },
  typingWrap: {
    flexDirection: 'row',
    gap: 5,
    alignItems: 'center',
  },
  typingDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
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
  newMessagesPillWrap: {
    position: 'absolute',
    bottom: 120,
    alignSelf: 'center',
    zIndex: 10,
  },
  newMessagesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 4,
  },
  newMessagesPillText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.alabaster,
    letterSpacing: 0.2,
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
