import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Dimensions,
  LayoutAnimation,
  Platform,
  UIManager,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
  FadeInDown,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { QueueClaim } from '@stroom/supabase';
import { GlassCard } from './GlassCard';
import { StatusBadge } from './StatusBadge';
import { HighlightedText } from './HighlightedText';
import { resolveClaimDisplayValue } from '../lib/resolveDisplayValue';
import { colors, fonts, spacing, radius } from '../constants/brand';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 120;
const VELOCITY_THRESHOLD = 500;
const EXIT_DURATION = 250;

// Enable smooth list reflow on Android when a ClaimCard is removed.
if (
  Platform.OS === 'android' &&
  UIManager.setLayoutAnimationEnabledExperimental
) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

interface ClaimCardProps {
  claim: QueueClaim;
  onApprove: () => void;
  onReject: () => void;
  onLongPress?: () => void;
  onDoublePress?: () => void;
  selectMode?: boolean;
  selected?: boolean;
  onToggleSelect?: () => void;
  query?: string;
  updatesExisting?: boolean;
}

function ClaimCardImpl({
  claim,
  onApprove,
  onReject,
  onLongPress,
  onDoublePress,
  selectMode = false,
  selected = false,
  onToggleSelect,
  query,
  updatesExisting = false,
}: ClaimCardProps) {
  const router = useRouter();
  const subjectName = claim.subject_entity?.canonical_name ?? 'Unknown entity';
  const objectName = claim.object_entity?.canonical_name;
  const sourceName = claim.source?.source_name ?? 'Unknown source';
  const trustScore = Number(claim.source?.trust_score ?? 0);
  const confidenceScore = Number(claim.confidence_score ?? 0);
  const predicate = claim.predicate ?? 'unknown';

  // Resolve display value — extract meaningful text from JSONB
  const displayValue = resolveClaimDisplayValue(claim.value_jsonb, objectName, claim.predicate);
  const corroborations = claim.corroboration_score ?? 0;
  const age = getRelativeTime(claim.created_at);
  const ageDays = (Date.now() - new Date(claim.created_at).getTime()) / 86_400_000;
  const ageColor =
    ageDays < 1
      ? colors.statusApprove
      : ageDays < 3
      ? colors.teal
      : ageDays < 7
      ? colors.statusPending
      : colors.statusReject;
  // Progress bar fills proportionally over 7 days (clamped to 100%).
  const agePct = Math.min(100, (ageDays / 7) * 100);

  // Triage rail color — routine (teal) / review (amber) / high-risk (red)
  const isHighRisk =
    trustScore < 6 || confidenceScore < 6 || corroborations === 0;
  const isNormal = trustScore >= 8 && confidenceScore >= 8;
  const riskColor = isHighRisk
    ? colors.statusReject
    : isNormal
    ? colors.teal
    : colors.statusPending;
  const riskLabel = isHighRisk
    ? 'High risk claim'
    : isNormal
    ? 'Normal'
    : 'Medium risk';

  // Clean predicate for display: "person.crew_chief_profile" → "Crew Chief Profile"
  const predicateLabel = formatPredicate(predicate);
  const predicateRaw = predicate;

  // Double-tap detection — when onDoublePress is provided, a single tap is
  // delayed by 300ms so we can still distinguish a second tap arriving
  // within that window. This is the standard cost of double-tap gestures;
  // without onDoublePress, single taps navigate immediately.
  const lastTapAtRef = React.useRef(0);
  const singleTapTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  React.useEffect(
    () => () => {
      if (singleTapTimerRef.current) clearTimeout(singleTapTimerRef.current);
    },
    []
  );

  // Swipe-right-to-approve gesture
  const translateX = useSharedValue(0);
  const crossedThreshold = useSharedValue(false);

  // Exit animation (tap approve/reject) — cascade upward and fade out
  const exitTranslateY = useSharedValue(0);
  const exitOpacity = useSharedValue(1);

  const onThresholdHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  // Called on the JS thread after the fade-out finishes. Configures a one-shot
  // layout animation so the cards below slide up to fill the gap smoothly when
  // the parent removes this claim from state.
  const finishExit = React.useCallback((callback: () => void) => {
    LayoutAnimation.configureNext(
      LayoutAnimation.create(220, 'easeInEaseOut', 'opacity')
    );
    callback();
  }, []);

  const animateOutAndRun = React.useCallback(
    (callback: () => void) => {
      exitTranslateY.value = withTiming(-80, { duration: EXIT_DURATION });
      exitOpacity.value = withTiming(0, { duration: EXIT_DURATION }, (done) => {
        if (done) runOnJS(finishExit)(callback);
      });
    },
    [exitTranslateY, exitOpacity, finishExit]
  );

  const handleApprove = React.useCallback(() => {
    animateOutAndRun(onApprove);
  }, [animateOutAndRun, onApprove]);

  const handleReject = React.useCallback(() => {
    animateOutAndRun(onReject);
  }, [animateOutAndRun, onReject]);

  const panGesture = Gesture.Pan()
    .enabled(!selectMode)
    .activeOffsetX([-15, 15])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      // Right swipe only
      const x = Math.max(0, e.translationX);
      translateX.value = x;
      if (x >= SWIPE_THRESHOLD && !crossedThreshold.value) {
        crossedThreshold.value = true;
        runOnJS(onThresholdHaptic)();
      } else if (x < SWIPE_THRESHOLD && crossedThreshold.value) {
        crossedThreshold.value = false;
      }
    })
    .onEnd((e) => {
      // Complete the swipe if past threshold OR fast flick
      if (
        e.translationX >= SWIPE_THRESHOLD ||
        (e.translationX > 30 && e.velocityX > VELOCITY_THRESHOLD)
      ) {
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 220 }, () => {
          runOnJS(onApprove)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
        crossedThreshold.value = false;
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    opacity: exitOpacity.value,
    transform: [
      { translateX: translateX.value },
      { translateY: exitTranslateY.value },
    ],
  }));

  const revealAnimatedStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    );
    const opacity = interpolate(
      progress,
      [0, 0.4, 1],
      [0, 0.6, 1],
      Extrapolation.CLAMP
    );
    const iconScale = interpolate(progress, [0, 1], [0.5, 1.0], Extrapolation.CLAMP);
    const rotate = interpolate(progress, [0, 1], [-15, 0], Extrapolation.CLAMP);
    return {
      opacity,
      transform: [{ scale: iconScale }, { rotate: `${rotate}deg` }],
    };
  });

  // Green/red background tint that intensifies with swipe progress
  const cardTintStyle = useAnimatedStyle(() => {
    const progress = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0, 1],
      Extrapolation.CLAMP
    );
    const greenAlpha = interpolate(progress, [0, 1], [0, 0.08], Extrapolation.CLAMP);
    return {
      backgroundColor: `rgba(34, 197, 94, ${greenAlpha})`,
    };
  });

  return (
    <Animated.View entering={FadeInDown.duration(300)} style={styles.swipeWrap}>
      {/* Green reveal layer (behind the card) */}
      {!selectMode && (
        <View style={styles.revealLayer} pointerEvents="none">
          <Animated.View style={[styles.revealInner, revealAnimatedStyle]}>
            <Ionicons name="checkmark-circle" size={28} color={colors.statusApprove} />
            <Text style={styles.revealText}>Approve</Text>
          </Animated.View>
        </View>
      )}

      <GestureDetector gesture={panGesture}>
        <Animated.View style={cardAnimatedStyle}>
          {/* Swipe tint overlay — green intensifies as the user drags right */}
          <Animated.View
            pointerEvents="none"
            style={[StyleSheet.absoluteFill, { borderRadius: radius.lg, zIndex: 10 }, cardTintStyle]}
          />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={
              selectMode
                ? `${selected ? 'Deselect' : 'Select'} claim about ${subjectName}, ${predicateLabel}`
                : `Claim about ${subjectName}, ${predicateLabel}. Open for details.`
            }
            accessibilityHint={
              selectMode
                ? undefined
                : 'Swipe right to approve, left to reject. Or use accessibility actions.'
            }
            accessibilityActions={
              selectMode
                ? undefined
                : [
                    { name: 'approve', label: 'Approve claim' },
                    { name: 'reject', label: 'Reject claim' },
                  ]
            }
            onAccessibilityAction={(e) => {
              if (selectMode) return;
              if (e.nativeEvent.actionName === 'approve') {
                handleApprove();
              } else if (e.nativeEvent.actionName === 'reject') {
                handleReject();
              }
            }}
            accessibilityState={selectMode ? { selected } : undefined}
            onPress={() => {
              if (selectMode) {
                onToggleSelect?.();
                return;
              }
              const navigate = () => {
                router.push({
                  pathname: '/claim/[id]',
                  params: { id: claim.id },
                } as any);
              };
              if (!onDoublePress) {
                navigate();
                return;
              }
              const now = Date.now();
              const elapsed = now - lastTapAtRef.current;
              if (elapsed < 300 && singleTapTimerRef.current) {
                clearTimeout(singleTapTimerRef.current);
                singleTapTimerRef.current = null;
                lastTapAtRef.current = 0;
                onDoublePress();
                return;
              }
              lastTapAtRef.current = now;
              singleTapTimerRef.current = setTimeout(() => {
                singleTapTimerRef.current = null;
                lastTapAtRef.current = 0;
                navigate();
              }, 300);
            }}
            onLongPress={selectMode ? undefined : onLongPress}
            delayLongPress={350}
            style={({ pressed }) => [
              selectMode && selected && styles.selectedCardWrap,
              pressed && !selectMode && {
                opacity: 0.85,
                transform: [{ scale: 0.97 }],
              },
            ]}
          >
          <GlassCard
            style={{
              ...styles.card,
              borderLeftWidth: 3,
              borderLeftColor: riskColor,
            }}
            accessibilityLabel={`${riskLabel}: ${subjectName} ${predicateLabel}`}
          >
      {/* Header row */}
      <View style={styles.headerRow}>
        <StatusBadge status={claim.status} />
        {updatesExisting && (
          <View
            style={styles.updatesBadge}
            accessible
            accessibilityRole="text"
            accessibilityLabel="Updates existing claim"
          >
            <Ionicons name="git-compare-outline" size={9} color={colors.statusPending} />
            <Text style={styles.updatesBadgeText}>Updates existing</Text>
          </View>
        )}
        <View style={styles.headerRight}>
          <View style={styles.ageWrap}>
            <Text style={[styles.age, { color: ageColor }]}>{age}</Text>
            <View style={styles.ageTrack}>
              <View
                style={[
                  styles.ageFill,
                  { width: `${Math.max(4, agePct)}%`, backgroundColor: ageColor },
                ]}
              />
            </View>
          </View>
          {!selectMode && (
            <View style={styles.quickActions}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Reject claim about ${subjectName}`}
                onPress={handleReject}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.quickBtn,
                  styles.quickRejectBtn,
                  pressed && styles.quickBtnPressed,
                ]}
              >
                <Ionicons name="close-sharp" size={14} color={colors.statusReject} />
              </Pressable>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Approve claim about ${subjectName}`}
                onPress={handleApprove}
                hitSlop={6}
                style={({ pressed }) => [
                  styles.quickBtn,
                  styles.quickApproveBtn,
                  pressed && styles.quickBtnPressed,
                ]}
              >
                <Ionicons
                  name="checkmark-sharp"
                  size={14}
                  color={colors.statusApprove}
                />
              </Pressable>
            </View>
          )}
        </View>
      </View>

      {/* Subject */}
      <HighlightedText
        text={subjectName}
        query={query}
        style={styles.subject}
        numberOfLines={1}
      />

      {/* Predicate → Value */}
      <View style={styles.predicateRow}>
        <HighlightedText
          text={predicateLabel}
          query={query}
          style={styles.predicateLabel}
        />
      </View>

      {/* Value display */}
      <View style={styles.valueBox}>
        <Text style={styles.valueText} numberOfLines={4}>
          {displayValue}
        </Text>
      </View>

      {/* Inline context strip — corroboration, confidence, age */}
      <View style={styles.contextStrip}>
        <Text style={styles.contextItem}>
          {corroborations > 0
            ? `✓ ${corroborations} source${corroborations === 1 ? '' : 's'}`
            : '⚠ single source'}
        </Text>
        <Text style={styles.contextDot}>·</Text>
        <Text style={styles.contextItem}>
          conf {confidenceScore.toFixed(1)}
        </Text>
        <Text style={styles.contextDot}>·</Text>
        <Text style={[styles.contextItem, { color: ageColor }]}>
          {age}
        </Text>
      </View>
      {/* Predicate category */}
      <Text style={styles.contextCategory} numberOfLines={1}>
        {predicate.includes('.')
          ? predicate.split('.').slice(0, -1).join(' · ')
          : predicate.replace(/_/g, ' ')}
      </Text>

      {/* Source row */}
      <View style={styles.sourceRow}>
        <Pressable
          onPress={() => {
            if (claim.source?.id && !selectMode) {
              router.push({
                pathname: '/source/[id]',
                params: { id: claim.source.id },
              } as any);
            }
          }}
          disabled={!claim.source?.id || selectMode}
          style={({ pressed }) => [
            styles.sourceChip,
            pressed &&
              claim.source?.id &&
              !selectMode && {
                opacity: 0.65,
                transform: [{ scale: 0.97 }],
              },
          ]}
        >
          <Text style={styles.sourceLabel} numberOfLines={1}>
            {sourceName}
          </Text>
          <Text
            style={[
              styles.trustScore,
              Number(trustScore) >= 7.5 ? styles.trustHigh : styles.trustLow,
            ]}
          >
            {Number(trustScore).toFixed(1)}
          </Text>
          {claim.source?.id && !selectMode && (
            <Ionicons name="chevron-forward" size={11} color={colors.slate} />
          )}
        </Pressable>
        {corroborations > 0 && (
          <View style={styles.corrobBadge}>
            <Ionicons name="layers-outline" size={12} color={colors.silver} />
            <Text style={styles.corrobCount}>{corroborations}</Text>
          </View>
        )}
      </View>

          </GlassCard>
          {selectMode && (
            <View
              style={[
                styles.selectOverlay,
                selected && styles.selectOverlayActive,
              ]}
              pointerEvents="none"
            >
              <View
                style={[styles.checkbox, selected && styles.checkboxActive]}
              >
                {selected && (
                  <Ionicons name="checkmark" size={16} color={colors.obsidian} />
                )}
              </View>
            </View>
          )}
          </Pressable>
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

