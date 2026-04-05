import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useAuth } from '../src/lib/auth';
import { useGovernanceStats } from '../src/hooks/useGovernanceStats';
import { useBrandAlert } from '../src/components/BrandAlert';
import { useBrandToast } from '../src/components/BrandToast';
import supabase from '../src/lib/supabase';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { stats, loading: statsLoading } = useGovernanceStats();
  const { alert } = useBrandAlert();
  const { show: showToast } = useBrandToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [exporting, setExporting] = useState(false);

  const appVersion =
    (Constants.expoConfig?.version as string | undefined) ?? '0.1.0';

  // Ping Supabase on mount to surface connection status as a dot indicator.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { error } = await supabase
          .from('entities')
          .select('id', { count: 'exact', head: true })
          .limit(1);
        if (!cancelled) setConnected(!error);
      } catch {
        if (!cancelled) setConnected(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleClearCache = useCallback(() => {
    alert(
      'Clear cache',
      'Remove cached session state and command threads from device storage? You will stay signed in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              const keys = await AsyncStorage.getAllKeys();
              const targets = keys.filter(
                (k) =>
                  k.startsWith('stroom.') ||
                  k.startsWith('stroom.command.') ||
                  k.includes('onboarding')
              );
              if (targets.length > 0) {
                await AsyncStorage.multiRemove(targets);
              }
              Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              showToast(`Cleared ${targets.length} keys`, 'success');
            } catch (e: any) {
              showToast(e?.message ?? 'Clear failed', 'error');
            }
          },
        },
      ]
    );
  }, [alert, showToast]);

  const handleExport = useCallback(async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const { data, error } = await supabase
        .from('command_sessions')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      const payload = {
        exported_at: new Date().toISOString(),
        app_version: appVersion,
        user: user?.email ?? null,
        sessions: data ?? [],
      };
      await Clipboard.setStringAsync(JSON.stringify(payload, null, 2));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      showToast(
        `Exported ${data?.length ?? 0} sessions to clipboard`,
        'success'
      );
    } catch (e: any) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      showToast(e?.message ?? 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  }, [exporting, appVersion, user, showToast]);

  const handleSignOut = () => {
    alert('Sign Out', 'End your Command Center session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      <ScrollView
        contentContainerStyle={[
          styles.inner,
          { paddingTop: insets.top + spacing.sm, paddingBottom: spacing.xxl },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <Pressable
          onPress={() => router.back()}
          style={({ pressed }) => [styles.backBtn, pressed && { opacity: 0.6 }]}
          hitSlop={10}
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Command</Text>
        </Pressable>
        <Text style={styles.headerTitle}>More</Text>

        {/* Quick Stats */}
        <View style={styles.statsCard}>
          <View style={styles.statsHeader}>
            <Text style={styles.statsHeaderText}>TODAY'S GOVERNANCE</Text>
            {statsLoading && (
              <Text style={styles.statsHeaderLoading}>loading…</Text>
            )}
          </View>
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: colors.statusApprove }]}>
                {stats.approvedToday}
              </Text>
              <Text style={styles.statLabel}>APPROVED</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={[styles.statValue, { color: colors.statusReject }]}>
                {stats.rejectedToday}
              </Text>
              <Text style={styles.statLabel}>REJECTED</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <View style={styles.streakRow}>
                <Ionicons name="flame" size={16} color={colors.statusPending} />
                <Text style={[styles.statValue, { color: colors.statusPending }]}>
                  {stats.streak}
                </Text>
              </View>
              <Text style={styles.statLabel}>
                {stats.streak === 1 ? 'DAY STREAK' : 'DAY STREAK'}
              </Text>
            </View>
          </View>
        </View>

        {/* User info */}
        <View style={styles.userCard}>
          <View style={styles.avatar}>
            <Text style={styles.avatarLetter}>
              {user?.email?.[0]?.toUpperCase() ?? 'S'}
            </Text>
          </View>
          <View>
            <Text style={styles.userName}>Operator</Text>
            <Text style={styles.userEmail}>{user?.email ?? '—'}</Text>
          </View>
        </View>

        {/* Menu items */}
        <View style={styles.menu}>
          <MenuItem
            icon="analytics-outline"
            label="Audit Trail"
            onPress={() => router.push('/audit' as any)}
          />
          <MenuItem
            icon="git-branch-outline"
            label="Research Queue"
            onPress={() => router.push('/research' as any)}
          />
          <MenuItem
            icon="notifications-outline"
            label="Notification Prefs"
            onPress={() => router.push('/notification-prefs' as any)}
          />
          <MenuItem icon="settings-outline" label="Policy Config" disabled />
          <MenuItem
            icon="trash-outline"
            label="Clear Cache"
            onPress={handleClearCache}
          />
          <MenuItem
            icon={exporting ? 'hourglass-outline' : 'download-outline'}
            label={exporting ? 'Exporting…' : 'Export Data'}
            onPress={exporting ? undefined : handleExport}
            disabled={exporting}
          />
        </View>

        {/* App info */}
        <View style={styles.infoBlock}>
          <View style={styles.connectionRow}>
            <View
              style={[
                styles.connectionDot,
                {
                  backgroundColor:
                    connected === null
                      ? colors.slate
                      : connected
                      ? colors.statusApprove
                      : colors.statusReject,
                },
              ]}
            />
            <Text style={styles.infoLine}>
              Supabase{' '}
              {connected === null
                ? 'checking…'
                : connected
                ? 'connected'
                : 'unreachable'}
            </Text>
          </View>
          <Text style={styles.infoLine}>
            Stroom Command Center v{appVersion}
          </Text>
          <Text style={styles.infoLine}>
            StroomHelix Engine · Supabase Realtime
          </Text>
          <Text style={styles.infoLine}>Stroom Labs © 2026</Text>
        </View>

        {/* Sign out */}
        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [styles.signOutBtn, pressed && styles.pressed]}
        >
          <Ionicons name="log-out-outline" size={18} color={colors.statusReject} />
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>
    </LinearGradient>
  );
}

