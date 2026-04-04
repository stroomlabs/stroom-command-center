import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { EntitySearchResult } from '@stroom/supabase';
import { colors, fonts, spacing, radius } from '../constants/brand';

interface EntityRowProps {
  entity: EntitySearchResult;
  onPress: () => void;
}

export function EntityRow({ entity, onPress }: EntityRowProps) {
  const name = entity.canonical_name || entity.name || 'Unnamed entity';
  const type = entity.entity_type || entity.entity_class || 'entity';
  const domain = entity.domain;

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}
    >
      <View style={styles.body}>
        <Text style={styles.name} numberOfLines={1}>
          {name}
        </Text>
        <View style={styles.metaRow}>
          <View style={styles.typeChip}>
            <Text style={styles.typeText}>{type}</Text>
          </View>
          {domain && (
            <Text style={styles.domain} numberOfLines={1}>
              {domain}
            </Text>
          )}
        </View>
        {entity.description && (
          <Text style={styles.description} numberOfLines={2}>
            {entity.description}
          </Text>
        )}
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.slate} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.sm,
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.6,
    borderColor: colors.glassBorderHover,
  },
  body: {
    flex: 1,
    gap: 4,
  },
  name: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.alabaster,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  typeChip: {
    backgroundColor: colors.tealDim,
    borderRadius: radius.sm,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeText: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    color: colors.teal,
    textTransform: 'lowercase',
  },
  domain: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    flex: 1,
  },
  description: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    lineHeight: 16,
    marginTop: 2,
  },
});
