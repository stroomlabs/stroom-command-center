import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
} from 'react-native-reanimated';
import { haptics } from '../lib/haptics';
import { usePulseData } from '../hooks/usePulseData';
import { colors, fonts, spacing, radius, gradient } from '../constants/brand';

interface OnboardingFlowProps {
  visible: boolean;
  onComplete: () => void;
}

export function OnboardingFlow({ visible, onComplete }: OnboardingFlowProps) {
  const insets = useSafeAreaInsets();
  const { data: pulse } = usePulseData();
  const [step, setStep] = useState(0);
  const fade = useSharedValue(1);

  // Reset to first step whenever the modal reopens
  useEffect(() => {
    if (visible) {
      setStep(0);
      fade.value = 1;
    }
  }, [visible, fade]);

  const goToStep = (next: number, onArrive?: () => void) => {
    fade.value = withTiming(
      0,
      { duration: 220, easing: Easing.out(Easing.ease) },
      (finished) => {
        if (!finished) return;
        runOnJS(setStep)(next);
        fade.value = withTiming(1, { duration: 260, easing: Easing.in(Easing.ease) });
        if (onArrive) runOnJS(onArrive)();
      }
    );
  };

  const handleNext = () => {
    haptics.tap.light();
    if (step < 2) {
      goToStep(step + 1);
    } else {
      haptics.success();
      onComplete();
    }
  };

  const contentStyle = useAnimatedStyle(() => ({
    opacity: fade.value,
    transform: [{ translateY: (1 - fade.value) * 12 }],
  }));

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent>
      <LinearGradient
        colors={[gradient.background[0], gradient.background[1]]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={styles.container}
      >
        <View style={[styles.inner, { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xl }]}>
          {/* Step indicator */}
          <View style={styles.indicatorRow}>
            {[0, 1, 2].map((i) => (
              <View
                key={i}
                style={[
                  styles.indicatorDot,
                  i === step && styles.indicatorDotActive,
                ]}
              />
            ))}
          </View>

          <Animated.View style={[styles.body, contentStyle]}>
            {step === 0 && <StepWelcome />}
            {step === 1 && <StepGraph pulse={pulse} />}
            {step === 2 && <StepReady />}
          </Animated.View>

          <Pressable
            onPress={handleNext}
            style={({ pressed }) => [
              styles.cta,
              pressed && { opacity: 0.85 },
            ]}
          >
            <Text style={styles.ctaText}>
              {step === 0 ? 'Continue' : step === 1 ? 'Almost there' : 'Start Governing'}
            </Text>
            <Ionicons name="arrow-forward" size={16} color={colors.obsidian} />
          </Pressable>
        </View>
      </LinearGradient>
    </Modal>
  );
}

function StepWelcome() {
  return (
    <View style={styles.stepContent}>
      <View style={styles.logoWrap}>
        <Text style={styles.logoMark}>S</Text>
      </View>
      <Text style={styles.stepTitle}>Welcome to Command Center</Text>
      <Text style={styles.stepBody}>
        The operator cockpit for the StroomHelix intelligence graph.{'\n\n'}
        Monitor live graph activity, review claims, query Claude, and run
        governance workflows — all in one place.
      </Text>
    </View>
  );
}

function StepGraph({ pulse }: { pulse: ReturnType<typeof usePulseData>['data'] }) {
  return (
    <View style={styles.stepContent}>
      <View style={styles.graphIcon}>
        <Ionicons name="pulse" size={32} color={colors.teal} />
      </View>
      <Text style={styles.stepTitle}>Your Graph</Text>
      <Text style={styles.stepBody}>
        Here's what's in your knowledge graph right now:
      </Text>

      {pulse ? (
        <View style={styles.statsGrid}>
          <Stat label="Claims" value={pulse.totalClaims} />
          <Stat label="Entities" value={pulse.totalEntities} />
          <Stat label="Sources" value={pulse.totalSources} />
          <Stat
            label="Pending"
            value={pulse.queueDepth}
            accent={pulse.queueDepth > 0 ? colors.statusPending : colors.teal}
          />
        </View>
      ) : (
        <ActivityIndicator color={colors.teal} style={{ marginTop: spacing.lg }} />
      )}
    </View>
  );
}

function Stat({
  label,
  value,
  accent = colors.teal,
}: {
  label: string;
  value: number;
  accent?: string;
}) {
  const display =
    value >= 1_000_000
      ? `${(value / 1_000_000).toFixed(1)}M`
      : value >= 1_000
      ? `${(value / 1_000).toFixed(1)}K`
      : value.toLocaleString();
  return (
    <View style={styles.statCell}>
      <Text style={[styles.statValue, { color: accent }]}>{display}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function StepReady() {
  return (
    <View style={styles.stepContent}>
      <View style={styles.readyIcon}>
        <Ionicons name="checkmark-circle" size={44} color={colors.statusApprove} />
      </View>
      <Text style={styles.stepTitle}>You're Ready</Text>
      <Text style={styles.stepBody}>
        The Queue tab is where you'll spend most of your time — review claims,
        approve or reject with a tap or a swipe, and let the auto-governance
        policies handle the rest.{'\n\n'}
        Long-press the Queue count badge to batch-approve. Tap any card to see
        full context.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    justifyContent: 'space-between',
  },
  indicatorRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  indicatorDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  indicatorDotActive: {
    backgroundColor: colors.teal,
    width: 24,
  },
  body: {
    flex: 1,
    justifyContent: 'center',
  },
  stepContent: {
    alignItems: 'center',
    gap: spacing.md,
  },
  logoWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  logoMark: {
    fontFamily: fonts.archivo.black,
    fontSize: 56,
    color: colors.teal,
    letterSpacing: -2,
  },
  graphIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  readyIcon: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  stepTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 28,
    color: colors.alabaster,
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  stepBody: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.silver,
    textAlign: 'center',
    lineHeight: 21,
    maxWidth: 320,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.md,
    marginTop: spacing.lg,
  },
  statCell: {
    minWidth: 120,
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: 4,
  },
  statValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 24,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.teal,
    paddingVertical: 16,
    borderRadius: radius.md,
  },
  ctaText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 15,
    color: colors.obsidian,
    letterSpacing: -0.2,
  },
});
