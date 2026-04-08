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
} from 'react-native';
import { ScreenCanvas } from '../src/components/ScreenCanvas';
import supabase from '../src/lib/supabase';
import { useBrandToast } from '../src/components/BrandToast';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

export default function LoginScreen() {
  const [email, setEmail] = useState('kevin@stroomlabs.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const { show: showToast } = useBrandToast();

  const canSubmit = email.trim().length > 0 && password.trim().length > 0;

  const handleLogin = async () => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    });
    setLoading(false);
    if (error) setError(error.message);
  };

  const handleForgotPassword = async () => {
    const trimmed = email.trim();
    if (!trimmed) {
      showToast('Enter your email first', 'warn');
      return;
    }
    // Always show the same toast on success or failure so we don't leak
    // whether an account exists for a given address.
    try {
      await supabase.auth.resetPasswordForEmail(trimmed);
    } catch {
      // swallow — toast below is shown either way
    }
    showToast('Reset link sent if account exists', 'info');
  };

  return (
    <View style={styles.container}>
      <ScreenCanvas />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <View style={styles.logoArea}>
          <Text style={styles.logoMark}>S</Text>
          <Text style={styles.title}>STROOM COMMAND</Text>
        </View>

        <View style={styles.form}>
          <View>
            <Text style={styles.label}>EMAIL</Text>
            <TextInput
              style={[styles.input, emailFocused && styles.inputFocused]}
              value={email}
              onChangeText={setEmail}
              onFocus={() => setEmailFocused(true)}
              onBlur={() => setEmailFocused(false)}
              placeholder="operator@stroomlabs.com"
              placeholderTextColor={colors.slate}
              keyboardType="email-address"
              keyboardAppearance="dark"
              autoCapitalize="none"
              autoCorrect={false}
              selectionColor={colors.teal}
            />
          </View>

          <View>
            <Text style={styles.label}>PASSWORD</Text>
            <TextInput
              style={[styles.input, passwordFocused && styles.inputFocused]}
              value={password}
              onChangeText={setPassword}
              onFocus={() => setPasswordFocused(true)}
              onBlur={() => setPasswordFocused(false)}
              placeholder="••••••••"
              placeholderTextColor={colors.slate}
              secureTextEntry
              autoCapitalize="none"
              returnKeyType="go"
              keyboardAppearance="dark"
              selectionColor={colors.teal}
              onSubmitEditing={handleLogin}
            />
          </View>

          {error && <Text style={styles.error}>{error}</Text>}

          <Pressable
            onPress={handleLogin}
            disabled={!canSubmit || loading}
            style={({ pressed }) => [
              styles.btn,
              (!canSubmit || loading) && styles.btnDisabled,
              pressed && canSubmit && !loading && styles.btnPressed,
            ]}
          >
            {loading ? (
              <ActivityIndicator color={colors.obsidian} size="small" />
            ) : (
              <Text style={styles.btnText}>Sign In</Text>
            )}
          </Pressable>

          <Pressable
            onPress={handleForgotPassword}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel="Forgot password"
            style={({ pressed }) => [
              styles.forgotWrap,
              pressed && { opacity: 0.6 },
            ]}
          >
            <Text style={styles.forgotText}>Forgot password?</Text>
          </Pressable>
        </View>

        <Text style={styles.footer}>Stroom Labs · Operator Access Only</Text>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  haloOuter: {
    top: '12%',
    left: '50%',
    marginLeft: -280,
  },
  haloInner: {
    top: '18%',
    left: '50%',
    marginLeft: -160,
  },
  inner: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
  },
  logoArea: {
    alignItems: 'center',
    marginBottom: 56,
  },
  logoMark: {
    fontFamily: fonts.archivo.black,
    fontSize: 72,
    color: colors.teal,
    letterSpacing: -2,
    textShadowColor: 'rgba(0, 161, 155, 0.5)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 24,
    marginBottom: spacing.md,
    lineHeight: 80,
  },
  title: {
    fontFamily: fonts.archivo.black,
    fontSize: 18,
    color: colors.silver,
    letterSpacing: -0.5,
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
  error: {
    fontFamily: fonts.archivo.medium,
    fontSize: 12,
    color: colors.statusReject,
  },
  btn: {
    backgroundColor: colors.teal,
    paddingVertical: 15,
    borderRadius: radius.md,
    alignItems: 'center',
    marginTop: spacing.xs,
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
  btnDisabled: {
    opacity: 0.35,
    shadowOpacity: 0,
  },
  btnPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  btnText: {
    fontFamily: fonts.archivo.bold,
    fontSize: 15,
    color: colors.obsidian,
    letterSpacing: 0.3,
  },
  forgotWrap: {
    alignSelf: 'center',
    marginTop: spacing.sm,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
  },
  forgotText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
  },
  footer: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    textAlign: 'center',
    marginTop: 56,
    letterSpacing: 1,
  },
});
