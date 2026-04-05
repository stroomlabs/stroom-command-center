import React, { useState } from 'react';
import { View, Text, TextInput, Pressable, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { GlowSpot } from '../src/components/GlowSpot';
import supabase from '../src/lib/supabase';

export default function LoginScreen() {
  const [email, setEmail] = useState('kevin@stroomlabs.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) return;
    setLoading(true);
    setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password: password.trim() });
    setLoading(false);
    if (error) setError(error.message);
  };

  return (
    <LinearGradient colors={['#000000', '#0A0D0F']} start={{ x: 0, y: 0 }} end={{ x: 0.5, y: 1 }} style={s.container}>
      {/* Large diffused teal halo behind the logo mark */}
      <GlowSpot size={560} opacity={0.08} style={s.logoGlow} breathe />
      <GlowSpot size={320} opacity={0.08} style={s.logoGlowInner} breathe />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.inner}>
        <View style={s.logoArea}>
          <Text style={s.logoMark}>S</Text>
          <Text style={s.title}>Stroom Command</Text>
          <Text style={s.subtitle}>Intelligence Operations Center</Text>
        </View>
        <View style={s.form}>
          <Text style={s.label}>EMAIL</Text>
          <TextInput style={s.input} value={email} onChangeText={setEmail} placeholder="kevin@stroomlabs.com" placeholderTextColor="#565F64" keyboardType="email-address" autoCapitalize="none" autoCorrect={false} />
          <Text style={s.label}>PASSWORD</Text>
          <TextInput style={s.input} value={password} onChangeText={setPassword} placeholder="Enter password" placeholderTextColor="#565F64" secureTextEntry autoCapitalize="none" returnKeyType="go" onSubmitEditing={handleLogin} />
          {error && <Text style={s.error}>{error}</Text>}
          <Pressable onPress={handleLogin} disabled={loading || !email.trim() || !password.trim()} style={({ pressed }) => [s.btn, (!email.trim() || !password.trim() || loading) && s.btnDisabled, pressed && s.btnPressed]}>
            {loading ? <ActivityIndicator color="#F5F5F7" size="small" /> : <Text style={s.btnText}>Sign In</Text>}
          </Pressable>
        </View>
        <Text style={s.footer}>Stroom Labs · Operator Access Only</Text>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  logoGlow: {
    top: '15%',
    alignSelf: 'center',
    // GlowSpot is position: absolute, but alignSelf doesn't apply to
    // absolutely-positioned children. Use left:'50%' + negative margin via a
    // centered offset. We approximate by using left with percentage via a
    // wrapping transform.
    left: '50%',
    marginLeft: -280,
  },
  logoGlowInner: {
    top: '22%',
    left: '50%',
    marginLeft: -160,
  },
  inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 32 },
  logoArea: { alignItems: 'center', marginBottom: 64 },
  logoMark: { fontWeight: '900', fontSize: 48, color: '#00A19B', marginBottom: 16 },
  title: { fontWeight: '700', fontSize: 28, color: '#F5F5F7', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, color: '#565F64', marginTop: 4 },
  form: { gap: 12 },
  label: { fontWeight: '500', fontSize: 12, color: '#C8CCCE', letterSpacing: 1 },
  input: { fontSize: 16, color: '#F5F5F7', backgroundColor: '#111416', borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 14 },
  error: { fontWeight: '500', fontSize: 13, color: '#EF4444' },
  btn: { backgroundColor: '#00A19B', paddingVertical: 16, borderRadius: 10, alignItems: 'center', marginTop: 4 },
  btnDisabled: { opacity: 0.35 },
  btnPressed: { opacity: 0.8 },
  btnText: { fontWeight: '600', fontSize: 15, color: '#F5F5F7' },
  footer: { fontSize: 11, color: '#565F64', textAlign: 'center', marginTop: 64, letterSpacing: 0.5 },
});
