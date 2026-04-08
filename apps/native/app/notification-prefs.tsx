import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  Switch,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { haptics } from '../src/lib/haptics';
import {
  useNotificationPrefs,
  type NotificationPrefs,
} from '../src/hooks/useNotificationPrefs';
import { ScreenCanvas } from '../src/components/ScreenCanvas';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

type PrefKey = keyof NotificationPrefs;

interface Row {
  key: PrefKey;
  icon: keyof typeof import('@expo/vector-icons/build/Ionicons').Ionicons.glyphMap;
  title: string;
  body: string;
}

const ROWS: Row[] = [
  {
    key: 'notifyOnNewClaims',
    icon: 'layers-outline',
    title: 'New claims in Queue',
    body: 'Push when a new claim enters governance review.',
  },
  {
    key: 'notifyOnResearchComplete',
    icon: 'flask-outline',
    title: 'Research complete',
    body: 'Push when a research_queue item finishes and has staged claims.',
  },
  {
    key: 'notifyOnSourceHealth',
    icon: 'pulse',
    title: 'Source health alerts',
    body: 'Push when a source trust score drops or a monitor fails.',
  },
];

export default function NotificationPrefsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { prefs, loading, saving, error, update } = useNotificationPrefs();

  const handleToggle = (key: PrefKey, value: boolean) => {
    haptics.tap.light();
    update({ [key]: value });
  };

  return (
    <View style={styles.container}>
      <ScreenCanvas />
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>More</Text>
        </Pressable>
        <Text style={styles.title}>Notifications</Text>
        <Text style={styles.subtitle}>
          Manage which events trigger a push notification.
          {saving && ' Saving…'}
        </Text>
      </View>

      {loading ? (
        <View style={styles.centered}>
          <ActivityIndicator color={colors.teal} size="large" />
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
        >
          {error && (
            <View style={styles.errorBox}>
              <Ionicons name="warning-outline" size={14} color={colors.statusReject} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          )}

          <View style={styles.list}>
            {ROWS.map((row, idx) => (
              <View
                key={row.key}
                style={[styles.row, idx > 0 && styles.rowDivider]}
              >
                <View style={styles.rowIcon}>
                  <Ionicons name={row.icon} size={18} color={colors.teal} />
                </View>
                <View style={styles.rowBody}>
                  <Text style={styles.rowTitle}>{row.title}</Text>
                  <Text style={styles.rowBodyText}>{row.body}</Text>
                </View>
                <Switch
                  value={prefs[row.key]}
                  onValueChange={(v) => handleToggle(row.key, v)}
                  trackColor={{ false: colors.surfaceCard, true: colors.teal }}
                  thumbColor={colors.alabaster}
                  ios_backgroundColor={colors.surfaceCard}
                />
              </View>
            ))}
          </View>

          <Text style={styles.footnote}>
            Preferences are stored in intel.operator_profiles.preferences and
            consulted by the push delivery Edge Function.
          </Text>
        </ScrollView>
      )}
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
  content: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  list: {
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
  },
  rowDivider: {
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  rowIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  rowBody: {
    flex: 1,
    gap: 3,
  },
  rowTitle: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  rowBodyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    lineHeight: 16,
  },
  footnote: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: spacing.lg,
    lineHeight: 15,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    marginBottom: spacing.md,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.statusReject,
    flex: 1,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
