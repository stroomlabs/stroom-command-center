import React from 'react';
import { View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import type { QueueClaim } from '@stroom/supabase';
import { GlassCard } from './GlassCard';
import { StatusBadge } from './StatusBadge';
import { colors, fonts, spacing, radius } from '../constants/brand';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SWIPE_THRESHOLD = 120;

interface ClaimCardProps {
  claim: QueueClaim;
  onApprove: () => void;
  onReject: () => void;
}

export function ClaimCard({ claim, onApprove, onReject }: ClaimCardProps) {
  const subjectName = claim.subject_entity?.canonical_name ?? 'Unknown entity';
  const objectName = claim.object_entity?.canonical_name;
  const sourceName = claim.source?.source_name ?? 'Unknown source';
  const trustScore = claim.source?.trust_score ?? 0;
  const predicate = claim.predicate ?? 'unknown';

  // Resolve display value — extract meaningful text from JSONB
  const displayValue = resolveDisplayValue(claim.value_jsonb, objectName);
  const corroborations = claim.corroboration_score ?? 0;
  const age = getRelativeTime(claim.created_at);

  // Clean predicate for display: "person.crew_chief_profile" → "Crew Chief Profile"
  const predicateLabel = formatPredicate(predicate);
  const predicateRaw = predicate;

  // Swipe-right-to-approve gesture
  const translateX = useSharedValue(0);
  const crossedThreshold = useSharedValue(false);

  const onThresholdHaptic = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  };

  const panGesture = Gesture.Pan()
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
      if (e.translationX >= SWIPE_THRESHOLD) {
        // Fling off-screen and approve
        translateX.value = withTiming(SCREEN_WIDTH, { duration: 220 }, () => {
          runOnJS(onApprove)();
        });
      } else {
        translateX.value = withSpring(0, { damping: 18, stiffness: 180 });
        crossedThreshold.value = false;
      }
    });

  const cardAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const revealAnimatedStyle = useAnimatedStyle(() => {
    const opacity = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD * 0.4, SWIPE_THRESHOLD],
      [0, 0.6, 1],
      Extrapolation.CLAMP
    );
    const iconScale = interpolate(
      translateX.value,
      [0, SWIPE_THRESHOLD],
      [0.6, 1.1],
      Extrapolation.CLAMP
    );
    return {
      opacity,
      transform: [{ scale: iconScale }],
    };
  });

  return (
    <View style={styles.swipeWrap}>
      {/* Green reveal layer (behind the card) */}
      <View style={styles.revealLayer} pointerEvents="none">
        <Animated.View style={[styles.revealInner, revealAnimatedStyle]}>
          <Ionicons name="checkmark-circle" size={28} color={colors.statusApprove} />
          <Text style={styles.revealText}>Approve</Text>
        </Animated.View>
      </View>

      <GestureDetector gesture={panGesture}>
        <Animated.View style={cardAnimatedStyle}>
          <GlassCard style={styles.card}>
      {/* Header row */}
      <View style={styles.headerRow}>
        <StatusBadge status={claim.status} />
        <Text style={styles.age}>{age}</Text>
      </View>

      {/* Subject */}
      <Text style={styles.subject} numberOfLines={1}>
        {subjectName}
      </Text>

      {/* Predicate → Value */}
      <View style={styles.predicateRow}>
        <Text style={styles.predicateLabel}>{predicateLabel}</Text>
      </View>

      {/* Value display */}
      <View style={styles.valueBox}>
        <Text style={styles.valueText} numberOfLines={4}>
          {displayValue}
        </Text>
      </View>

      {/* Source row */}
      <View style={styles.sourceRow}>
        <View style={styles.sourceChip}>
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
        </View>
        {corroborations > 0 && (
          <View style={styles.corrobBadge}>
            <Ionicons name="layers-outline" size={12} color={colors.silver} />
            <Text style={styles.corrobCount}>{corroborations}</Text>
          </View>
        )}
      </View>

      {/* Action buttons */}
      <View style={styles.actions}>
        <Pressable
          onPress={onReject}
          style={({ pressed }) => [
            styles.btn,
            styles.rejectBtn,
            pressed && styles.btnPressed,
          ]}
        >
          <Ionicons name="close" size={18} color={colors.statusReject} />
          <Text style={[styles.btnText, { color: colors.statusReject }]}>
            Reject
          </Text>
        </Pressable>

        <Pressable
          onPress={onApprove}
          style={({ pressed }) => [
            styles.btn,
            styles.approveBtn,
            pressed && styles.btnPressed,
          ]}
        >
          <Ionicons name="checkmark" size={18} color={colors.statusApprove} />
          <Text style={[styles.btnText, { color: colors.statusApprove }]}>
            Approve
          </Text>
        </Pressable>
      </View>
          </GlassCard>
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

// ── Value resolution ──

function resolveDisplayValue(
  jsonb: Record<string, unknown> | null,
  objectName: string | null | undefined
): string {
  if (objectName) return objectName;
  if (!jsonb) return '—';

  // Simple scalar value
  if ('value' in jsonb && typeof jsonb.value !== 'object') {
    return String(jsonb.value);
  }

  // Named entity-like objects
  if ('name' in jsonb) return String(jsonb.name);

  // Data array — summarize
  if ('data' in jsonb && Array.isArray(jsonb.data)) {
    const arr = jsonb.data as any[];
    if (arr.length === 0) return '(empty)';
    const first = arr[0];
    const name = first?.name || first?.driver || first?.team || Object.values(first)[0];
    if (arr.length === 1) return String(name);
    return `${name} + ${arr.length - 1} more`;
  }

  // Type/tier pattern (common in research claims)
  if ('type' in jsonb) {
    const parts: string[] = [];
    if (jsonb.tier) parts.push(`T${jsonb.tier}`);
    parts.push(formatSnakeCase(String(jsonb.type)));
    return parts.join(' · ');
  }

  // Range/estimate pattern
  if ('range' in jsonb) return String(jsonb.range);

  // Fallback: show first 2-3 key:value pairs
  const entries = Object.entries(jsonb).slice(0, 3);
  return entries.map(([k, v]) => `${formatSnakeCase(k)}: ${truncate(String(v), 30)}`).join('\n');
}

function formatPredicate(pred: string): string {
  // "person.crew_chief_profile" → "Crew Chief Profile"
  const last = pred.includes('.') ? pred.split('.').pop()! : pred;
  return last
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatSnakeCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '…' : s;
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
  card: {
    marginBottom: 0,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  age: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    fontVariant: ['tabular-nums'],
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
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.lg,
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
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  btn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: radius.md,
    gap: spacing.xs,
    borderWidth: 1,
  },
  btnPressed: {
    opacity: 0.7,
  },
  approveBtn: {
    backgroundColor: 'rgba(34, 197, 94, 0.08)',
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  rejectBtn: {
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderColor: 'rgba(239, 68, 68, 0.2)',
  },
  btnText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
  },
});
