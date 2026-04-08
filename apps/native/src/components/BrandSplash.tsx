import React, { useEffect } from 'react';
import { View, Text, Image, StyleSheet, Dimensions } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  Easing,
  runOnJS,
  interpolate,
} from 'react-native-reanimated';
import Svg, { Circle } from 'react-native-svg';
import { fonts } from '../constants/brand';

interface BrandSplashProps {
  // Called once the fade-out animation has completed.
  onDone: () => void;
  // Flips true when the host app is ready to proceed (fonts loaded, etc).
  // Once true the splash fades out.
  ready: boolean;
}

const FADE_IN_MS = 400;
const FADE_OUT_MS = 200;
const RIPPLE_MS = 800;

const EMBLEM_SIZE = 96;
const WORDMARK_GAP = 24;

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Minimal pre-TestFlight splash. Pitch black background, Stroom teal
// emblem centered, STROOM COMMAND wordmark below, and a single silver
// ripple expanding from the emblem center on mount. Nothing else — no
// gradient, no subtitle, no decoration.
export function BrandSplash({ onDone, ready }: BrandSplashProps) {
  const contentOpacity = useSharedValue(0);
  const rippleProgress = useSharedValue(0);
  const rootOpacity = useSharedValue(1);
  const doneRef = React.useRef(false);

  const { width: screenWidth, height: screenHeight } = Dimensions.get('window');
  const rippleMaxRadius = (screenWidth * 1.5) / 2;
  // SVG canvas must be large enough to host the fully expanded ripple
  // centered on the emblem — oversize to the larger screen dimension.
  const svgSize = Math.max(screenWidth, screenHeight) * 2;

  // Mount: fade content in + play the single ripple
  useEffect(() => {
    contentOpacity.value = withTiming(1, {
      duration: FADE_IN_MS,
      easing: Easing.out(Easing.ease),
    });
    rippleProgress.value = withTiming(1, {
      duration: RIPPLE_MS,
      easing: Easing.out(Easing.ease),
    });
  }, [contentOpacity, rippleProgress]);

  // Ready: fade root out then hand off
  useEffect(() => {
    if (!ready || doneRef.current) return;
    doneRef.current = true;
    rootOpacity.value = withTiming(
      0,
      { duration: FADE_OUT_MS, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (finished) runOnJS(onDone)();
      }
    );
  }, [ready, onDone, rootOpacity]);

  const rootStyle = useAnimatedStyle(() => ({
    opacity: rootOpacity.value,
  }));

  const contentStyle = useAnimatedStyle(() => ({
    opacity: contentOpacity.value,
  }));

  const rippleProps = useAnimatedProps(() => ({
    r: rippleProgress.value * rippleMaxRadius,
    strokeOpacity: interpolate(rippleProgress.value, [0, 1], [0.2, 0]),
  }));

  return (
    <Animated.View
      pointerEvents={ready ? 'none' : 'auto'}
      style={[StyleSheet.absoluteFill, styles.container, rootStyle]}
    >
      {/* Ripple layer — centered, oversized SVG canvas so the stroked
          circle can grow past screen edges without clipping. */}
      <View style={styles.rippleLayer} pointerEvents="none">
        <Svg width={svgSize} height={svgSize}>
          <AnimatedCircle
            cx={svgSize / 2}
            cy={svgSize / 2}
            stroke="#C8CCCE"
            strokeWidth={1}
            fill="none"
            animatedProps={rippleProps}
          />
        </Svg>
      </View>

      <Animated.View style={[styles.center, contentStyle]}>
        <Image
          source={require('../../assets/icon.png')}
          style={styles.emblem}
          resizeMode="contain"
        />
        <Text style={styles.wordmark}>STROOM COMMAND</Text>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 100,
  },
  rippleLayer: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  emblem: {
    width: EMBLEM_SIZE,
    height: EMBLEM_SIZE,
  },
  wordmark: {
    fontFamily: fonts.archivo.black,
    fontSize: 18,
    color: '#C8CCCE',
    letterSpacing: -0.5,
    marginTop: WORDMARK_GAP,
  },
});
