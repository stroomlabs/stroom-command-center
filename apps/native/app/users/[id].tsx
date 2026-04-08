import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import supabase from '../../src/lib/supabase';
import { ScreenCanvas } from '../../src/components/ScreenCanvas';
import { ScreenWatermark } from '../../src/components/ScreenWatermark';
import { GlassCard } from '../../src/components/GlassCard';
import { ModalBackdrop } from '../../src/components/ModalBackdrop';
import { useBrandAlert } from '../../src/components/BrandAlert';
import { useBrandToast } from '../../src/components/BrandToast';
import { CapabilityGate } from '../../src/components/CapabilityGate';
import { useCapabilities } from '../../src/hooks/useCapabilities';
import {
  operatorAdmin,
  humanizeAdminError,
} from '../../src/lib/operatorAdmin';
import { VERTICAL_ORDER, VERTICAL_BUCKETS } from '../../src/lib/verticals';
import { colors, fonts, spacing, radius } from '../../src/constants/brand';

// DR-036 operator detail — full read + write surface. The caller must
// hold admin.manage_users to see any action buttons; even then, all
// action targeting the caller's own user_id is hidden because the
// server rejects self-mutations and we want the UI to mirror that.
//
// Every successful write refetches the profile and toasts the result,
// keeping the operator on the same screen so they can make multiple
// changes without bouncing back to the list.

interface ProfileRow {
  user_id: string;
  display_name: string | null;
  email: string | null;
  role_id: string | null;
  allowed_verticals: string[] | null;
  last_active_at: string | null;
  invited_at: string | null;
  invited_by: string | null;
  is_disabled: boolean;
}

interface RoleRow {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
}

const VERTICAL_KEYS = VERTICAL_ORDER.filter((k) => k !== 'all');

const formatRelative = (iso: string | null): string => {
  if (!iso) return '—';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '—';
  const diff = Date.now() - then;
  if (diff < 60_000) return 'just now';
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return `${Math.floor(diff / 86_400_000)}d ago`;
};

