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
// Matches the global transition spec: opacity 0 → 1, translateY 20 → 0,
// 200ms ease-out. The Expo Router tab navigator unmounts/remounts screens
// on focus so blur animation isn't wired here — the incoming screen handles
// the visible transition.
export function ScreenTransition({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(20);

  const play = React.useCallback(() => {
    // Reset to start position, then animate in.
    opacity.value = 0;
    translateY.value = 20;
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
