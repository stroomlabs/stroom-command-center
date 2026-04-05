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
  Alert,
  ActionSheetIOS,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import * as Clipboard from 'expo-clipboard';
import { useCommandChat, type ChatMessage } from '../../src/hooks/useCommandChat';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function CommandScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { messages, sending, error, send, resetSession, deleteMessage, retryFrom } =
    useCommandChat();
  const [input, setInput] = useState('');
  const scrollRef = useRef<ScrollView>(null);

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
    Haptics.selectionAsync();
    setInput('');
    send(text);
  }, [input, sending, send]);

  const handleReset = useCallback(() => {
    Keyboard.dismiss();
    if (messages.length === 0) {
      resetSession();
      return;
    }
    Alert.alert(
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
  }, [messages.length, resetSession]);

  const copyMessage = useCallback(async (content: string) => {
    if (!content) return;
    await Clipboard.setStringAsync(content);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  const showMessageMenu = useCallback(
    (message: ChatMessage) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const canRetry = message.role === 'assistant' && !sending;
      const options = canRetry
        ? ['Copy', 'Retry', 'Delete', 'Cancel']
        : ['Copy', 'Delete', 'Cancel'];
      const destructiveIndex = canRetry ? 2 : 1;
      const cancelIndex = options.length - 1;

      const handle = (index: number) => {
        if (index === 0) {
          copyMessage(message.content);
        } else if (canRetry && index === 1) {
          retryFrom(message.id);
        } else if (index === destructiveIndex) {
          deleteMessage(message.id);
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
        }
      };

      if (Platform.OS === 'ios') {
        ActionSheetIOS.showActionSheetWithOptions(
          {
            options,
            cancelButtonIndex: cancelIndex,
            destructiveButtonIndex: destructiveIndex,
            userInterfaceStyle: 'dark',
          },
          handle
        );
      } else {
        Alert.alert('Message', undefined, [
          { text: 'Copy', onPress: () => handle(0) },
          ...(canRetry
            ? [{ text: 'Retry', onPress: () => handle(1) }]
            : []),
          {
            text: 'Delete',
            style: 'destructive',
            onPress: () => handle(destructiveIndex),
          },
          { text: 'Cancel', style: 'cancel' },
        ]);
      }
    },
    [sending, copyMessage, retryFrom, deleteMessage]
  );

  const showTypingIndicator =
    sending &&
    messages.length > 0 &&
    messages[messages.length - 1].role === 'assistant' &&
    messages[messages.length - 1].content === '';

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
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
          {messages.length === 0 && !sending && <EmptyState />}

          {messages.map((msg, i) => (
            <MessageBubble
              key={msg.id}
              message={msg}
              showTyping={showTypingIndicator && i === messages.length - 1}
              onCopy={() => copyMessage(msg.content)}
              onLongPress={() => showMessageMenu(msg)}
            />
          ))}

          {error && (
            <View style={styles.errorBubble}>
              <Ionicons name="warning-outline" size={14} color={colors.statusReject} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}
        </ScrollView>

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
    </LinearGradient>
  );
}

function EmptyState() {
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
        <Suggestion text="Top 5 crew chiefs by win rate this season" />
        <Suggestion text="What claims conflict about Kyle Larson?" />
        <Suggestion text="Summarize today's research queue" />
      </View>
    </View>
  );
}

function Suggestion({ text }: { text: string }) {
  return (
    <View style={styles.suggestion}>
      <Ionicons name="arrow-forward" size={12} color={colors.slate} />
      <Text style={styles.suggestionText}>{text}</Text>
    </View>
  );
}

function MessageBubble({
  message,
  showTyping,
  onCopy,
  onLongPress,
}: {
  message: ChatMessage;
  showTyping: boolean;
  onCopy: () => void;
  onLongPress: () => void;
}) {
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
        <RichContent content={message.content} isUser={isUser} />
      </Pressable>
    </View>
  );
}

// Markdown renderer for assistant messages — supports headers (# ## ###),
// bold (**text**), inline code (`code`), fenced code blocks (```), and
// bullet lists (-/*). User messages render as plain text.
function RichContent({ content, isUser }: { content: string; isUser: boolean }) {
  if (isUser) {
    return <Text style={styles.userText}>{content}</Text>;
  }
  return <>{renderMarkdownBlocks(content)}</>;
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

function renderMarkdownBlocks(src: string): React.ReactNode[] {
  const blocks = parseMarkdown(src);
  return blocks.map((block, idx) => {
    switch (block.kind) {
      case 'code':
        return (
          <View key={idx} style={styles.codeBlock}>
            <Text style={styles.codeText}>{block.text}</Text>
          </View>
        );
      case 'heading': {
        const style =
          block.level === 1
            ? styles.h1
            : block.level === 2
            ? styles.h2
            : styles.h3;
        return (
          <Text key={idx} style={style}>
            {renderInline(block.text)}
          </Text>
        );
      }
      case 'list':
        return (
          <View key={idx} style={styles.list}>
            {block.items.map((item, j) => (
              <View key={j} style={styles.listItem}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.assistantText}>{renderInline(item)}</Text>
              </View>
            ))}
          </View>
        );
      case 'paragraph':
      default:
        return (
          <Text key={idx} style={styles.assistantText}>
            {renderInline(block.text)}
          </Text>
        );
    }
  });
}

// Inline parser: **bold**, `code`
function renderInline(text: string): React.ReactNode[] {
  const tokens: React.ReactNode[] = [];
  const regex = /(\*\*[^*]+\*\*|`[^`]+`)/g;
  let lastIndex = 0;
  let key = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      tokens.push(text.slice(lastIndex, match.index));
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
    tokens.push(text.slice(lastIndex));
  }
  return tokens;
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
    fontSize: 28,
    color: colors.alabaster,
    letterSpacing: -0.6,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    marginTop: 2,
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
