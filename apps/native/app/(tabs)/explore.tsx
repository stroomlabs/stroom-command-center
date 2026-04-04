import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { colors, fonts, spacing, gradient } from '../../src/constants/brand';

export default function ExploreScreen() {
  const insets = useSafeAreaInsets();

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <View style={[styles.inner, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.headerTitle}>Explore</Text>
        <View style={styles.placeholder}>
          <Ionicons name="search-outline" size={48} color={colors.slate} />
          <Text style={styles.placeholderTitle}>Entity & Claim Explorer</Text>
          <Text style={styles.placeholderBody}>
            Search and browse 3,700+ entities, drill into claims, inspect source
            lineage. Coming in Session 3.
          </Text>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { flex: 1, paddingHorizontal: spacing.lg },
  headerTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.alabaster,
    letterSpacing: -0.8,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: 80,
  },
  placeholderTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 18,
    color: colors.silver,
  },
  placeholderBody: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
});
