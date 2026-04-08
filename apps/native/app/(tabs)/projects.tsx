import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenCanvas } from '../../src/components/ScreenCanvas';
import { ScreenTransition } from '../../src/components/ScreenTransition';
import { GlassCard } from '../../src/components/GlassCard';
import { haptics } from '../../src/lib/haptics';
import {
  PROJECTS,
  CLIENT_TYPE_LABEL,
  type Project,
} from '../../src/lib/projects';
import { colors, fonts, spacing, radius } from '../../src/constants/brand';

// Projects tab — Stroom Labs client hub. Skeleton only: cards render from
// the hardcoded PROJECTS registry. Tap → detail screen. Real integration
// (Supabase projects table, live activity) ships in the Day 2 OTA.
export default function ProjectsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const handlePress = (project: Project) => {
    haptics.tap.light();
    router.push(`/projects/${project.slug}` as any);
  };

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <ScreenTransition>
        <ScrollView
          contentContainerStyle={[
            styles.scroll,
            {
              paddingTop: insets.top + spacing.lg,
              paddingBottom: insets.bottom + spacing.xxl,
            },
          ]}
          showsVerticalScrollIndicator={false}
        >
          <Text style={styles.title}>Projects</Text>
          <Text style={styles.subtitle}>Stroom Labs client hub</Text>

          <View style={styles.list}>
            {PROJECTS.map((project) => (
              <ProjectCard
                key={project.slug}
                project={project}
                onPress={() => handlePress(project)}
              />
            ))}
          </View>
        </ScrollView>
      </ScreenTransition>
    </View>
  );
}

function ProjectCard({
  project,
  onPress,
}: {
  project: Project;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel={`${project.displayName}, ${CLIENT_TYPE_LABEL[project.clientType]}. Open project detail.`}
    >
      <GlassCard style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.cardName} numberOfLines={1}>
            {project.displayName}
          </Text>
          <ClientTypePill clientType={project.clientType} />
        </View>

        <Text
          style={[
            styles.cardDomain,
            !project.primaryDomain && styles.cardDomainMuted,
          ]}
          numberOfLines={1}
        >
          {project.primaryDomain ?? 'Domain TBD'}
        </Text>

        <View style={styles.cardFooter}>
          <Text style={styles.cardStack} numberOfLines={1}>
            {project.stackSummary}
          </Text>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.slate}
          />
        </View>
      </GlassCard>
    </Pressable>
  );
}

function ClientTypePill({
  clientType,
}: {
  clientType: Project['clientType'];
}) {
  const variant = PILL_VARIANTS[clientType];
  return (
    <View
      style={[
        styles.pill,
        {
          backgroundColor: variant.bg,
          borderColor: variant.border,
          borderWidth: variant.borderWidth,
        },
      ]}
    >
      <Text style={[styles.pillText, { color: variant.text }]}>
        {CLIENT_TYPE_LABEL[clientType]}
      </Text>
    </View>
  );
}

const PILL_VARIANTS: Record<
  Project['clientType'],
  { bg: string; text: string; border: string; borderWidth: number }
> = {
  internal: {
    bg: colors.teal,
    text: colors.black,
    border: 'transparent',
    borderWidth: 0,
  },
  external_retainer: {
    bg: colors.silver,
    text: colors.black,
    border: 'transparent',
    borderWidth: 0,
  },
  external_project: {
    bg: 'transparent',
    text: colors.silver,
    border: 'rgba(200, 204, 206, 0.4)',
    borderWidth: 1,
  },
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scroll: {
    paddingHorizontal: spacing.lg,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.teal,
    letterSpacing: -0.8,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    marginTop: 4,
    marginBottom: spacing.lg,
  },
  list: {
    gap: spacing.md,
  },
  pressed: {
    opacity: 0.85,
    transform: [{ scale: 0.985 }],
  },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cardName: {
    flex: 1,
    fontFamily: fonts.archivo.bold,
    fontSize: 16,
    color: colors.alabaster,
    letterSpacing: -0.2,
  },
  cardDomain: {
    fontFamily: fonts.mono.regular,
    fontSize: 12,
    color: colors.silver,
  },
  cardDomainMuted: {
    color: colors.slate,
    fontStyle: 'italic',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: 2,
  },
  cardStack: {
    flex: 1,
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
  },
  pillText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 10,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
});
