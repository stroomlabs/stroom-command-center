import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GlowSpot } from './GlowSpot';
import {
  useBiometricLock,
  biometricLabel,
} from '../hooks/useBiometricLock';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface BiometricGateProps {
  children: React.ReactNode;
  // Gate should only start prompting once the host app signals it's ready
  // to be unlocked (i.e. after BrandSplash has finished its minimum hold
  // + fade). Until `ready` flips true we stay quiet.
  ready: boolean;
}

// App-level biometric lock screen. Sits BEFORE Supabase auth so the
// operator has to unlock the app on every cold start (Face ID / Touch ID),
// regardless of whether a cached Supabase session exists. Honors the
// Settings toggle from useBiometricLock — if disabled or no hardware,
// children render immediately. On auth failure or cancel, a "Tap to retry"
// surface is shown; the user must explicitly retry (no automatic fallback
// to password).
export function BiometricGate({ children, ready }: BiometricGateProps) {
  const {
    ready: lockReady,
    available,
    kind,
    enabled,
    unlocked,
    authenticate,
    lastError,
  } = useBiometricLock();

  const promptedRef = useRef(false);

  // Auto-prompt once the splash has finished and the lock state is loaded.
  useEffect(() => {
    if (!ready || !lockReady) return;
    if (unlocked) return;
    if (!(available && enabled)) return;
    if (promptedRef.current) return;
    promptedRef.current = true;
    void authenticate();
  }, [ready, lockReady, unlocked, available, enabled, authenticate]);

  // Until the lock probe resolves, render a dark placeholder so we never
  // flash the login screen underneath.
  if (!lockReady) {
    return <View style={styles.container} pointerEvents="none" />;
  }

  if (unlocked) {
    return <>{children}</>;
  }

  const label = biometricLabel(kind);

  return (
    <View style={styles.container}>
      <GlowSpot size={520} opacity={0.08} style={styles.halo} breathe />
      <View style={styles.center}>
        <View style={styles.iconCircle}>
          <Ionicons
            name={
              kind === 'face'
                ? 'scan-outline'
                : kind === 'touch'
                ? 'finger-print'
                : 'lock-closed-outline'
            }
            size={40}
            color={colors.teal}
          />
        </View>
        <Text style={styles.title}>Stroom Command</Text>
        <Text style={styles.subtitle}>
          {lastError
            ? `Unlock failed. ${label} required.`
            : `Unlock with ${label}`}
        </Text>
        <Pressable
          onPress={() => {
            promptedRef.current = true;
            void authenticate();
          }}
          style={({ pressed }) => [
            styles.retryBtn,
            pressed && { opacity: 0.8, transform: [{ scale: 0.97 }] },
          ]}
          accessibilityRole="button"
          accessibilityLabel={`Unlock with ${label}`}
        >
          <Text style={styles.retryText}>Tap to retry</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0F14',
    alignItems: 'center',
    justifyContent: 'center',
  },
  halo: {
    top: '20%',
    left: '50%',
    marginLeft: -260,
  },
  center: {
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  iconCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    backgroundColor: colors.tealDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 22,
    color: colors.teal,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.silver,
    textAlign: 'center',
    marginBottom: spacing.lg,
    maxWidth: 280,
    lineHeight: 18,
  },
  retryBtn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 14,
    borderRadius: radius.full,
    backgroundColor: colors.teal,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 3,
  },
  retryText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    color: colors.obsidian,
    letterSpacing: 0.3,
  },
});
