import React from 'react';
import { View, Text, StyleSheet, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, fonts, spacing } from '../constants/brand';

// Shared primary-tab header. Reference pattern is apps/native/app/(tabs)/
// command.tsx — compact top padding (insets.top + spacing.sm), 34pt bold
// teal title, 14pt slate subtitle, and an optional right-aligned actions
// slot. Every other tab header should render through this component so
// the vertical rhythm stays consistent.
//
// Command itself still uses its own inline header: it carries bespoke
// icon-row chrome + a session save-state indicator that would clutter
// this component's API. This header stays on-theme with it though —
// drop-in visually identical for the title/subtitle/actions pattern.

interface ScreenHeaderProps {
  title: string;
  subtitle?: string | React.ReactNode;
  actions?: React.ReactNode;
  style?: ViewStyle;
  // Extra content rendered *inside* the header block, below the title
  // row. Lets screens append compact metadata (e.g. Ops' "N stale
  // sources · M orphans" line) without re-implementing the header.
  children?: React.ReactNode;
}

export function ScreenHeader({
  title,
  subtitle,
  actions,
  style,
  children,
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.header,
        { paddingTop: insets.top + spacing.sm },
        style,
      ]}
    >
      <View style={styles.row}>
        <View style={styles.titleBlock}>
          <Text style={styles.title}>{title}</Text>
          {typeof subtitle === 'string' ? (
            <Text style={styles.subtitle}>{subtitle}</Text>
          ) : (
            subtitle
          )}
        </View>
        {actions && <View style={styles.actions}>{actions}</View>}
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  titleBlock: {
    flex: 1,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    marginTop: 4,
  },
  actions: {
    alignItems: 'flex-end',
    gap: 6,
    marginLeft: spacing.sm,
  },
});
