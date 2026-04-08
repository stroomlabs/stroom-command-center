import React, { useEffect } from 'react';
import { StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import { useFocusEffect } from 'expo-router';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

// Wraps a tab screen's foreground content (everything except ScreenCanvas)
// in a Reanimated Animated.View that fades in over 180ms whenever the
// screen gains focus. Pure opacity — no translateY, no scale — so the
// content materializes on top of the static ScreenCanvas without any
// vertical drift. Re-fires on every tab focus via useFocusEffect.
//
// Mount this INSIDE the root <View> as a sibling to <ScreenCanvas /> so
// the canvas stays still while only the foreground crossfades.
export function ScreenTransition({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const opacity = useSharedValue(0);

  const play = React.useCallback(() => {
    opacity.value = 0;
    opacity.value = withTiming(1, {
      duration: 180,
      easing: Easing.out(Easing.ease),
    });
  }, [opacity]);

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
