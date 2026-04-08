import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenCanvas } from '../../src/components/ScreenCanvas';
import { GlassCard } from '../../src/components/GlassCard';
import { EmptyState } from '../../src/components/EmptyState';
import {
  getProjectBySlug,
  CLIENT_TYPE_LABEL,
  type Project,
} from '../../src/lib/projects';
import { colors, fonts, spacing, radius } from '../../src/constants/brand';

// Projects detail — skeleton. Reads the hardcoded registry; shows an
// under-construction card + static metadata. Real per-project surfaces
// (claims, activity, deployments) land in the Day 2 OTA.
export default function ProjectDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const project = slug ? getProjectBySlug(slug) : undefined;

  return (
    <View style={styles.container}>
      <ScreenCanvas />

      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [
            styles.backBtn,
            pressed && { opacity: 0.6 },
          ]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back to Projects"
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Projects</Text>
        </Pressable>
        {project ? (
          <Text style={styles.title} numberOfLines={1}>
            {project.displayName}
          </Text>
        ) : null}
      </View>

      {!project ? (
        <EmptyState
          icon="alert-circle-outline"
          title="Project not found"
          subtitle={`No project registered with slug "${slug ?? ''}".`}
        />
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            { paddingBottom: insets.bottom + spacing.xxl },
          ]}
          showsVerticalScrollIndicator={false}
        >
          {/* Under construction */}
          <GlassCard style={styles.constructionCard}>
            <View style={styles.constructionIconWrap}>
              <Ionicons
                name="ellipsis-horizontal"
                size={40}
                color={colors.teal}
              />
            </View>
            <Text style={styles.constructionTitle}>Under construction</Text>
            <Text style={styles.constructionSubtitle}>
              Integration ships in Day 2 OTA
            </Text>
          </GlassCard>

          {/* Metadata */}
          <GlassCard style={styles.metaCard}>
            <MetaRow
              label="Slug"
              value={project.slug}
              mono
            />
            <MetaRow
              label="Domain"
              value={project.primaryDomain ?? 'TBD'}
              mono
              muted={!project.primaryDomain}
            />
            <MetaRow label="Stack" value={project.stackSummary} />
            <MetaRow
              label="Type"
              value={CLIENT_TYPE_LABEL[project.clientType]}
            />
            <MetaRow
              label="Status"
              value={capitalize(project.status)}
              last
            />
          </GlassCard>
        </ScrollView>
      )}
    </View>
  );
}

function MetaRow({
  label,
  value,
  mono,
  muted,
  last,
}: {
  label: string;
  value: string;
  mono?: boolean;
  muted?: boolean;
  last?: boolean;
}) {
  return (
    <View style={[styles.metaRow, !last && styles.metaRowDivider]}>
      <Text style={styles.metaLabel}>{label}</Text>
      <Text
        style={[
          styles.metaValue,
          mono && styles.metaValueMono,
          muted && styles.metaValueMuted,
        ]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function capitalize(s: string): string {
  return s.length === 0 ? s : s.charAt(0).toUpperCase() + s.slice(1);
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
    fontSize: 28,
    color: colors.teal,
    letterSpacing: -0.6,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  constructionCard: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  constructionIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.tealDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  constructionTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 16,
    color: colors.silver,
    letterSpacing: -0.2,
  },
  constructionSubtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
  },
  metaCard: {
    padding: spacing.md,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing.sm,
    gap: spacing.md,
  },
  metaRowDivider: {
    borderBottomWidth: 1,
    borderBottomColor: colors.glassBorder,
  },
  metaLabel: {
    width: 72,
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.slate,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  metaValue: {
    flex: 1,
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
    textAlign: 'right',
  },
  metaValueMono: {
    fontFamily: fonts.mono.regular,
    fontSize: 13,
  },
  metaValueMuted: {
    color: colors.slate,
    fontStyle: 'italic',
  },
});