function MenuItem({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  disabled?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.menuItem,
        disabled && styles.menuDisabled,
        pressed && !disabled && styles.menuPressed,
      ]}
      disabled={disabled}
    >
      <Ionicons name={icon} size={20} color={disabled ? colors.slate : colors.silver} />
      <Text style={[styles.menuLabel, disabled && styles.menuLabelDisabled]}>{label}</Text>
      {disabled && <Text style={styles.comingSoon}>Soon</Text>}
      <Ionicons name="chevron-forward" size={16} color={colors.slate} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  inner: { paddingHorizontal: spacing.lg },
  connectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  connectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
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
  headerTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 34,
    color: colors.alabaster,
    letterSpacing: -0.8,
    marginBottom: spacing.xl,
  },
  userCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: spacing.lg,
    marginBottom: spacing.xl,
  },
  statsCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: spacing.sm,
    paddingHorizontal: 4,
  },
  statsHeaderText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
  },
  statsHeaderLoading: {
    fontFamily: fonts.mono.regular,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.6,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statCell: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  streakRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 22,
    fontVariant: ['tabular-nums'],
  },
  statLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.9,
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: colors.glassBorder,
    marginVertical: spacing.xs,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: colors.tealDim,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarLetter: {
    fontFamily: fonts.archivo.bold,
    fontSize: 18,
    color: colors.teal,
  },
  userName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 16,
    color: colors.alabaster,
  },
  userEmail: {
    fontFamily: fonts.mono.regular,
    fontSize: 12,
    color: colors.slate,
    marginTop: 2,
  },
  menu: {
    gap: 1,
    marginBottom: spacing.xl,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
  },
  menuDisabled: {
    opacity: 0.5,
  },
  menuPressed: {
    backgroundColor: colors.surfaceCard,
    borderColor: colors.glassBorderHover,
  },
  menuLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 15,
    color: colors.alabaster,
    flex: 1,
  },
  menuLabelDisabled: {
    color: colors.slate,
  },
  comingSoon: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginRight: spacing.sm,
  },
  infoBlock: {
    alignItems: 'center',
    gap: 4,
    marginBottom: spacing.xl,
  },
  infoLine: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
  },
  signOutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: 14,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.2)',
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
  },
  pressed: { opacity: 0.7 },
  signOutText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.statusReject,
  },
});
