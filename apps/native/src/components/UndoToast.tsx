import React, { useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSequence,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface UndoToastProps {
  visible: boolean;
  // Subject for the toast copy, e.g. "Max Verstappen".
  subject: string;
  // "approved" or "rejected" — rendered in the toast message.
  actionLabel: string;
  onUndo: () => void;
  onDismiss?: () => void;
  // Duration of the progress bar countdown in ms. Should match the deferred
  // mutation timer upstream so the bar visually empties as it expires.
  durationMs?: number;
}

const DEFAULT_DURATION = 5000;

// Bottom toast shown after a deferred approve/reject. Slides up from the
// bottom on mount, animates a thin teal progress bar to zero over the
// undo window, and supports a swipe-down gesture to dismiss (which flushes
// the pending mutation upstream via onDismiss). The "Undo" action is a
// right-aligned teal button.
export function UndoToast({
  visible,
  subject,
  actionLabel,
  onUndo,
  onDismiss,
  durationMs = DEFAULT_DURATION,
}: UndoToastProps) {
  const translateY = useSharedValue(120);
  const dragY = useSharedValue(0);
  const progress = useSharedValue(0);
  const [mounted, setMounted] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setMounted(true);
      translateY.value = withTiming(0, {
        duration: 260,
        easing: Easing.out(Easing.ease),
      });
      dragY.value = 0;
      progress.value = 0;
      progress.value = withTiming(1, {
        duration: durationMs,
        easing: Easing.linear,
      });
    } else {
      progress.value = withTiming(0, { duration: 150 });
      translateY.value = withTiming(
        120,
        { duration: 200, easing: Easing.in(Easing.ease) },
        (done) => {
          if (done) runOnJS(setMounted)(false);
        }
      );
    }
  }, [visible, durationMs, translateY, dragY, progress]);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((e) => {
      dragY.value = Math.max(0, e.translationY);
    })
    .onEnd((e) => {
      if (e.translationY > 50) {
        if (onDismiss) runOnJS(onDismiss)();
      } else {
        dragY.value = withTiming(0, { duration: 180 });
      }
    });

  const wrapStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + dragY.value }],
    opacity: 1 - Math.min(1, dragY.value / 120),
  }));

  const progressStyle = useAnimatedStyle(() => ({
    width: `${Math.max(0, 100 - progress.value * 100)}%`,
  }));

  if (!mounted) return null;

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.wrap, wrapStyle]} pointerEvents="box-none">
        <View style={styles.card}>
          <View style={styles.body}>
            <Text style={styles.message} numberOfLines={2}>
              <Text style={styles.subject}>{subject}</Text> {actionLabel}
            </Text>
          </View>
          <Pressable
            onPress={onUndo}
            style={({ pressed }) => [
              styles.undoBtn,
              pressed && { opacity: 0.75, transform: [{ scale: 0.97 }] },
            ]}
            accessibilityRole="button"
            accessibilityLabel={`Undo ${actionLabel}`}
          >
            <Ionicons name="arrow-undo" size={13} color={colors.teal} />
            <Text style={styles.undoText}>Undo</Text>
          </Pressable>
        </View>
        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, progressStyle]} />
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 8,
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  body: {
    flex: 1,
  },
  subject: {
    fontFamily: fonts.archivo.bold,
    color: colors.alabaster,
  },
  message: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.silver,
  },
  undoBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.full,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
  },
  undoText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 12,
    color: colors.teal,
    letterSpacing: 0.2,
  },
  progressTrack: {
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.teal,
  },
});
