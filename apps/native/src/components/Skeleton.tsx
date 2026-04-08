import React, { useEffect } from 'react';
import { View, StyleSheet, type ViewStyle, type StyleProp } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { colors, radius, spacing } from '../constants/brand';

// A single shimmering placeholder block.
export function Skeleton({
  style,
  height,
  width,
}: {
  style?: StyleProp<ViewStyle>;
  height?: number;
  width?: number | string;
}) {
  const pulse = useSharedValue(0.35);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(0.75, { duration: 900, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [pulse]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View
      style={[
        styles.base,
        height != null ? { height } : undefined,
        width != null ? ({ width } as any) : undefined,
        style,
        animatedStyle,
      ]}
    />
  );
}

// Matches the shape of a PulseMetric card — used in Pulse loading state.
export function SkeletonMetricCard() {
  return (
    <View style={styles.metricCard}>
      <Skeleton height={10} width={56} style={{ marginBottom: spacing.sm }} />
      <Skeleton height={28} width={'60%'} />
    </View>
  );
}

// Generic row placeholder — entity/source search result, predicate list row,
// sibling source card, anything that renders as a title + short meta line.
export function SkeletonListRow() {
  return (
    <View style={styles.listRow}>
      <Skeleton height={14} width={'70%'} style={{ marginBottom: 6 }} />
      <Skeleton height={10} width={'40%'} />
    </View>
  );
}

// Stack of SkeletonListRow — use as ListEmptyComponent while data loads so
// the screen doesn't flash a bare ActivityIndicator.
export function SkeletonListPlaceholder({ count = 6 }: { count?: number }) {
  return (
    <View>
      {Array.from({ length: count }, (_, i) => (
        <SkeletonListRow key={`skel-row-${i}`} />
      ))}
    </View>
  );
}

// Detail-screen placeholder — large title block + stacked body lines. Used on
// claim / entity / source detail screens while the RPC is in flight.
export function SkeletonDetail() {
  return (
    <View style={styles.detail}>
      <Skeleton height={28} width={'75%'} style={{ marginBottom: spacing.sm }} />
      <Skeleton height={12} width={'45%'} style={{ marginBottom: spacing.lg }} />
      <Skeleton height={80} width={'100%'} style={{ marginBottom: spacing.md }} />
      <Skeleton height={14} width={'60%'} style={{ marginBottom: 8 }} />
      <Skeleton height={14} width={'80%'} style={{ marginBottom: 8 }} />
      <Skeleton height={14} width={'55%'} style={{ marginBottom: spacing.lg }} />
      <Skeleton height={60} width={'100%'} />
    </View>
  );
}

// Matches the shape of a ClaimCard — used in Queue loading state.
export function SkeletonClaimCard() {
  return (
    <View style={styles.claimCard}>
      <View style={styles.claimHeader}>
        <Skeleton height={18} width={74} style={{ borderRadius: 9 }} />
        <Skeleton height={12} width={40} />
      </View>
      <Skeleton height={18} width={'70%'} style={{ marginBottom: 6 }} />
      <Skeleton height={12} width={'40%'} style={{ marginBottom: spacing.sm }} />
      <Skeleton height={56} width={'100%'} style={{ marginBottom: spacing.sm }} />
      <Skeleton height={20} width={'55%'} />
    </View>
  );
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: radius.sm,
    overflow: 'hidden',
  },
  metricCard: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
  },
  claimCard: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.lg,
    padding: spacing.md,
    marginBottom: spacing.md,
    gap: 4,
  },
  claimHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  listRow: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.sm,
  },
  detail: {
    padding: spacing.lg,
  },
});
