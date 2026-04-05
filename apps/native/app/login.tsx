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
import { LinearGradient } from 'expo-linear-gradient';
import { GlowSpot } from '../src/components/GlowSpot';
import supabase from '../src/lib/supabase';
import { colors, fonts, spacing, radius, gradient } from '../src/constants/brand';

export default function LoginScreen() {
  const [email, setEmail] = useState('kevin@stroomlabs.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailFocused, setEmailFocused] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);

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

  return (
    <LinearGradient
      colors={[gradient.background[0], gradient.background[1]]}
      start={{ x: 0, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.container}
    >
      {/* Breathing teal halo behind the logo mark */}
      <GlowSpot size={560} opacity={0.1} style={styles.haloOuter} breathe />
      <GlowSpot size={320} opacity={0.12} style={styles.haloInner} breathe />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.inner}
      >
        <View style={styles.logoArea}>
          <Text style={styles.logoMark}>S</Text>
          <Text style={styles.title}>Stroom Command Center</Text>
          <Text style={styles.subtitle}>Intelligence Operations</Text>
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
        </View>

        <Text style={styles.footer}>Stroom Labs · Operator Access Only</Text>
      </KeyboardAvoidingView>
    </LinearGradient>
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
    fontFamily: fonts.archivo.bold,
    fontSize: 22,
    color: colors.alabaster,
    letterSpacing: -0.4,
  },
  subtitle: {
    fontFamily: fonts.archivo.regular,
    fontSize: 13,
    color: colors.silver,
    marginTop: 6,
    letterSpacing: 0.3,
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
  footer: {
    fontFamily: fonts.mono.regular,
    fontSize: 10,
    color: colors.slate,
    textAlign: 'center',
    marginTop: 56,
    letterSpacing: 1,
  },
});
