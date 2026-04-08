import React from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  type ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { fonts, radius } from '../constants/brand';

type Tone = 'approve' | 'reject' | 'teal';

const GRADIENTS: Record<Tone, [string, string]> = {
  approve: ['#0EA5A0', '#0A7A57'],
  teal: ['#0EA5A0', '#0A7A57'],
  reject: ['#DC2626', '#991B1B'],
};

interface GradientButtonProps {
  label: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  tone?: Tone;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: ViewStyle;
  accessibilityLabel?: string;
}

export function GradientButton({
  label,
  icon,
  tone = 'teal',
  onPress,
  disabled = false,
  loading = false,
  style,
  accessibilityLabel,
}: GradientButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.wrap,
        (pressed || disabled || loading) && { opacity: 0.75 },
        style,
      ]}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <LinearGradient
        colors={GRADIENTS[tone]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.5 }}
        style={styles.gradient}
      >
        {loading ? (
          <ActivityIndicator size="small" color="#fff" />
        ) : icon ? (
          <Ionicons name={icon} size={18} color="#fff" />
        ) : null}
        <Text style={styles.label}>{label}</Text>
      </LinearGradient>
      <View style={styles.topHighlight} pointerEvents="none" />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  gradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  topHighlight: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  label: {
    fontFamily: fonts.archivo.bold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
