import React, { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, fonts, spacing, radius } from '../constants/brand';

const STORAGE_KEY = 'stroom.hasSeenGestureHints';

const HINTS = [
  {
    icon: 'swap-horizontal-outline' as const,
    label: 'Swipe right to approve',
    sub: 'Quick governance on Queue cards',
  },
  {
    icon: 'hand-left-outline' as const,
    label: 'Double-tap for preview',
    sub: 'Peek at claim details without navigating',
  },
  {
    icon: 'finger-print' as const,
    label: 'Long-press for options',
    sub: 'Context menus on cards and entities',
  },
  {
    icon: 'phone-portrait-outline' as const,
    label: 'Shake to report',
    sub: 'Capture debug info when something breaks',
  },
];

export function GestureHintsOverlay() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then((v) => {
      if (v !== '1') setVisible(true);
    });
  }, []);

  const dismiss = () => {
    Haptics.selectionAsync();
    setVisible(false);
    AsyncStorage.setItem(STORAGE_KEY, '1');
  };

  if (!visible) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(200)}
      style={styles.overlay}
    >
      <View style={styles.card}>
        <Text style={styles.title}>Welcome to Command Center</Text>
        <Text style={styles.subtitle}>
          A few gestures to get you started
        </Text>

        <View style={styles.hints}>
          {HINTS.map((h, i) => (
            <Animated.View
              key={h.label}
              entering={FadeIn.delay(150 + i * 100).duration(250)}
              style={styles.hint}
            >
              <View style={styles.iconCircle}>
                <Ionicons name={h.icon} size={20} color={colors.teal} />
              </View>
              <View style={styles.hintText}>
                <Text style={styles.hintLabel}>{h.label}</Text>
                <Text style={styles.hintSub}>{h.sub}</Text>
              </View>
            </Animated.View>
          ))}
        </View>

        <Pressable
          onPress={dismiss}
          style={({ pressed }) => [
            styles.btn,
            pressed && { opacity: 0.8 },
          ]}
          accessibilityRole="button"
          accessibilityLabel="Dismiss gesture hints"
        >
          <Text style={styles.btnText}>Got it</Text>
        </Pressable>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 999,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'rgba(31, 31, 31, 0.95)',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.10)',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 20,
    color: colors.alabaster,
    marginBottom: 4,
    textAlign: 'center',
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    marginBottom: spacing.lg,
    textAlign: 'center',
  },
  hints: {
    width: '100%',
    gap: spacing.md,
    marginBottom: spacing.xl,
  },
  hint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0, 161, 155, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hintText: {
    flex: 1,
  },
  hintLabel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  hintSub: {
    fontFamily: fonts.archivo.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  btn: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 12,
    borderRadius: radius.md,
    backgroundColor: colors.teal,
  },
  btnText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 15,
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
});
