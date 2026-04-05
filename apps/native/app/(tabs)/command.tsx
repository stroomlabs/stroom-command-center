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
import { useRouter } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { useCommandChat, type ChatMessage } from '../../src/hooks/useCommandChat';
import { colors, fonts, spacing, radius, gradient } from '../../src/constants/brand';

export default function CommandScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { messages, sending, error, send, resetSession } = useCommandChat();
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
    resetSession();
  }, [resetSession]);

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
              key={`${i}-${msg.timestamp}`}
              message={msg}
              showTyping={showTypingIndicator && i === messages.length - 1}
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
}: {
  message: ChatMessage;
  showTyping: boolean;
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

  return (
    <View style={[styles.bubbleRow, isUser ? styles.userRow : styles.assistantRow]}>
      <View
        style={[
          styles.bubble,
          isUser ? styles.userBubble : styles.assistantBubble,
        ]}
      >
        <RichContent content={message.content} isUser={isUser} />
      </View>
    </View>
  );
}

// Render assistant text with ```code``` fenced blocks in monospace.
function RichContent({ content, isUser }: { content: string; isUser: boolean }) {
  if (isUser) {
    return <Text style={styles.userText}>{content}</Text>;
  }

  const parts = content.split(/```(\w*)\n?/);
  // split yields: [text, lang, code, text, lang, code, ...] when balanced
  const out: React.ReactNode[] = [];
  let inCode = false;
  for (let i = 0; i < parts.length; i++) {
    const seg = parts[i];
    if (i === 0) {
      if (seg) out.push(<Text key={i} style={styles.assistantText}>{seg}</Text>);
      continue;
    }
    // odd indices are language tags; even (>0) are alternating code/text
    if (i % 2 === 1) {
      // language tag — skip, next segment is the code body
      continue;
    }
    if (inCode) {
      // closed a code block
      if (seg) out.push(<Text key={i} style={styles.assistantText}>{seg}</Text>);
      inCode = false;
    } else {
      if (seg) {
        out.push(
          <View key={i} style={styles.codeBlock}>
            <Text style={styles.codeText}>{seg.replace(/\n$/, '')}</Text>
          </View>
        );
      }
      inCode = true;
    }
  }
  return <>{out}</>;
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
