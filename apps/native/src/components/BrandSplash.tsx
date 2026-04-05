import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { GlowSpot } from './GlowSpot';
import { colors, fonts } from '../constants/brand';

interface BrandSplashProps {
  // Called once the splash has shown for at least MIN_DURATION_MS and the
  // fade-out animation has completed.
  onDone: () => void;
  // Flips true when the host app is ready to proceed (auth resolved, etc).
  // Until this flips true the splash stays fully visible; once it flips
  // true the splash waits for the minimum duration to elapse and then
  // fades out.
  ready: boolean;
}

const MIN_DURATION_MS = 1500;
const FADE_DURATION_MS = 300;

// Full-screen brand splash shown on app launch before the auth check
// resolves. Matches the login screen logo treatment: 72px Archivo Black
// teal "S" with glow, "STROOM" wordmark below, breathing halo behind.
// Stays visible for a minimum of 1.5s even if the app is ready sooner,
// then fades out over 300ms.
export function BrandSplash({ onDone, ready }: BrandSplashProps) {
  const opacity = useSharedValue(1);
  const startedAtRef = React.useRef(Date.now());
  const doneRef = React.useRef(false);

  useEffect(() => {
    if (!ready || doneRef.current) return;
    const elapsed = Date.now() - startedAtRef.current;
    const wait = Math.max(0, MIN_DURATION_MS - elapsed);
    const timer = setTimeout(() => {
      if (doneRef.current) return;
      doneRef.current = true;
      opacity.value = withTiming(
        0,
        { duration: FADE_DURATION_MS, easing: Easing.out(Easing.ease) },
        (finished) => {
          if (finished) runOnJS(onDone)();
        }
      );
    }, wait);
    return () => clearTimeout(timer);
  }, [ready, onDone, opacity]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      pointerEvents={ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.container, animatedStyle]}
    >
      <GlowSpot size={560} opacity={0.1} style={styles.haloOuter} breathe />
      <GlowSpot size={320} opacity={0.12} style={styles.haloInner} breathe />
      <View style={styles.center}>
        <Text style={styles.logoMark}>S</Text>
        <Text style={styles.wordmark}>STROOM</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0E0F14',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  haloOuter: {
    top: '35%',
    left: '50%',
    marginLeft: -280,
  },
  haloInner: {
    top: '42%',
    left: '50%',
    marginLeft: -160,
  },
  center: {
    alignItems: 'center',
  },
  logoMark: {
    fontFamily: fonts.archivo.black,
    fontSize: 72,
    color: colors.teal,
    letterSpacing: -2,
    textShadowColor: 'rgba(0, 161, 155, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
    lineHeight: 80,
  },
  wordmark: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    color: colors.silver,
    letterSpacing: 6,
    marginTop: 8,
  },
});
