import { useEffect } from 'react';
import {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';

// Standard glass-modal card transition — fade + scale 0.95 → 1.0 over 220ms
// ease-out. Drive by passing the modal's `visible` prop; the returned style
// animates opacity + transform and can be applied to the card View inside
// an Animated.View.
export function useModalTransition(visible: boolean) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(visible ? 1 : 0, {
      duration: visible ? 220 : 180,
      easing: visible ? Easing.out(Easing.ease) : Easing.in(Easing.ease),
    });
  }, [visible, progress]);

  const cardStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.95 + progress.value * 0.05 }],
  }));

  return { cardStyle };
}