export default function UserDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { alert } = useBrandAlert();
  const { show: showToast } = useBrandToast();
  const { userId: callerUserId, role: callerRole } = useCapabilities();

  const [profile, setProfile] = useState<ProfileRow | null>(null);
  const [role, setRole] = useState<RoleRow | null>(null);
  const [inviter, setInviter] = useState<{ display_name: string | null; email: string | null } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionInFlight, setActionInFlight] = useState<
    'role' | 'verticals' | 'resend' | 'toggle' | null
  >(null);

  const [roleSheetVisible, setRoleSheetVisible] = useState(false);
  const [verticalsSheetVisible, setVerticalsSheetVisible] = useState(false);
  const [allRoles, setAllRoles] = useState<RoleRow[]>([]);
  const [allRolesLoading, setAllRolesLoading] = useState(false);

  const isSelf = !!callerUserId && callerUserId === id;
  const isCallerOwner = callerRole?.name === 'owner';

  // Pull the target's profile + joined role + inviter display name.
  const load = useCallback(async () => {
    if (!id) return;
    try {
      const { data: profileRow, error: pErr } = await supabase
        .schema('intel')
        .from('operator_profiles')
        .select('*')
        .eq('user_id', id)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profileRow) {
        setError('Operator not found');
        return;
      }

      const p = profileRow as any;
      const prefs = (p.preferences ?? {}) as Record<string, unknown>;
      const normalized: ProfileRow = {
        user_id: String(p.user_id ?? p.id ?? id),
        display_name:
          (p.display_name as string | null) ??
          (prefs.display_name as string | undefined) ??
          null,
        email:
          (p.email as string | null) ??
          (prefs.email as string | undefined) ??
          null,
        role_id: p.role_id ? String(p.role_id) : null,
        allowed_verticals:
          (p.allowed_verticals as string[] | null) ?? null,
        last_active_at:
          (p.last_active_at as string | null) ??
          (p.updated_at as string | null) ??
          null,
        invited_at: (p.invited_at as string | null) ?? null,
        invited_by: (p.invited_by as string | null) ?? null,
        is_disabled: (p.is_disabled as boolean | null) === true,
      };
      setProfile(normalized);

      if (normalized.role_id) {
        const { data: roleRow } = await supabase
          .schema('intel')
          .from('operator_roles')
          .select('id, name, display_name, description')
          .eq('id', normalized.role_id)
          .maybeSingle();
        if (roleRow) {
          setRole({
            id: String((roleRow as any).id),
            name: String((roleRow as any).name ?? ''),
            display_name: String(
              (roleRow as any).display_name ??
                (roleRow as any).name ??
                'Operator'
            ),
            description:
              ((roleRow as any).description as string | null) ?? null,
          });
        }
      } else {
        setRole(null);
      }

      if (normalized.invited_by) {
        const { data: inviterRow } = await supabase
          .schema('intel')
          .from('operator_profiles')
          .select('display_name, email, preferences')
          .eq('user_id', normalized.invited_by)
          .maybeSingle();
        if (inviterRow) {
          const iPrefs = ((inviterRow as any).preferences ?? {}) as Record<
            string,
            unknown
          >;
          setInviter({
            display_name:
              ((inviterRow as any).display_name as string | null) ??
              (iPrefs.display_name as string | undefined) ??
              null,
            email:
              ((inviterRow as any).email as string | null) ??
              (iPrefs.email as string | undefined) ??
              null,
          });
        }
      } else {
        setInviter(null);
      }

      setError(null);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load operator');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Lazy-load all roles the first time the role picker opens.
  const ensureRolesLoaded = useCallback(async () => {
    if (allRoles.length > 0 || allRolesLoading) return;
    setAllRolesLoading(true);
    try {
      const { data } = await supabase
        .schema('intel')
        .from('operator_roles')
        .select('id, name, display_name, description')
        .order('display_name', { ascending: true });
      const mapped: RoleRow[] = ((data ?? []) as any[]).map((r) => ({
        id: String(r.id),
        name: String(r.name ?? ''),
        display_name: String(r.display_name ?? r.name ?? 'Operator'),
        description: (r.description as string | null) ?? null,
      }));
      setAllRoles(mapped);
    } finally {
      setAllRolesLoading(false);
    }
  }, [allRoles.length, allRolesLoading]);

  const handleOpenRoleSheet = async () => {
    await ensureRolesLoaded();
    setRoleSheetVisible(true);
  };

  const handleChangeRole = async (newRoleId: string) => {
    if (!profile) return;
    setRoleSheetVisible(false);
    setActionInFlight('role');
    try {
      await operatorAdmin({
        action: 'change_role',
        user_id: profile.user_id,
        role_id: newRoleId,
      });
      showToast('Role updated', 'success');
      await load();
    } catch (e: any) {
      showToast(humanizeAdminError(e?.message ?? 'unknown_error'), 'error');
    } finally {
      setActionInFlight(null);
    }
  };

  const handleSetVerticals = async (next: string[]) => {
    if (!profile) return;
    setVerticalsSheetVisible(false);
    setActionInFlight('verticals');
    try {
      await operatorAdmin({
        action: 'set_verticals',
        user_id: profile.user_id,
        allowed_verticals: next,
      });
      showToast('Verticals updated', 'success');
      await load();
    } catch (e: any) {
      showToast(humanizeAdminError(e?.message ?? 'unknown_error'), 'error');
    } finally {
      setActionInFlight(null);
    }
  };

  const handleResendInvite = async () => {
    if (!profile) return;
    setActionInFlight('resend');
    try {
      await operatorAdmin({
        action: 'resend_invite',
        user_id: profile.user_id,
      });
      showToast('Invitation resent', 'success');
    } catch (e: any) {
      showToast(humanizeAdminError(e?.message ?? 'unknown_error'), 'error');
    } finally {
      setActionInFlight(null);
    }
  };

  const handleToggleActive = () => {
    if (!profile) return;
    const isDeactivated = profile.is_disabled;
    const targetName = profile.display_name ?? profile.email ?? 'this operator';
    alert(
      isDeactivated ? 'Reactivate operator?' : 'Deactivate operator?',
      isDeactivated
        ? `${targetName} will regain access immediately.`
        : `${targetName} will lose access until reactivated. Their data and audit trail stay intact.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: isDeactivated ? 'Reactivate' : 'Deactivate',
          style: isDeactivated ? 'default' : 'destructive',
          onPress: async () => {
            setActionInFlight('toggle');
            try {
              await operatorAdmin({
                action: isDeactivated ? 'reactivate' : 'deactivate',
                user_id: profile.user_id,
              } as any);
              showToast(
                isDeactivated ? 'Operator reactivated' : 'Operator deactivated',
                'success'
              );
              await load();
            } catch (e: any) {
              showToast(
                humanizeAdminError(e?.message ?? 'unknown_error'),
                'error'
              );
            } finally {
              setActionInFlight(null);
            }
          },
        },
      ]
    );
  };

  const isPending = !!profile?.invited_at && !profile?.last_active_at;
  const isDeactivated = profile?.is_disabled === true;

  const cardOpacity = isDeactivated ? 0.5 : 1;

  // Initial verticals for the sheet — the set currently stored on the
  // profile. Empty Set ⇒ "inherited from role" (we send [] to clear).
  const currentVerticals = useMemo(
    () => new Set(profile?.allowed_verticals ?? []),
    [profile?.allowed_verticals]
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
          accessibilityLabel="Back to Operators"
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Operators</Text>
        </Pressable>
        <Text style={styles.title} numberOfLines={1}>
          {profile?.display_name ??
            profile?.email ??
            (loading ? 'Loading…' : 'Operator')}
        </Text>
      </View>

      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {loading && !profile ? (
          <View style={styles.centered}>
            <ActivityIndicator color={colors.teal} size="large" />
          </View>
        ) : error ? (
          <View style={styles.centered}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : profile ? (
          <>
            {/* Identity card */}
            <GlassCard
              style={StyleSheet.flatten([
                styles.card,
                { opacity: cardOpacity },
              ])}
            >
              <View style={styles.identityRow}>
                <View style={styles.identityBadge}>
                  <Ionicons
                    name="person-outline"
                    size={20}
                    color={colors.teal}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.identityEmail} numberOfLines={1}>
                    {profile.email ?? 'No email'}
                  </Text>
                  <View style={styles.pillRow}>
                    {isPending && (
                      <View
                        style={[
                          styles.statusPill,
                          { borderColor: colors.statusPending },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            { color: colors.statusPending },
                          ]}
                        >
                          PENDING
                        </Text>
                      </View>
                    )}
                    {isDeactivated && (
                      <View
                        style={[
                          styles.statusPill,
                          { borderColor: colors.statusReject },
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            { color: colors.statusReject },
                          ]}
                        >
                          DEACTIVATED
                        </Text>
                      </View>
                    )}
                    {isSelf && (
                      <View
                        style={[
                          styles.statusPill,
                          { borderColor: colors.teal },
                        ]}
                      >
                        <Text
                          style={[styles.statusPillText, { color: colors.teal }]}
                        >
                          YOU
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>

              {role && (
                <View style={styles.section}>
                  <Text style={styles.sectionLabel}>ROLE</Text>
                  <Text style={styles.roleName}>{role.display_name}</Text>
                  {role.description && (
                    <Text style={styles.roleDescription}>
                      {role.description}
                    </Text>
                  )}
                </View>
              )}

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>ALLOWED VERTICALS</Text>
                {profile.allowed_verticals &&
                profile.allowed_verticals.length > 0 ? (
                  <View style={styles.chipRow}>
                    {profile.allowed_verticals.map((v) => (
                      <View key={v} style={styles.chipStatic}>
                        <Text style={styles.chipStaticText}>{v}</Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <Text style={styles.inherited}>Inherited from role</Text>
                )}
              </View>

              <View style={styles.section}>
                <Text style={styles.sectionLabel}>LAST ACTIVE</Text>
                <Text style={styles.metaValue}>
                  {profile.last_active_at
                    ? formatRelative(profile.last_active_at)
                    : 'Never signed in'}
                </Text>
              </View>

              {inviter && (
                <Text style={styles.inviterFooter}>
                  Invited by{' '}
                  {inviter.display_name ?? inviter.email ?? 'another operator'}
                </Text>
              )}
            </GlassCard>

            {/* Action buttons — hidden entirely for self rows, and each
                gated on admin.manage_users. */}
            {!isSelf && (
              <CapabilityGate capability="admin.manage_users">
                <View style={styles.actions}>
                  <ActionButton
                    icon="swap-horizontal-outline"
                    label="Change Role"
                    onPress={handleOpenRoleSheet}
                    loading={actionInFlight === 'role'}
                  />
                  <ActionButton
                    icon="grid-outline"
                    label="Set Verticals"
                    onPress={() => setVerticalsSheetVisible(true)}
                    loading={actionInFlight === 'verticals'}
                  />
                  {isPending && (
                    <ActionButton
                      icon="mail-outline"
                      label="Resend Invite"
                      onPress={handleResendInvite}
                      loading={actionInFlight === 'resend'}
                    />
                  )}
                  <ActionButton
                    icon={
                      isDeactivated
                        ? 'checkmark-circle-outline'
                        : 'ban-outline'
                    }
                    label={isDeactivated ? 'Reactivate' : 'Deactivate'}
                    tone={isDeactivated ? 'default' : 'destructive'}
                    onPress={handleToggleActive}
                    loading={actionInFlight === 'toggle'}
                  />
                </View>
              </CapabilityGate>
            )}
          </>
        ) : null}
      </ScrollView>

      {/* Role picker sheet */}
      <Modal
        visible={roleSheetVisible}
        animationType="fade"
        transparent
        onRequestClose={() => setRoleSheetVisible(false)}
        statusBarTranslucent
      >
        <ModalBackdrop onPress={() => setRoleSheetVisible(false)}>
          <Pressable
            style={styles.sheet}
            onPress={() => {}}
            accessibilityRole="none"
          >
            <View style={styles.sheetHandle} />
            <Text style={styles.sheetTitle}>Change Role</Text>
            <Text style={styles.sheetSubtitle}>
              Select the new role for this operator.
            </Text>
            {allRolesLoading ? (
              <ActivityIndicator
                color={colors.teal}
                style={{ marginVertical: spacing.md }}
              />
            ) : (
              <View style={styles.sheetList}>
                {allRoles
                  .filter((r) => (isCallerOwner ? true : r.name !== 'owner'))
                  .map((r) => {
                    const selected = r.id === role?.id;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => handleChangeRole(r.id)}
                        style={({ pressed }) => [
                          styles.sheetRow,
                          selected && styles.sheetRowSelected,
                          pressed && { opacity: 0.8 },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                      >
                        <Ionicons
                          name={
                            selected
                              ? 'radio-button-on'
                              : 'radio-button-off'
                          }
                          size={18}
                          color={selected ? colors.teal : colors.slate}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.sheetRowName}>
                            {r.display_name}
                          </Text>
                          {r.description && (
                            <Text
                              style={styles.sheetRowDesc}
                              numberOfLines={2}
                            >
                              {r.description}
                            </Text>
                          )}
                        </View>
                      </Pressable>
                    );
                  })}
              </View>
            )}
            <Pressable
              onPress={() => setRoleSheetVisible(false)}
              style={styles.sheetCancel}
              accessibilityRole="button"
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
          </Pressable>
        </ModalBackdrop>
      </Modal>

      {/* Verticals picker sheet */}
      <VerticalsSheet
        visible={verticalsSheetVisible}
        initial={currentVerticals}
        onDismiss={() => setVerticalsSheetVisible(false)}
        onSave={handleSetVerticals}
      />
    </View>
  );
}

// Small button component — gray rounded rectangle with icon + label,
// optional tone="destructive" swap for the reject palette.
function ActionButton({
  icon,
  label,
  tone = 'default',
  loading,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  tone?: 'default' | 'destructive';
  loading?: boolean;
  onPress: () => void;
}) {
  const accent = tone === 'destructive' ? colors.statusReject : colors.teal;
  return (
    <Pressable
      onPress={onPress}
      disabled={loading}
      style={({ pressed }) => [
        styles.actionBtn,
        { borderColor: accent },
        pressed && { opacity: 0.75 },
        loading && { opacity: 0.5 },
      ]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      {loading ? (
        <ActivityIndicator color={accent} size="small" />
      ) : (
        <Ionicons name={icon} size={16} color={accent} />
      )}
      <Text style={[styles.actionBtnText, { color: accent }]}>{label}</Text>
    </Pressable>
  );
}

// Verticals picker sheet — multi-select chips, Save/Cancel footer. Held
// locally so the user can toggle multiple chips before committing.
function VerticalsSheet({
  visible,
  initial,
  onDismiss,
  onSave,
}: {
  visible: boolean;
  initial: Set<string>;
  onDismiss: () => void;
  onSave: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState<Set<string>>(new Set(initial));

  // Whenever the sheet opens, re-seed the draft from the latest stored
  // verticals so we don't display a stale selection from a previous open.
  useEffect(() => {
    if (visible) setDraft(new Set(initial));
  }, [visible, initial]);

  const toggle = (key: string) => {
    setDraft((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onDismiss}
      statusBarTranslucent
    >
      <ModalBackdrop onPress={onDismiss}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHandle} />
          <Text style={styles.sheetTitle}>Set Verticals</Text>
          <Text style={styles.sheetSubtitle}>
            Select zero or more. Empty = inherit from role.
          </Text>
          <View style={styles.chipRow}>
            {VERTICAL_KEYS.map((key) => {
              const bucket = VERTICAL_BUCKETS[key];
              const selected = draft.has(key);
              return (
                <Pressable
                  key={key}
                  onPress={() => toggle(key)}
                  style={({ pressed }) => [
                    styles.chip,
                    selected && styles.chipSelected,
                    pressed && { opacity: 0.8 },
                  ]}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected }}
                >
                  <Ionicons
                    name={bucket.icon as any}
                    size={12}
                    color={selected ? colors.teal : colors.slate}
                  />
                  <Text
                    style={[
                      styles.chipText,
                      selected && styles.chipTextSelected,
                    ]}
                  >
                    {bucket.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <View style={styles.sheetFooter}>
            <Pressable
              onPress={onDismiss}
              style={styles.sheetCancel}
              accessibilityRole="button"
            >
              <Text style={styles.sheetCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={() => onSave(Array.from(draft))}
              style={styles.sheetSave}
              accessibilityRole="button"
            >
              <Text style={styles.sheetSaveText}>Save</Text>
            </Pressable>
          </View>
        </Pressable>
      </ModalBackdrop>
    </Modal>
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
    fontSize: 30,
    color: colors.teal,
    letterSpacing: -0.6,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 40,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 14,
    color: colors.statusReject,
  },
  card: {
    padding: spacing.md,
    gap: spacing.md,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  identityBadge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 161, 155, 0.10)',
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.30)',
  },
  identityEmail: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 15,
    color: colors.alabaster,
  },
  pillRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  statusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.full,
    borderWidth: 1,
    backgroundColor: 'transparent',
  },
  statusPillText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 10,
    letterSpacing: 0.4,
  },
  section: {
    gap: 4,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.glassBorder,
  },
  sectionLabel: {
    fontFamily: fonts.mono.medium,
    fontSize: 9,
    color: colors.slate,
    letterSpacing: 1.2,
  },
  roleName: {
    fontFamily: fonts.archivo.bold,
    fontSize: 16,
    color: colors.alabaster,
  },
  roleDescription: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.silver,
    lineHeight: 16,
    marginTop: 2,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  chipStatic: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.35)',
    backgroundColor: 'rgba(0, 161, 155, 0.10)',
  },
  chipStaticText: {
    fontFamily: fonts.mono.semibold,
    fontSize: 11,
    color: colors.teal,
  },
  inherited: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
    fontStyle: 'italic',
  },
  metaValue: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  inviterFooter: {
    fontFamily: fonts.mono.regular,
    fontSize: 11,
    color: colors.slate,
    marginTop: 2,
  },
  actions: {
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.02)',
  },
  actionBtnText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 13,
    letterSpacing: 0.3,
  },
  // Sheet
  sheet: {
    backgroundColor: colors.surfaceSheet,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.sheetBorder,
    gap: spacing.sm,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    fontFamily: fonts.archivo.bold,
    fontSize: 18,
    color: colors.alabaster,
  },
  sheetSubtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.slate,
  },
  sheetList: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceElevated,
  },
  sheetRowSelected: {
    borderColor: colors.teal,
    backgroundColor: 'rgba(0, 161, 155, 0.08)',
  },
  sheetRowName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  sheetRowDesc: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    marginTop: 2,
  },
  sheetFooter: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  sheetCancel: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    alignItems: 'center',
    backgroundColor: colors.surfaceElevated,
  },
  sheetCancelText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.silver,
  },
  sheetSave: {
    flex: 1,
    paddingVertical: 13,
    borderRadius: radius.md,
    alignItems: 'center',
    backgroundColor: colors.teal,
  },
  sheetSaveText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 14,
    color: colors.obsidian,
  },
  // Verticals picker chips reused in the sheet
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: radius.full,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceElevated,
  },
  chipSelected: {
    borderColor: colors.teal,
    backgroundColor: 'rgba(0, 161, 155, 0.10)',
  },
  chipText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.silver,
    letterSpacing: 0.2,
  },
  chipTextSelected: {
    color: colors.teal,
  },
});
