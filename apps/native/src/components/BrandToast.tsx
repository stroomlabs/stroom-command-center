import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { colors, fonts, spacing, radius } from '../constants/brand';

export type BrandToastTone = 'success' | 'warn' | 'error' | 'info';

interface BrandToastState {
  message: string;
  tone: BrandToastTone;
}

interface BrandToastContextValue {
  // Imperative: show(message, tone?) — auto-dismisses after 2 seconds.
  show: (message: string, tone?: BrandToastTone) => void;
}

const BrandToastContext = createContext<BrandToastContextValue | null>(null);

export function BrandToastProvider({ children }: { children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<BrandToastState | null>(null);
  const opacity = useSharedValue(0);
  const translateY = useSharedValue(40);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimer = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  const clearState = useCallback(() => setState(null), []);

  const dismiss = useCallback(() => {
    clearTimer();
    opacity.value = withTiming(0, { duration: 180, easing: Easing.in(Easing.ease) });
    translateY.value = withTiming(
      30,
      { duration: 180, easing: Easing.in(Easing.ease) },
      (finished) => {
        if (finished) runOnJS(clearState)();
      }
    );
  }, [clearState, opacity, translateY]);

  const show = useCallback(
    (message: string, tone: BrandToastTone = 'success') => {
      clearTimer();
      setState({ message, tone });
      opacity.value = withTiming(1, { duration: 220, easing: Easing.out(Easing.ease) });
      translateY.value = withTiming(0, {
        duration: 260,
        easing: Easing.out(Easing.ease),
      });
      hideTimer.current = setTimeout(() => dismiss(), 2000);
    },
    [dismiss, opacity, translateY]
  );

  useEffect(() => () => clearTimer(), []);

  const value = useMemo(() => ({ show }), [show]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateY: translateY.value }],
  }));

  const tone = state?.tone ?? 'success';
  const accentColor = toneColor(tone);
  const icon = toneIcon(tone);

  return (
    <BrandToastContext.Provider value={value}>
      {children}
      {state && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.wrap,
            { bottom: insets.bottom + 100 },
            animatedStyle,
          ]}
        >
          <View style={[styles.card, { borderColor: accentColor }]}>
            <BlurView
              intensity={Platform.OS === 'ios' ? 30 : 60}
              tint="dark"
              style={StyleSheet.absoluteFill}
            />
            <Ionicons name={icon} size={18} color={accentColor} />
            <Text style={styles.message}>{state.message}</Text>
          </View>
        </Animated.View>
      )}
    </BrandToastContext.Provider>
  );
}

export function useBrandToast(): BrandToastContextValue {
  const ctx = useContext(BrandToastContext);
  if (!ctx) {
    throw new Error('useBrandToast must be used inside <BrandToastProvider>');
  }
  return ctx;
}

function toneColor(tone: BrandToastTone): string {
  switch (tone) {
    case 'error':
      return colors.statusReject;
    case 'warn':
      return colors.statusPending;
    case 'info':
      return colors.statusInfo;
    case 'success':
    default:
      return colors.statusApprove;
  }
}

function toneIcon(tone: BrandToastTone): keyof typeof Ionicons.glyphMap {
  switch (tone) {
    case 'error':
      return 'close-circle';
    case 'warn':
      return 'alert-circle';
    case 'info':
      return 'information-circle';
    case 'success':
    default:
      return 'checkmark-circle';
  }
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 2000,
    elevation: 20,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    borderRadius: radius.lg,
    borderWidth: 1,
    backgroundColor: 'rgba(17, 20, 22, 0.88)',
    overflow: 'hidden',
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
  },
  message: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
    letterSpacing: -0.1,
  },
});
