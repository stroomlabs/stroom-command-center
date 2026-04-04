import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { Alert, Platform } from 'react-native';
import { Session, User } from '@supabase/supabase-js';
import * as LocalAuthentication from 'expo-local-authentication';
import * as Linking from 'expo-linking';
import supabase from './supabase';

interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  biometricPassed: boolean;
  sendMagicLink: (email: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  checkBiometric: () => Promise<boolean>;
}

const AuthContext = createContext<AuthState | null>(null);

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be inside AuthProvider');
  return ctx;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [biometricPassed, setBiometricPassed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const handleDeepLink = async (event: { url: string }) => {
      const url = event.url;
      if (!url.includes('auth/callback')) return;

      // PKCE flow: extract code from query params
      const params = new URLSearchParams(url.split('?')[1] || '');
      const code = params.get('code');

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);
        if (error) console.error('Code exchange error:', error.message);
        return;
      }

      // Fallback: implicit flow (access_token in fragment)
      const hashParams = new URLSearchParams(url.split('#')[1] || '');
      const accessToken = hashParams.get('access_token');
      const refreshToken = hashParams.get('refresh_token');

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) console.error('Session set error:', error.message);
      }
    };

    const sub = Linking.addEventListener('url', handleDeepLink);
    Linking.getInitialURL().then((url) => {
      if (url) handleDeepLink({ url });
    });

    return () => sub.remove();
  }, []);

  const sendMagicLink = useCallback(async (email: string) => {
    const redirectUrl = Linking.createURL('auth/callback');
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: redirectUrl },
    });
    return { error: error?.message ?? null };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setBiometricPassed(false);
  }, []);

  const checkBiometric = useCallback(async () => {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = await LocalAuthentication.isEnrolledAsync();
    if (!hasHardware || !isEnrolled) {
      setBiometricPassed(true);
      return true;
    }
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: 'Authenticate to Stroom Command',
      fallbackLabel: 'Use Passcode',
    });
    setBiometricPassed(result.success);
    return result.success;
  }, []);

  return (
    <AuthContext.Provider
      value={{ session, user: session?.user ?? null, loading, biometricPassed, sendMagicLink, signOut, checkBiometric }}
    >
      {children}
    </AuthContext.Provider>
  );
}
