import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { ScreenCanvas } from '../src/components/ScreenCanvas';
import { ScreenWatermark } from '../src/components/ScreenWatermark';
import { GlassCard } from '../src/components/GlassCard';
import { useCapabilities } from '../src/hooks/useCapabilities';
import { colors, fonts, spacing, radius } from '../src/constants/brand';

// DR-036 — read-only view of the current operator's role + verticals +
// effective capability set. Pure display: no edits, no role changes,
// no invite flow. The write-side surfaces ship in batch 32b.

const formatLastActive = (iso: string | null): string => {
  if (!iso) return 'never';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 'never';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

// Group capability keys by their dotted prefix so the long flat list
// reads as Claims / Entities / Sources / etc. instead of one
// undifferentiated wall of toggles.
const CATEGORY_LABEL: Record<string, string> = {
  claims: 'Claims',
  entities: 'Entities',
  sources: 'Sources',
  predicates: 'Predicates',
  command: 'Command',
  projects: 'Projects',
  research: 'Research',
  audit: 'Audit',
  policies: 'Policies',
  users: 'Operators',
  admin: 'Admin',
};

interface CapabilityGroup {
  key: string;
  label: string;
  items: { key: string; label: string; granted: boolean }[];
}

function groupCapabilities(caps: Record<string, boolean>): CapabilityGroup[] {
  const buckets = new Map<string, { key: string; label: string; granted: boolean }[]>();
  for (const [key, value] of Object.entries(caps)) {
    const [prefix, ...rest] = key.split('.');
    const groupKey = prefix || 'other';
    const item = {
      key,
      label:
        rest.length > 0
          ? rest.join('.').replace(/[._]/g, ' ')
          : key.replace(/[._]/g, ' '),
      granted: value === true,
    };
    const list = buckets.get(groupKey) ?? [];
    list.push(item);
    buckets.set(groupKey, list);
  }
  const groups: CapabilityGroup[] = [];
  for (const [key, items] of buckets.entries()) {
    items.sort((a, b) => a.label.localeCompare(b.label));
    groups.push({
      key,
      label: CATEGORY_LABEL[key] ?? key.charAt(0).toUpperCase() + key.slice(1),
      items,
    });
  }
  groups.sort((a, b) => a.label.localeCompare(b.label));
  return groups;
}

export default function MyRoleScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const {
    role,
    email,
    displayName,
    capabilities,
    verticals,
    lastActiveAt,
    invitedBy,
    isLoading,
  } = useCapabilities();

  const groups = useMemo(() => groupCapabilities(capabilities), [capabilities]);
  const grantedCount = useMemo(
    () => Object.values(capabilities).filter((v) => v === true).length,
    [capabilities]
  );

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
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>My Role</Text>
        <Text style={styles.subtitle}>
          {displayName ?? email ?? 'Operator profile'}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {isLoading && !role ? (
          <View style={styles.loading}>
            <ActivityIndicator color={colors.teal} />
          </View>
        ) : (
          <>
            {/* Role identity card */}
            <GlassCard style={styles.card}>
              <View style={styles.roleHeader}>
                <View style={styles.roleIconWrap}>
                  <Ionicons
                    name={
                      (role?.icon as any) ??
                      ('shield-checkmark-outline' as const)
                    }
                    size={22}
                    color={colors.teal}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardLabel}>ROLE</Text>
                  <Text style={styles.roleName}>
                    {role?.display_name ?? 'Unknown'}
                  </Text>
                </View>
                <Text style={styles.capCount}>
                  {grantedCount}{' '}
                  <Text style={styles.capCountUnit}>
                    {grantedCount === 1 ? 'cap' : 'caps'}
                  </Text>
                </Text>
              </View>
              {role?.description && (
                <Text style={styles.roleDescription}>{role.description}</Text>
              )}
            </GlassCard>

            {/* Verticals card */}
            <GlassCard style={styles.card}>
              <Text style={styles.cardLabel}>VERTICALS GRANTED</Text>
              {verticals.length === 0 ? (
                <Text style={styles.empty}>No verticals assigned</Text>
              ) : (
                <View style={styles.chipRow}>
                  {verticals.map((v) => (
                    <View key={v} style={styles.chip}>
                      <Text style={styles.chipText}>{v}</Text>
                    </View>
                  ))}
                </View>
              )}
            </GlassCard>

            {/* Capabilities card */}
            <GlassCard style={styles.card}>
              <Text style={styles.cardLabel}>CAPABILITIES</Text>
              {groups.length === 0 ? (
                <Text style={styles.empty}>No capabilities defined</Text>
              ) : (
                groups.map((group) => (
                  <View key={group.key} style={styles.group}>
                    <Text style={styles.groupLabel}>{group.label}</Text>
                    {group.items.map((item) => (
                      <View key={item.key} style={styles.capRow}>
                        <Ionicons
                          name={
                            item.granted
                              ? 'checkmark-circle'
                              : 'close-circle-outline'
                          }
                          size={14}
                          color={
                            item.granted ? colors.statusApprove : colors.slate
                          }
                        />
                        <Text
                          style={[
                            styles.capLabel,
                            !item.granted && styles.capLabelDenied,
                          ]}
                        >
                          {item.label}
                        </Text>
                        <Text
                          style={styles.capKey}
                          numberOfLines={1}
                          ellipsizeMode="head"
                        >
                          {item.key}
                        </Text>
                      </View>
                    ))}
                  </View>
                ))
              )}
            </GlassCard>

            {/* Footer metadata */}
            <View style={styles.footer}>
              <Text style={styles.footerText}>
                Last active {formatLastActive(lastActiveAt)}
              </Text>
              {invitedBy && (
                <Text style={styles.footerText}>Invited by {invitedBy}</Text>
              )}
            </View>
          </>
        )}
      </ScrollView>
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
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.slate,
    marginTop: 4,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  loading: {
    paddingTop: 60,
    alignItems: 'center',
  },
  card: {
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardLabel: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 1.2,
  },
  roleHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  roleIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 161, 155, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.30)',
  },
  roleName: {
    fontFamily: fonts.archivo.bold,
    fontSize: 22,
    color: colors.alabaster,
    letterSpacing: -0.4,
    marginTop: 2,
  },
  roleDescription: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.silver,
    lineHeight: 18,
    marginTop: spacing.xs,
  },
  capCount: {
    fontFamily: fonts.mono.semibold,
    fontSize: 22,
    color: colors.teal,
  },
  capCountUnit: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.slate,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    backgroundColor: 'rgba(0, 161, 155, 0.10)',
  },
  chipText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: colors.teal,
    letterSpacing: 0.2,
  },
  empty: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    fontStyle: 'italic',
  },
  group: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  groupLabel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.silver,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: spacing.xs,
  },
  capRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
  },
  capLabel: {
    flex: 1,
    fontFamily: fonts.archivo.medium,
    fontSize: 13,
    color: colors.alabaster,
    textTransform: 'capitalize',
  },
  capLabelDenied: {
    color: colors.slate,
  },
  capKey: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    maxWidth: '40%',
  },
  footer: {
    paddingTop: spacing.sm,
    alignItems: 'center',
    gap: 4,
  },
  footerText: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
});
