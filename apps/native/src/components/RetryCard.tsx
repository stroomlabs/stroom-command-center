import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface RetryCardProps {
  message?: string;
  detail?: string | null;
  onRetry: () => void | Promise<void>;
  compact?: boolean;
}

// Shared error placeholder for any failed RPC / network call. Drops into
// place of the real content so the rest of the screen keeps rendering
// when one section fails. Amber icon, glassmorphic card, teal Retry button.
export function RetryCard({
  message = "Couldn't load data",
  detail,
  onRetry,
  compact = false,
}: RetryCardProps) {
  return (
    <View style={[styles.card, compact && styles.cardCompact]}>
      <View style={styles.iconWrap}>
        <Ionicons
          name="alert-circle-outline"
          size={compact ? 22 : 32}
          color={colors.statusPending}
        />
      </View>
      <Text style={styles.message} numberOfLines={2}>
        {message}
      </Text>
      {detail ? (
        <Text style={styles.detail} numberOfLines={3}>
          {detail}
        </Text>
      ) : null}
      <Pressable
        onPress={onRetry}
        style={({ pressed }) => [
          styles.btn,
          pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
        ]}
        accessibilityRole="button"
        accessibilityLabel="Retry"
      >
        <Ionicons name="refresh" size={13} color={colors.obsidian} />
        <Text style={styles.btnText}>Retry</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.25)',
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardCompact: {
    padding: spacing.md,
    gap: 6,
  },
  iconWrap: {
    marginBottom: 2,
  },
  message: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
    textAlign: 'center',
  },
  detail: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    textAlign: 'center',
    lineHeight: 15,
    maxWidth: 320,
  },
  btn: {
    marginTop: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    borderRadius: radius.full,
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 2,
  },
  btnText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 12,
    color: colors.obsidian,
    letterSpacing: 0.3,
  },
});
