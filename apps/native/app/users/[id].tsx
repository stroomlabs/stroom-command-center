import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenCanvas } from '../../src/components/ScreenCanvas';
import { ScreenWatermark } from '../../src/components/ScreenWatermark';
import { GlassCard } from '../../src/components/GlassCard';
import { colors, fonts, spacing } from '../../src/constants/brand';

// Placeholder — invite / role management lands in batch 32b. The route is
// registered now so the operators list can link into a stable path; the
// real surface (role pickers, capability overrides, deactivation) gets
// wired up alongside the write-side mutations.

export default function UserDetailPlaceholderScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <ScreenWatermark />

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to Operators"
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Operators</Text>
        </Pressable>
        <Text style={styles.title}>Operator</Text>
      </View>

      <View style={styles.body}>
        <GlassCard style={styles.card}>
          <Ionicons name="construct-outline" size={28} color={colors.teal} />
          <Text style={styles.cardTitle}>Under construction</Text>
          <Text style={styles.cardBody}>
            Invite / role management ships in batch 32b.
          </Text>
          {id && <Text style={styles.idLabel}>operator id: {id}</Text>}
        </GlassCard>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    marginBottom: spacing.sm,
  },
  backText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 16,
    color: colors.alabaster,
    marginLeft: 2,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
  },
  card: {
    padding: spacing.lg,
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 16,
    color: colors.alabaster,
  },
  cardBody: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.silver,
    textAlign: 'center',
  },
  idLabel: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: spacing.sm,
  },
});
