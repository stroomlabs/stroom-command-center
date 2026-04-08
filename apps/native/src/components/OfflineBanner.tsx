import React, { useEffect, useRef, useState } from 'react';
import { Text, StyleSheet } from 'react-native';
import Animated, { SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useOfflineSync } from '../lib/OfflineSyncContext';
import { colors, fonts } from '../constants/brand';

// Three-state network banner, mounted once at the root layout.
//
//   offline:    persistent amber — "No connection — changes will queue offline"
//   syncing:    green with spinner — "Back online — syncing N actions…"
//   synced:     green, auto-dismisses after ~1s — "Synced"
//   backOnline: green, auto-dismisses after ~2s — "Back online" (no pending work)
//
// The banner sits below the safe area inset but above tab content. Slides in
// from the top via Reanimated layout animations (200ms).
type BannerState =
  | { kind: 'hidden' }
  | { kind: 'offline' }
  | { kind: 'syncing'; count: number }
  | { kind: 'synced' }
  | { kind: 'backOnline' };

const AMBER = '#D97706';
const GREEN = colors.statusApprove;
const BANNER_HEIGHT = 36;

export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const { isOnline, pendingCount } = useOfflineSync();

  const [state, setState] = useState<BannerState>(
    isOnline ? { kind: 'hidden' } : { kind: 'offline' }
  );

  // Track previous values so we can detect transitions: offline→online and
  // pending→0 (drain complete) without re-running on every render.
  const prevOnlineRef = useRef(isOnline);
  const prevPendingRef = useRef(pendingCount);
  const autoDismissRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAutoDismiss = () => {
    if (autoDismissRef.current) {
      clearTimeout(autoDismissRef.current);
      autoDismissRef.current = null;
    }
  };

  useEffect(() => {
    const wasOnline = prevOnlineRef.current;
    const prevPending = prevPendingRef.current;
    prevOnlineRef.current = isOnline;
    prevPendingRef.current = pendingCount;

    // Offline → persistent amber, cancel any pending auto-dismiss.
    if (!isOnline) {
      clearAutoDismiss();
      setState({ kind: 'offline' });
      return;
    }

    // Online transition path.
    if (!wasOnline && isOnline) {
      clearAutoDismiss();
      if (pendingCount > 0) {
        setState({ kind: 'syncing', count: pendingCount });
      } else {
        setState({ kind: 'backOnline' });
        autoDismissRef.current = setTimeout(() => {
          setState({ kind: 'hidden' });
        }, 2000);
      }
      return;
    }

    // Still online, but pending count dropped to 0 while we were showing the
    // syncing banner — flip to "Synced" for 1s then hide.
    if (
      isOnline &&
      state.kind === 'syncing' &&
      prevPending > 0 &&
      pendingCount === 0
    ) {
      clearAutoDismiss();
      setState({ kind: 'synced' });
      autoDismissRef.current = setTimeout(() => {
        setState({ kind: 'hidden' });
      }, 1000);
      return;
    }

    // Still online, syncing, count updated — keep banner in sync with the
    // current pending number so it counts down live.
    if (isOnline && state.kind === 'syncing' && pendingCount > 0) {
      setState({ kind: 'syncing', count: pendingCount });
    }
  }, [isOnline, pendingCount, state.kind]);

  useEffect(() => {
    return () => clearAutoDismiss();
  }, []);

  if (state.kind === 'hidden') return null;

  const isOffline = state.kind === 'offline';
  const background = isOffline ? AMBER : GREEN;
  const icon: keyof typeof Ionicons.glyphMap = isOffline
    ? 'cloud-offline-outline'
    : state.kind === 'syncing'
    ? 'sync-outline'
    : 'checkmark-circle-outline';
  const label =
    state.kind === 'offline'
      ? 'No connection — changes will queue offline'
      : state.kind === 'syncing'
      ? `Back online — syncing ${state.count} action${state.count === 1 ? '' : 's'}…`
      : state.kind === 'synced'
      ? 'Synced'
      : 'Back online';

  return (
    <Animated.View
      entering={SlideInUp.duration(200)}
      exiting={SlideOutUp.duration(200)}
      pointerEvents="none"
      style={[
        styles.banner,
        {
          backgroundColor: background,
          paddingTop: insets.top,
          height: BANNER_HEIGHT + insets.top,
        },
      ]}
      accessible
      accessibilityRole="alert"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={14} color="#FFFFFF" />
      <Text style={styles.text}>{label}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  text: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
});
