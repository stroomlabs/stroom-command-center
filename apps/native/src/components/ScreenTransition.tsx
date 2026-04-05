import React, { useEffect } from 'react';
import { StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

// Wrap a tab screen's root in <ScreenTransition> to get the standard
// "fade in from bottom" entering animation whenever the screen gains focus.
// Matches the global tab-switch spec: opacity 0 → 1, translateY 15 → 0,
// 200ms ease-out. Expo Router's Tabs doesn't expose a per-screen content
// wrapper at the navigator level, so every tab delegates its entering
// animation here — this component IS the layout-level animation.
export function ScreenTransition({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(15);

  const play = React.useCallback(() => {
    // Reset to start position, then animate in.
    opacity.value = 0;
    translateY.value = 15;
    opacity.value = withTiming(1, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
    translateY.value = withTiming(0, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
  }, [opacity, translateY]);

  // Initial mount
  useEffect(() => {
    play();
  }, [play]);

  // Re-run on every focus (tab switch back)
  useFocusEffect(
    React.useCallback(() => {
      play();
      return () => {};
    }, [play])
  );

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.fill, style, animatedStyle]}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
