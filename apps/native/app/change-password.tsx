import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import supabase from '../src/lib/supabase';
import { ScreenCanvas } from '../src/components/ScreenCanvas';
import { ScreenWatermark } from '../src/components/ScreenWatermark';
import { useBrandToast } from '../src/components/BrandToast';
import { haptics } from '../src/lib/haptics';
import { colors, fonts, spacing, radius } from '../src/constants/brand';

const MIN_LENGTH = 8;

// Change Password — session-authenticated, so no current-password challenge.
// Supabase's updateUser({ password }) re-auths the session implicitly and
// returns an error if the new password violates the project policy (length,
// pwned-password blocklist, etc.) — that error string is surfaced verbatim
// in the toast so the operator can react without a round-trip through logs.
export default function ChangePasswordScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { show: showToast } = useBrandToast();

  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [newFocused, setNewFocused] = useState(false);
  const [confirmFocused, setConfirmFocused] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const canSubmit =
    !submitting &&
    newPassword.length >= MIN_LENGTH &&
    confirmPassword.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    if (newPassword !== confirmPassword) {
      haptics.error();
      showToast('Passwords do not match', 'error');
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    setSubmitting(false);
    if (error) {
      showToast(error.message || 'Could not update password', 'error');
      return;
    }
    showToast('Password updated', 'success');
    router.back();
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
          accessibilityLabel="Back"
        >
          <Ionicons name="chevron-back" size={24} color={colors.alabaster} />
          <Text style={styles.backText}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Change Password</Text>
        <Text style={styles.subtitle}>
          Pick a new password for this account. Minimum {MIN_LENGTH} characters.
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
            <View>
              <Text style={styles.label}>NEW PASSWORD</Text>
              <TextInput
                style={[styles.input, newFocused && styles.inputFocused]}
                value={newPassword}
                onChangeText={setNewPassword}
                onFocus={() => setNewFocused(true)}
                onBlur={() => setNewFocused(false)}
                placeholder="••••••••"
                placeholderTextColor={colors.slate}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                keyboardAppearance="dark"
                selectionColor={colors.teal}
                textContentType="newPassword"
                returnKeyType="next"
              />
            </View>

            <View>
              <Text style={styles.label}>CONFIRM NEW PASSWORD</Text>
              <TextInput
                style={[styles.input, confirmFocused && styles.inputFocused]}
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                onFocus={() => setConfirmFocused(true)}
                onBlur={() => setConfirmFocused(false)}
                placeholder="••••••••"
                placeholderTextColor={colors.slate}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                keyboardAppearance="dark"
                selectionColor={colors.teal}
                textContentType="newPassword"
                returnKeyType="go"
                onSubmitEditing={handleSubmit}
              />
            </View>

            <Pressable
              onPress={handleSubmit}
              disabled={!canSubmit}
              style={({ pressed }) => [
                styles.submitBtn,
                !canSubmit && styles.submitBtnDisabled,
                pressed && canSubmit && styles.submitBtnPressed,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Update password"
            >
              {submitting ? (
                <ActivityIndicator color={colors.obsidian} size="small" />
              ) : (
                <Text style={styles.submitBtnText}>Update Password</Text>
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
    paddingTop: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  form: {
    gap: spacing.md,
  },
  label: {
    fontFamily: fonts.mono.medium,
    fontSize: 10,
    color: colors.slate,
    letterSpacing: 1.2,
    marginBottom: 6,
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
  inputFocused: {
    borderColor: colors.teal,
    backgroundColor: 'rgba(0, 161, 155, 0.06)',
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
