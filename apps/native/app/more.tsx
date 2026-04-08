import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ScrollView,
  ActivityIndicator,
  Switch,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Clipboard from 'expo-clipboard';
import { haptics, setReduceHaptics, getReduceHaptics } from '../src/lib/haptics';
import { useAuth } from '../src/lib/auth';
import { useGovernanceStats } from '../src/hooks/useGovernanceStats';
import { useTeam } from '../src/hooks/useTeam';
import { usePulseContext } from '../src/lib/PulseContext';
import {
  useBiometricLock,
  biometricLabel,
} from '../src/hooks/useBiometricLock';
import { useBrandAlert } from '../src/components/BrandAlert';
import { useBrandToast } from '../src/components/BrandToast';
import supabase from '../src/lib/supabase';
import { ScreenCanvas } from '../src/components/ScreenCanvas';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

export default function MoreScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, signOut } = useAuth();
  const { stats, loading: statsLoading } = useGovernanceStats();
  const { data: pulse } = usePulseContext();
  const { alert } = useBrandAlert();
  const { show: showToast } = useBrandToast();
  const { members, myInviteCode, generateInvite, refresh: refreshTeam } =
    useTeam();
  const {
    available: biometricAvailable,
    kind: biometricKind,
    enabled: biometricEnabled,
    setEnabled: setBiometricEnabled,
  } = useBiometricLock();
  const [generating, setGenerating] = useState(false);
  const [reduceHaptics, setReduceHapticsState] = useState<boolean>(
    getReduceHaptics()
  );

  const handleGenerateInvite = useCallback(async () => {
    setGenerating(true);
    try {
      const code = await generateInvite();
      await Clipboard.setStringAsync(code);
      haptics.success();
      alert(
        'Invite code generated',
        `Code \`${code}\` copied to clipboard. Share it with a teammate — they'll use it at sign-in to get operator access.`
      );
      refreshTeam();
    } catch (e: any) {
      haptics.error();
      showToast(e?.message ?? 'Generate failed', 'error');
    } finally {
      setGenerating(false);
    }
  }, [generateInvite, alert, refreshTeam, showToast]);
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
          .schema('intel')
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
              haptics.success();
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
        .schema('intel')
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
      haptics.success();
      showToast(
        `Exported ${data?.length ?? 0} sessions to clipboard`,
        'success'
      );
    } catch (e: any) {
      haptics.error();
      showToast(e?.message ?? 'Export failed', 'error');
    } finally {
      setExporting(false);
    }
  }, [exporting, appVersion, user, showToast]);

  const [exportingSummary, setExportingSummary] = useState(false);

  const handleExportGraphSummary = useCallback(async () => {
    if (exportingSummary) return;
    setExportingSummary(true);
    try {
      // Pull top 5 domains by claim count from the vertical breakdown RPC.
      // If the call fails we still produce a summary — the domains section
      // just becomes "(unavailable)".
      let topDomains: Array<{ domain: string; claim_count: number }> = [];
      try {
        const { data } = await supabase.schema('intel').rpc('get_vertical_breakdown');
        if (Array.isArray(data)) {
          topDomains = (data as Array<{ domain: string; claim_count: number }>)
            .sort((a, b) => (b.claim_count ?? 0) - (a.claim_count ?? 0))
            .slice(0, 5);
        }
      } catch {
        // Swallow — topDomains stays empty and we render "(unavailable)".
      }

      // Count distinct predicates via a head count on the predicates table.
      let predicateCount: number | null = null;
      try {
        const { count } = await supabase
          .schema('intel')
          .from('predicates')
          .select('predicate_key', { count: 'exact', head: true });
        predicateCount = count ?? null;
      } catch {
        predicateCount = null;
      }

      const lines = [
        'STROOM COMMAND CENTER — GRAPH SUMMARY',
        `Generated: ${new Date().toLocaleString()}`,
        `App version: v${appVersion}`,
        '',
        '── Graph totals ──',
        `Claims:     ${(pulse?.totalClaims ?? 0).toLocaleString()}`,
        `Entities:   ${(pulse?.totalEntities ?? 0).toLocaleString()}`,
        `Sources:    ${(pulse?.totalSources ?? 0).toLocaleString()}`,
        `Predicates: ${predicateCount !== null ? predicateCount.toLocaleString() : '(unavailable)'}`,
        '',
        '── Governance ──',
        `Queue depth:     ${pulse?.queueDepth ?? 0}`,
        `Correction rate: ${((pulse?.correctionRate ?? 0) * 100).toFixed(1)}%`,
        `Research active: ${pulse?.researchActive ?? 0}`,
        `Claims today:    ${pulse?.claimsToday ?? 0}`,
        '',
        '── Top 5 domains by claim count ──',
        topDomains.length > 0
          ? topDomains
              .map(
                (d, i) =>
                  `${i + 1}. ${d.domain} — ${(d.claim_count ?? 0).toLocaleString()}`
              )
              .join('\n')
          : '(unavailable)',
      ];
      await Clipboard.setStringAsync(lines.join('\n'));
      haptics.success();
      showToast('Copied to clipboard', 'success');
    } catch (e: any) {
      haptics.error();
      showToast(e?.message ?? 'Export failed', 'error');
    } finally {
      setExportingSummary(false);
    }
  }, [exportingSummary, appVersion, pulse, showToast]);

  const handleClearAllSessions = useCallback(() => {
    alert(
      'Clear all sessions?',
      'This permanently deletes every Command chat thread stored in the graph. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              // Supabase requires a WHERE clause on delete; filter on a
              // column that's always populated to clear every row.
              const { error } = await supabase
                .schema('intel')
                .from('command_sessions')
                .delete()
                .not('id', 'is', null);
              if (error) throw error;
              haptics.success();
              showToast('All sessions cleared', 'success');
            } catch (e: any) {
              haptics.error();
              showToast(e?.message ?? 'Clear failed', 'error');
            }
          },
        },
      ]
    );
  }, [alert, showToast]);

  const handleResetPreferences = useCallback(() => {
    alert(
      'Reset preferences?',
      'Clears all locally stored preferences. This will reset your biometric lock setting, last-visit timestamps, onboarding state, and Command session id. You will stay signed in.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              const keys = await AsyncStorage.getAllKeys();
              // Skip auth tokens so the user stays signed in.
              const targets = keys.filter(
                (k) => !k.startsWith('sb-') && !k.includes('auth-token')
              );
              if (targets.length > 0) {
                await AsyncStorage.multiRemove(targets);
              }
              haptics.success();
              showToast(`Reset ${targets.length} preferences`, 'success');
            } catch (e: any) {
              showToast(e?.message ?? 'Reset failed', 'error');
            }
          },
        },
      ]
    );
  }, [alert, showToast]);

  const handleSignOut = () => {
    alert('Sign Out', 'End your Command Center session?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: signOut },
    ]);
  };

  return (
    <View style={styles.container}>
      <ScreenCanvas />
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
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Command</Text>
        </Pressable>
        <Text style={styles.headerTitle}>More</Text>

        {/* About — version, build, backend connection, and graph totals.
            Sits at the top of the screen so operators can confirm what
            they're looking at before they touch anything else. */}
        <View style={styles.aboutCard}>
          <Text style={styles.sectionLabel}>ABOUT</Text>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutKey}>Version</Text>
            <Text style={styles.aboutValue}>v{appVersion}</Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutKey}>Build</Text>
            <Text style={styles.aboutValue}>
              {(Constants.expoConfig as any)?.ios?.buildNumber ??
                (Constants.expoConfig as any)?.android?.versionCode ??
                'dev'}
            </Text>
          </View>
          <View style={styles.aboutRow}>
            <Text style={styles.aboutKey}>Supabase</Text>
            <View style={styles.aboutStatusRow}>
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
              <Text style={styles.aboutValue}>
                {connected === null
                  ? 'Checking…'
                  : connected
                  ? 'Connected'
                  : 'Unreachable'}
              </Text>
            </View>
          </View>
          <View style={styles.aboutDivider} />
          <View style={styles.aboutGraphRow}>
            <View style={styles.aboutGraphCell}>
              <Text style={styles.aboutGraphValue}>
                {(pulse?.totalClaims ?? 0).toLocaleString()}
              </Text>
              <Text style={styles.aboutGraphLabel}>CLAIMS</Text>
            </View>
            <View style={styles.aboutGraphCell}>
              <Text style={styles.aboutGraphValue}>
                {(pulse?.totalEntities ?? 0).toLocaleString()}
              </Text>
              <Text style={styles.aboutGraphLabel}>ENTITIES</Text>
            </View>
            <View style={styles.aboutGraphCell}>
              <Text style={styles.aboutGraphValue}>
                {(pulse?.totalSources ?? 0).toLocaleString()}
              </Text>
              <Text style={styles.aboutGraphLabel}>SOURCES</Text>
            </View>
          </View>
        </View>

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

        {/* Team */}
        <View style={styles.teamCard}>
          <View style={styles.teamHeader}>
            <Text style={styles.teamTitle}>TEAM</Text>
            <Text style={styles.teamCount}>
              {members.length} {members.length === 1 ? 'operator' : 'operators'}
            </Text>
          </View>
          {members.map((m) => (
            <View key={m.user_id} style={styles.teamRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: m.online
                      ? colors.statusApprove
                      : colors.slate,
                  },
                ]}
              />
              <View style={{ flex: 1 }}>
                <Text style={styles.teamName} numberOfLines={1}>
                  {m.display_name ?? m.email ?? m.user_id.slice(0, 8)}
                  {m.is_me ? ' (you)' : ''}
                </Text>
                <Text style={styles.teamMeta} numberOfLines={1}>
                  {m.online
                    ? 'online now'
                    : m.last_seen
                    ? `last seen ${formatRelative(m.last_seen)}`
                    : 'never seen'}
                </Text>
              </View>
            </View>
          ))}

          <Pressable
            onPress={handleGenerateInvite}
            disabled={generating}
            style={({ pressed }) => [
              styles.inviteBtn,
              pressed && { opacity: 0.7, transform: [{ scale: 0.97 }] },
              generating && { opacity: 0.6 },
            ]}
          >
            <Ionicons name="share-outline" size={14} color={colors.teal} />
            <Text style={styles.inviteBtnText}>
              {generating ? 'Generating…' : 'Share Access'}
            </Text>
          </Pressable>
          {myInviteCode ? (
            <View style={styles.inviteCodeBox}>
              <Text style={styles.inviteCodeLabel}>CURRENT CODE</Text>
              <Text style={styles.inviteCodeValue}>{myInviteCode}</Text>
            </View>
          ) : null}
        </View>

        {/* Biometric lock toggle — only shown when the device supports it */}
        {biometricAvailable && (
          <View style={styles.biometricRow}>
            <Ionicons
              name={
                biometricKind === 'face'
                  ? 'scan-outline'
                  : biometricKind === 'touch'
                  ? 'finger-print'
                  : 'lock-closed-outline'
              }
              size={18}
              color={colors.silver}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.biometricLabel}>
                Require {biometricLabel(biometricKind)}
              </Text>
              <Text style={styles.biometricMeta}>
                Lock the app on launch
              </Text>
            </View>
            <Switch
              value={biometricEnabled}
              onValueChange={(v) => {
                haptics.tap.light();
                void setBiometricEnabled(v);
              }}
              trackColor={{ false: colors.surfaceCard, true: colors.teal }}
              thumbColor={colors.alabaster}
              ios_backgroundColor={colors.surfaceCard}
              accessibilityRole="switch"
              accessibilityLabel={`Require Face ID: ${biometricEnabled ? 'on' : 'off'}`}
            />
          </View>
        )}

        {/* Reduce haptics toggle — when on, every call through the
            grammar layer becomes a no-op. Persisted in AsyncStorage. */}
        <View style={styles.biometricRow}>
          <Ionicons
            name="pulse-outline"
            size={18}
            color={colors.silver}
          />
          <View style={{ flex: 1 }}>
            <Text style={styles.biometricLabel}>Reduce Haptics</Text>
            <Text style={styles.biometricMeta}>
              Silence all tap / impact / notification feedback
            </Text>
          </View>
          <Switch
            value={reduceHaptics}
            onValueChange={(v) => {
              // Fire BEFORE updating the setting — otherwise flipping ON
              // would skip the confirmation tap. Flipping OFF fires after
              // so the first tap post-off is the confirmation.
              if (!v) {
                void setReduceHaptics(v);
                setReduceHapticsState(v);
                haptics.tap.light();
              } else {
                haptics.tap.light();
                void setReduceHaptics(v);
                setReduceHapticsState(v);
              }
            }}
            trackColor={{ false: colors.surfaceCard, true: colors.teal }}
            thumbColor={colors.alabaster}
            ios_backgroundColor={colors.surfaceCard}
            accessibilityRole="switch"
            accessibilityLabel={`Reduce haptics: ${reduceHaptics ? 'on' : 'off'}`}
          />
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
          <MenuItem
            icon="git-compare-outline"
            label="Dismissed merges"
            onPress={() => router.push('/dismissed-merges' as any)}
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

        {/* Tools — non-destructive export helpers. */}
        <Text style={styles.sectionHeader}>TOOLS</Text>
        <View style={styles.menu}>
          <MenuItem
            icon={
              exportingSummary ? 'hourglass-outline' : 'clipboard-outline'
            }
            label={
              exportingSummary
                ? 'Copying…'
                : 'Export Graph Summary'
            }
            onPress={exportingSummary ? undefined : handleExportGraphSummary}
            disabled={exportingSummary}
          />
        </View>

        {/* Danger Zone — destructive operations. Both actions require
            confirmation and show a red left border on the section card. */}
        <Text style={[styles.sectionHeader, styles.dangerHeader]}>
          DANGER ZONE
        </Text>
        <View style={styles.dangerCard}>
          <Pressable
            onPress={handleClearAllSessions}
            style={({ pressed }) => [
              styles.dangerItem,
              pressed && styles.dangerPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Clear all command sessions"
          >
            <Ionicons
              name="chatbubbles-outline"
              size={18}
              color={colors.statusReject}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerLabel}>Clear All Sessions</Text>
              <Text style={styles.dangerSub}>
                Delete every Command chat thread
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.slate} />
          </Pressable>
          <View style={styles.dangerDivider} />
          <Pressable
            onPress={handleResetPreferences}
            style={({ pressed }) => [
              styles.dangerItem,
              pressed && styles.dangerPressed,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Reset all preferences"
          >
            <Ionicons
              name="refresh-circle-outline"
              size={18}
              color={colors.statusReject}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.dangerLabel}>Reset Preferences</Text>
              <Text style={styles.dangerSub}>
                Clear biometric lock & local settings
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={16} color={colors.slate} />
          </Pressable>
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
            Stroom Labs · Command Center v{appVersion}
          </Text>
          <Text style={styles.infoLine}>
            Governance tool for the StroomHelix knowledge graph
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
    </View>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const d = Math.floor(hr / 24);
  return `${d}d ago`;
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
    color: colors.teal,
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
    marginBottom: spacing.md,
  },
  teamCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: spacing.md,
    marginBottom: spacing.xl,
    gap: spacing.sm,
  },
  teamHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
    marginBottom: 2,
  },
  teamTitle: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
  },
  teamCount: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
  },
  teamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  teamName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 13,
    color: colors.alabaster,
  },
  teamMeta: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 1,
  },
  inviteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    backgroundColor: colors.tealDim,
    marginTop: spacing.xs,
  },
  inviteBtnText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 12,
    color: colors.teal,
  },
  inviteCodeBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surfaceCard,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
  },
  inviteCodeLabel: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 1,
  },
  inviteCodeValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 14,
    color: colors.teal,
    letterSpacing: 1.5,
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
  biometricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    marginBottom: spacing.md,
  },
  biometricLabel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  biometricMeta: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
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
    transform: [{ scale: 0.97 }],
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
  aboutCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  sectionLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
  },
  aboutRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  aboutKey: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.silver,
  },
  aboutValue: {
    fontFamily: fonts.mono.regular,
    fontSize: 12,
    color: colors.alabaster,
  },
  aboutStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  aboutDivider: {
    height: 1,
    backgroundColor: colors.glassBorder,
    marginVertical: spacing.sm,
  },
  aboutGraphRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  aboutGraphCell: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  aboutGraphValue: {
    fontFamily: fonts.mono.semibold,
    fontSize: 16,
    color: colors.teal,
    fontVariant: ['tabular-nums'],
  },
  aboutGraphLabel: {
    fontFamily: fonts.archivo.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 0.9,
  },
  sectionHeader: {
    fontFamily: fonts.archivo.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
    marginBottom: spacing.sm,
    marginTop: spacing.md,
    paddingHorizontal: 2,
  },
  dangerHeader: {
    color: colors.statusReject,
  },
  dangerCard: {
    backgroundColor: colors.surfaceElevated,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.25)',
    marginBottom: spacing.xl,
    overflow: 'hidden',
  },
  dangerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.md,
  },
  dangerPressed: {
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
  },
  dangerDivider: {
    height: 1,
    backgroundColor: 'rgba(239, 68, 68, 0.18)',
  },
  dangerLabel: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.statusReject,
  },
  dangerSub: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    marginTop: 2,
  },
});
