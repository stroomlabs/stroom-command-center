import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { colors, radius, spacing } from '../constants/brand';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
}

export function GlassCard({ children, style, padded = true }: GlassCardProps) {
  return (
    <View style={[styles.card, padded && styles.padded, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    overflow: 'hidden',
  },
  padded: {
    padding: spacing.lg,
  },
});
