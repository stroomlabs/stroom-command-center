import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
  Easing,
} from 'react-native-reanimated';
import { colors } from '../constants/brand';

// Tab bar icon with layered animations on focus:
//   1. Background glow — fades in (opacity 0 → 0.15) + scales up (0.6 → 1.0).
//   2. Icon — springs from 1.0 to 1.15 scale on focus for a punchy pop.
//   3. Teal drop shadow on the wrapper (iOS) for a focused glow halo.
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
  const iconScale = useSharedValue(focused ? 1.15 : 1);

  useEffect(() => {
    progress.value = withTiming(focused ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.ease),
    });
    iconScale.value = withSpring(focused ? 1.15 : 1, {
      damping: 12,
      stiffness: 180,
    });
  }, [focused, progress, iconScale]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: progress.value * 0.15,
    transform: [{ scale: 0.6 + progress.value * 0.4 }],
  }));

  const iconAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: iconScale.value }],
  }));

  return (
    <View style={[styles.wrap, focused && styles.wrapFocused]}>
      <Animated.View style={[styles.glow, glowStyle]} />
      <Animated.View style={iconAnimatedStyle}>
        <Ionicons name={name} size={size} color={color} />
      </Animated.View>
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
  wrapFocused: {
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowRadius: 8,
    shadowOpacity: 0.4,
  },
  glow: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 14,
    elevation: 6,
  },
});