function formatPredicate(pred: string): string {
  // "person.crew_chief_profile" → "Crew Chief Profile"
  const last = pred.includes('.') ? pred.split('.').pop()! : pred;
  return last
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function getRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

const styles = StyleSheet.create({
  swipeWrap: {
    position: 'relative',
    marginBottom: spacing.md,
    // Subtle atmospheric teal glow on the glass border
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.15,
    shadowRadius: 14,
    elevation: 2,
  },
  revealLayer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.35)',
    borderRadius: radius.lg,
    justifyContent: 'center',
    paddingLeft: spacing.lg + spacing.md,
  },
  revealInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  revealText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 16,
    color: colors.statusApprove,
    letterSpacing: -0.2,
  },
  selectedCardWrap: {
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 4,
  },
  selectOverlay: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    zIndex: 10,
  },
  selectOverlayActive: {
    // kept for future state-dependent tweaks
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: colors.slate,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    borderColor: colors.teal,
    backgroundColor: colors.teal,
  },
  card: {
    marginBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  ageWrap: {
    alignItems: 'flex-end',
    gap: 2,
  },
  age: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
  },
  ageTrack: {
    width: 40,
    height: 2,
    borderRadius: 1,
    backgroundColor: 'rgba(255,255,255,0.06)',
    overflow: 'hidden',
  },
  ageFill: {
    height: '100%',
    borderRadius: 1,
  },
  subject: {
    fontFamily: fonts.archivo.bold,
    fontSize: 17,
    color: colors.alabaster,
    marginBottom: 2,
  },
  predicateRow: {
    marginBottom: spacing.sm,
  },
  predicateLabel: {
    fontFamily: fonts.mono.medium,
    fontSize: 12,
    color: colors.teal,
  },
  valueBox: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm + 2,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  valueText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.silver,
    lineHeight: 18,
  },
  contextStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  contextItem: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.silver,
    opacity: 0.6,
    fontVariant: ['tabular-nums'],
  },
  contextDot: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    opacity: 0.4,
  },
  contextCategory: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.silver,
    opacity: 0.6,
    marginBottom: spacing.sm,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xs,
    gap: spacing.sm,
  },
  sourceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    gap: spacing.xs,
    flex: 1,
  },
  sourceLabel: {
    fontFamily: fonts.archivo.regular,
    fontSize: 11,
    color: colors.silver,
    flex: 1,
  },
  trustScore: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  trustHigh: {
    color: colors.statusApprove,
  },
  trustLow: {
    color: colors.statusPending,
  },
  corrobBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  corrobCount: {
    fontFamily: fonts.mono.medium,
    fontSize: 12,
    color: colors.silver,
    fontVariant: ['tabular-nums'],
  },
  updatesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.statusPending,
    backgroundColor: 'rgba(245, 158, 11, 0.1)',
  },
  updatesBadgeText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 8,
    color: colors.statusPending,
    letterSpacing: 0.5,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  quickActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
  },
  quickBtn: {
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  quickBtnPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.94 }],
  },
  quickApproveBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: colors.statusApprove,
  },
  quickRejectBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: colors.statusReject,
  },
});

// Memoized — the Queue renders up to 30 cards and re-renders on every
// batch-select toggle, so skipping unchanged rows matters.
export const ClaimCard = React.memo(ClaimCardImpl);
