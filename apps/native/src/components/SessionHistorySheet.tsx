import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import type { CommandSession } from '@stroom/types';
import { useModalTransition } from '../hooks/useModalTransition';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface SessionHistorySheetProps {
  visible: boolean;
  sessions: CommandSession[];
  loading: boolean;
  error: string | null;
  currentSessionId: string | null;
  onSelect: (session: CommandSession) => void;
  onDismiss: () => void;
}

export function SessionHistorySheet({
  visible,
  sessions,
  loading,
  error,
  currentSessionId,
  onSelect,
  onDismiss,
}: SessionHistorySheetProps) {
  const { cardStyle } = useModalTransition(visible);
  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <Animated.View style={cardStyle}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.handle} />

          <View style={styles.header}>
            <Text style={styles.title}>Session History</Text>
            <Text style={styles.subtitle}>
              {sessions.length} most recent {sessions.length === 1 ? 'thread' : 'threads'}
            </Text>
          </View>

          {loading && sessions.length === 0 ? (
            <View style={styles.centered}>
              <ActivityIndicator color={colors.teal} size="large" />
            </View>
          ) : error && sessions.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="warning-outline" size={24} color={colors.statusReject} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : sessions.length === 0 ? (
            <View style={styles.centered}>
              <Ionicons name="chatbubbles-outline" size={32} color={colors.slate} />
              <Text style={styles.emptyText}>No past sessions yet</Text>
            </View>
          ) : (
            <FlatList
              data={sessions}
              keyExtractor={(s) => s.id}
              contentContainerStyle={styles.list}
              showsVerticalScrollIndicator={false}
              ItemSeparatorComponent={() => <View style={styles.separator} />}
              renderItem={({ item }) => {
                const isCurrent = item.id === currentSessionId;
                const messageCount = Array.isArray(item.messages) ? item.messages.length : 0;
                return (
                  <Pressable
                    onPress={() => {
                      onDismiss();
                      setTimeout(() => onSelect(item), 0);
                    }}
                    style={({ pressed }) => [
                      styles.row,
                      isCurrent && styles.rowCurrent,
                      pressed && styles.rowPressed,
                    ]}
                  >
                    <View style={styles.rowIcon}>
                      <Ionicons
                        name={isCurrent ? 'sparkles' : 'chatbubble-outline'}
                        size={16}
                        color={isCurrent ? colors.teal : colors.silver}
                      />
                    </View>
                    <View style={styles.rowBody}>
                      <Text
                        style={[styles.rowTitle, isCurrent && styles.rowTitleCurrent]}
                        numberOfLines={1}
                      >
                        {deriveTitle(item)}
                      </Text>
                      <View style={styles.rowMeta}>
                        <Text style={styles.rowMetaText}>
                          {messageCount} {messageCount === 1 ? 'message' : 'messages'}
                        </Text>
                        <Text style={styles.rowMetaDot}>·</Text>
                        <Text style={styles.rowMetaText}>
                          {formatRelative(item.updated_at)}
                        </Text>
                      </View>
                    </View>
                    {isCurrent ? (
                      <Text style={styles.currentBadge}>CURRENT</Text>
                    ) : (
                      <Ionicons name="chevron-forward" size={16} color={colors.slate} />
                    )}
                  </Pressable>
                );
              }}
            />
          )}

          <Pressable
            onPress={onDismiss}
            style={({ pressed }) => [styles.cancelBtn, pressed && { opacity: 0.85 }]}
          >
            <Text style={styles.cancelText}>Close</Text>
          </Pressable>
        </Pressable>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

function deriveTitle(session: CommandSession): string {
  if (session.title && session.title.trim().length > 0) return session.title;
  if (Array.isArray(session.messages)) {
    const firstUser = session.messages.find((m: any) => m?.role === 'user');
    if (firstUser?.content) {
      const text = String(firstUser.content).trim();
      return text.length > 60 ? text.slice(0, 60) + '…' : text;
    }
  }
  return 'Untitled session';
}

function formatRelative(iso: string): string {
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.surfaceElevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    maxHeight: '80%',
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.slate,
    alignSelf: 'center',
    marginTop: spacing.md,
    marginBottom: spacing.md,
  },
  header: {
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 20,
    color: colors.alabaster,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    marginTop: 2,
  },
  list: {
    paddingVertical: spacing.xs,
  },
  separator: {
    height: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowCurrent: {
    backgroundColor: colors.tealDim,
    borderColor: 'rgba(0, 161, 155, 0.3)',
  },
  rowPressed: {
    opacity: 0.75,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  rowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.04)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 2,
  },
  rowTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  rowTitleCurrent: {
    color: colors.teal,
  },
  rowMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  rowMetaText: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  rowMetaDot: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  currentBadge: {
    fontFamily: fonts.mono.semibold,
    fontSize: 9,
    color: colors.teal,
    letterSpacing: 0.8,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 13,
    color: colors.statusReject,
    textAlign: 'center',
  },
  emptyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
  },
  cancelBtn: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.md,
  },
  cancelText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.silver,
  },
});
