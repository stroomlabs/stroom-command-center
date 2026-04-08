import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { colors, fonts, radius, spacing } from '../constants/brand';

export const STATUS_COLORS: Record<string, string> = {
  draft: colors.statusPending,
  pending_review: colors.statusPending,
  approved: colors.statusInfo,
  published: colors.statusApprove,
  rejected: colors.statusReject,
  corrected: colors.statusInfo,
  superseded: colors.slate,
  retracted: colors.statusReject,
};

interface StatusBadgeProps {
  status: string;
}

export function StatusBadge({ status }: StatusBadgeProps) {
  const color = STATUS_COLORS[status] ?? colors.slate;
  const label = status.replace(/_/g, ' ');

  return (
    <View
      style={[styles.badge, { borderColor: color }]}
      accessible
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
    >
      <View style={[styles.dot, { backgroundColor: color }]} />
      <Text style={[styles.label, { color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: 3,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: spacing.xs + 1,
  },
  label: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
});
