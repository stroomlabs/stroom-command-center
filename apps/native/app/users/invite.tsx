import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import supabase from '../../src/lib/supabase';
import { ScreenCanvas } from '../../src/components/ScreenCanvas';
import { ScreenWatermark } from '../../src/components/ScreenWatermark';
import { useBrandToast } from '../../src/components/BrandToast';
import { useCapabilities } from '../../src/hooks/useCapabilities';
import {
  operatorAdmin,
  humanizeAdminError,
} from '../../src/lib/operatorAdmin';
import { VERTICAL_ORDER, VERTICAL_BUCKETS } from '../../src/lib/verticals';
import { colors, fonts, spacing, radius } from '../../src/constants/brand';

// DR-036 invite flow — sends a new operator an invitation, attaching a
// role and an optional allowlist of verticals. All writes hit the
// operator-admin Edge Function; the server is the authority on
// email/role validation, uniqueness, and capability checks.
//
// Capability gate: admin.manage_users. We wait for the capability
// snapshot to land (same fail-open trick as the tab layout) and only
// bounce out once we know the caller is denied — then toast and pop
// back.

interface RoleOption {
  id: string;
  name: string;
  display_name: string;
  description: string | null;
}

// Exclude 'all' — that bucket means "no filter", not a stored vertical.
const VERTICAL_KEYS = VERTICAL_ORDER.filter((k) => k !== 'all');

const isValidEmail = (s: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.trim());

