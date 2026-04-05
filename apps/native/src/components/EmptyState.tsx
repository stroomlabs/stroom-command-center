import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface EmptyStateProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
  // Optional style override for the wrapping View — callers can position the
  // component inside a flex parent without fighting with the default centered
  // layout.
  compact?: boolean;
}

// Shared zero-content placeholder. Used anywhere a tab/section has no data
// to show. Centers a large teal icon with a headline, a silver subtitle,
// and an optional teal action button.
export function EmptyState({
  icon,
  title,
  subtitle,
  actionLabel,
  onAction,
  compact = false,
}: EmptyStateProps) {
  return (
    <View style={[styles.wrap, compact && styles.wrapCompact]}>
      <Ionicons name={icon} size={48} color={colors.teal} style={styles.icon} />
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      {actionLabel && onAction ? (
        <Pressable
          onPress={onAction}
          style={({ pressed }) => [
            styles.btn,
            pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
          ]}
        >
          <Text style={styles.btnText}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.xxl,
    gap: spacing.sm,
  },
  wrapCompact: {
    flex: 0,
    paddingVertical: spacing.lg,
  },
  icon: {
    opacity: 0.6,
    marginBottom: spacing.sm,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 20,
    color: colors.alabaster,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.silver,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 320,
  },
  btn: {
    marginTop: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: 12,
    borderRadius: radius.full,
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 3,
  },
  btnText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 13,
    color: colors.obsidian,
    letterSpacing: 0.3,
  },
});
