import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../constants/brand';

// Tab bar icon with a subtle radial teal glow behind the icon when focused.
// The glow is rendered as a soft teal View with a large border radius and
// fades in (opacity 0 → 0.15) + scales up (0.6 → 1.0) on focus.
export function TabIcon({
  name,
  color,
  size,
  focused,
}: {
  name: React.ComponentProps<typeof Ionicons>['name'];
  color: string;
  size: number;
  focused: boolean;
}) {
  const progress = useSharedValue(focused ? 1 : 0);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.ease),
    });
  }, [focused, progress]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.15,
    transform: [{ scale: 0.6 + progress.value * 0.4 }],
  }));

  return (
    <View style={styles.wrap}>
      <Animated.View style={[styles.glow, glowStyle]} />
      <Ionicons name={name} size={size} color={color} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: 48,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.teal,
    // Soft blur via native shadow — Reanimated animates opacity/scale, shadow
    // gives it the radial-ish falloff look without needing expo-linear-gradient.
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 6,
  },
});