export default function InviteOperatorScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show: showToast } = useBrandToast();
  const {
    role: callerRole,
    hasCapability,
    isLoading: capsLoading,
  } = useCapabilities();

  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(true);
  const [rolesError, setRolesError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [verticals, setVerticals] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);

  // Capability gate — hold off on the bounce until we have a real
  // snapshot so an in-flight refetch can't evict the screen prematurely.
  const haveSnapshot = !capsLoading || callerRole !== null;
  useEffect(() => {
    if (!haveSnapshot) return;
    if (!hasCapability('admin.manage_users')) {
      showToast('Insufficient permissions', 'error');
      router.back();
    }
  }, [haveSnapshot, hasCapability, router, showToast]);

  // Roles list — fetch once. Owner is always excluded.
  useEffect(() => {
    (async () => {
      try {
        const { data, error } = await supabase
          .schema('intel')
          .from('operator_roles')
          .select('id, name, display_name, description')
          .order('display_name', { ascending: true });
        if (error) throw error;
        const filtered: RoleOption[] = ((data ?? []) as any[])
          .filter(
            (r) => String(r.name) !== 'owner' && String(r.name) !== 'guest'
          )
          .map((r) => ({
            id: String(r.id),
            name: String(r.name ?? ''),
            display_name: String(
              r.display_name ?? r.name ?? 'Operator'
            ),
            description: (r.description as string | null) ?? null,
          }));
        setRoles(filtered);
        // Default-select the lowest-privilege role if present. We fall
        // back to whatever the first row is so the form is never stuck
        // without a selection.
        const viewer = filtered.find((r) => r.name === 'viewer');
        setSelectedRoleId((viewer ?? filtered[0])?.id ?? null);
      } catch (e: any) {
        setRolesError(e?.message ?? 'Failed to load roles');
      } finally {
        setRolesLoading(false);
      }
    })();
  }, []);

  const toggleVertical = useCallback((key: string) => {
    setVerticals((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const canSubmit = useMemo(
    () =>
      !submitting &&
      email.trim().length > 0 &&
      isValidEmail(email) &&
      !!selectedRoleId,
    [submitting, email, selectedRoleId]
  );

  const handleSubmit = async () => {
    if (!canSubmit || !selectedRoleId) return;
    setSubmitting(true);
    try {
      await operatorAdmin({
        action: 'invite',
        email: email.trim(),
        display_name: displayName.trim() || null,
        role_id: selectedRoleId,
        allowed_verticals:
          verticals.size > 0 ? Array.from(verticals) : null,
      });
      showToast(`Invitation sent to ${email.trim()}`, 'success');
      router.back();
    } catch (e: any) {
      showToast(humanizeAdminError(e?.message ?? 'unknown_error'), 'error');
    } finally {
      setSubmitting(false);
    }
  };

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
        <Text style={styles.title}>Invite Operator</Text>
        <Text style={styles.subtitle}>
          New operators receive an email with a sign-in link.
        </Text>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.form}>
            {/* Email */}
            <View>
              <Text style={styles.label}>EMAIL</Text>
              <TextInput
                style={styles.input}
                value={email}
                onChangeText={setEmail}
                placeholder="operator@stroomlabs.com"
                placeholderTextColor={colors.slate}
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                keyboardAppearance="dark"
                selectionColor={colors.teal}
                textContentType="emailAddress"
                returnKeyType="next"
              />
            </View>

            {/* Display name */}
            <View>
              <Text style={styles.label}>DISPLAY NAME · OPTIONAL</Text>
              <TextInput
                style={styles.input}
                value={displayName}
                onChangeText={setDisplayName}
                placeholder="Alex Chen"
                placeholderTextColor={colors.slate}
                autoCapitalize="words"
                keyboardAppearance="dark"
                selectionColor={colors.teal}
                textContentType="name"
                returnKeyType="next"
              />
            </View>

            {/* Role picker */}
            <View>
              <Text style={styles.label}>ROLE</Text>
              {rolesLoading ? (
                <View style={styles.rolesLoading}>
                  <ActivityIndicator color={colors.teal} size="small" />
                </View>
              ) : rolesError ? (
                <Text style={styles.errorText}>{rolesError}</Text>
              ) : roles.length === 0 ? (
                <Text style={styles.errorText}>No roles available</Text>
              ) : (
                <View style={styles.rolesList}>
                  {roles.map((r) => {
                    const selected = r.id === selectedRoleId;
                    return (
                      <Pressable
                        key={r.id}
                        onPress={() => setSelectedRoleId(r.id)}
                        style={({ pressed }) => [
                          styles.roleRow,
                          selected && styles.roleRowSelected,
                          pressed && { opacity: 0.8 },
                        ]}
                        accessibilityRole="radio"
                        accessibilityState={{ selected }}
                        accessibilityLabel={`Role ${r.display_name}`}
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
                          <Text style={styles.roleName}>{r.display_name}</Text>
                          {r.description && (
                            <Text
                              style={styles.roleDescription}
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
            </View>

            {/* Verticals */}
            <View>
              <Text style={styles.label}>ALLOWED VERTICALS · OPTIONAL</Text>
              <Text style={styles.help}>
                Leave empty to inherit all verticals from the role.
              </Text>
              <View style={styles.chipRow}>
                {VERTICAL_KEYS.map((key) => {
                  const bucket = VERTICAL_BUCKETS[key];
                  const selected = verticals.has(key);
                  return (
                    <Pressable
                      key={key}
                      onPress={() => toggleVertical(key)}
                      style={({ pressed }) => [
                        styles.chip,
                        selected && styles.chipSelected,
                        pressed && { opacity: 0.8 },
                      ]}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: selected }}
                      accessibilityLabel={bucket.label}
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
            </View>

            {/* Submit */}
            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                !canSubmit && styles.submitBtnDisabled,
                pressed && canSubmit && styles.submitBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Send invitation"
            >
              {submitting ? (
                <ActivityIndicator color={colors.obsidian} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Send Invitation</Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
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
  kav: {
    flex: 1,
  },
  scroll: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xxl,
  },
  form: {
    gap: spacing.lg,
  },
  label: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  help: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    marginBottom: 8,
  },
  input: {
    fontFamily: fonts.archivo.regular,
    fontSize: 15,
    color: colors.alabaster,
    backgroundColor: colors.surfaceElevated,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 14,
  },
  errorText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 13,
    color: colors.statusReject,
  },
  rolesLoading: {
    alignItems: 'center',
    paddingVertical: spacing.md,
  },
  rolesList: {
    gap: spacing.xs,
  },
  roleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceElevated,
  },
  roleRowSelected: {
    borderColor: colors.teal,
    backgroundColor: 'rgba(0, 161, 155, 0.08)',
  },
  roleName: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    color: colors.alabaster,
  },
  roleDescription: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    marginTop: 2,
    lineHeight: 16,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
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
  submitBtn: {
    backgroundColor: colors.teal,
    paddingVertical: 15,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.sm,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  submitBtnDisabled: {
    opacity: 0.35,
    shadowOpacity: 0,
  },
  submitBtnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  submitBtnText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 15,
    color: colors.obsidian,
    letterSpacing: 0.3,
  },
});
