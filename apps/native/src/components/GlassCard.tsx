import React from 'react';
import { View, StyleSheet, ViewStyle, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, radius, spacing } from '../constants/brand';

interface GlassCardProps {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  accessibilityLabel?: string;
}

export function GlassCard({
  children,
  style,
  padded = true,
  accessibilityLabel,
}: GlassCardProps) {
  return (
    <View
      style={[styles.card, padded && styles.padded, style]}
      accessible={accessibilityLabel ? true : undefined}
      accessibilityLabel={accessibilityLabel}
    >
      {/* Backdrop blur for real glassmorphism on iOS. On Android, BlurView
          performance is less reliable so we keep the rgba surface fallback. */}
      {Platform.OS === 'ios' ? (
        <BlurView
          intensity={15}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      {/* Top-light glow — simulates a light source from above by adding a
          brighter 1px top edge inside the card. */}
      <View style={styles.topGlow} pointerEvents="none" />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Platform.OS === 'ios' ? 'rgba(24, 24, 24, 0.65)' : 'rgba(24, 24, 24, 0.90)',
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 8,
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  padded: {
    padding: spacing.lg,
  },
});
