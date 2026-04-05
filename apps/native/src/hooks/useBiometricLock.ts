import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as LocalAuthentication from 'expo-local-authentication';

const STORAGE_KEY = 'stroom.biometric_lock_enabled';

export type BiometricKind = 'face' | 'touch' | 'other' | 'none';

export interface BiometricLockState {
  // Hardware probe complete + prefs loaded.
  ready: boolean;
  // Device has enrolled biometrics (Face ID / Touch ID).
  available: boolean;
  // What the device advertises, used to label the Settings toggle.
  kind: BiometricKind;
  // User preference. Defaults to true when hardware is available; persisted
  // to AsyncStorage on every toggle.
  enabled: boolean;
  // True once the current session is unlocked (or the gate is disabled).
  unlocked: boolean;
  // Most recent auth failure reason — null when unlocked or never run.
  lastError: string | null;
}

// App-level biometric unlock. Sits BEFORE Supabase auth — the operator
// must pass this gate every cold start (regardless of whether there's a
// cached Supabase session). Honors a persistent AsyncStorage preference
// so the operator can disable the lock from Settings.
export function useBiometricLock() {
  const [state, setState] = useState<BiometricLockState>({
    ready: false,
    available: false,
    kind: 'none',
    enabled: false,
    unlocked: false,
    lastError: null,
  });

  // Probe hardware + load preference on mount.
  useEffect(() => {
    (async () => {
      try {
        const [hasHardware, isEnrolled, types, stored] = await Promise.all([
          LocalAuthentication.hasHardwareAsync(),
          LocalAuthentication.isEnrolledAsync(),
          LocalAuthentication.supportedAuthenticationTypesAsync(),
          AsyncStorage.getItem(STORAGE_KEY),
        ]);
        const available = hasHardware && isEnrolled;
        const kind: BiometricKind = types.includes(
          LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION
        )
          ? 'face'
          : types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)
          ? 'touch'
          : available
          ? 'other'
          : 'none';

        // Default ON when biometrics exist and no preference has been
        // stored yet. If the preference has been explicitly set, honor it.
        const enabled =
          stored === null ? available : stored === 'true';

        setState({
          ready: true,
          available,
          kind,
          enabled,
          // If the gate is disabled or the device has no biometrics, the
          // session starts unlocked — no prompt needed.
          unlocked: !(available && enabled),
          lastError: null,
        });
      } catch {
        // Any probe failure falls through as "not available" so we never
        // accidentally strand the user at a broken lock screen.
        setState({
          ready: true,
          available: false,
          kind: 'none',
          enabled: false,
          unlocked: true,
          lastError: null,
        });
      }
    })();
  }, []);

  const authenticate = useCallback(async () => {
    setState((prev) => ({ ...prev, lastError: null }));
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Unlock Stroom Command',
        cancelLabel: 'Cancel',
        disableDeviceFallback: true,
      });
      if (result.success) {
        setState((prev) => ({ ...prev, unlocked: true, lastError: null }));
        return true;
      }
      const err =
        ('error' in result ? result.error : null) ??
        ('warning' in result ? (result as any).warning : null) ??
        'Authentication failed';
      setState((prev) => ({ ...prev, unlocked: false, lastError: String(err) }));
      return false;
    } catch (e: any) {
      setState((prev) => ({
        ...prev,
        unlocked: false,
        lastError: e?.message ?? 'Authentication failed',
      }));
      return false;
    }
  }, []);

  const setEnabled = useCallback(async (next: boolean) => {
    await AsyncStorage.setItem(STORAGE_KEY, next ? 'true' : 'false');
    setState((prev) => ({
      ...prev,
      enabled: next,
      // Flipping the switch off inside the app unlocks the current session
      // immediately. Flipping it back on does NOT re-lock — the lock only
      // applies to future cold starts.
      unlocked: prev.unlocked || !next,
    }));
  }, []);

  return { ...state, authenticate, setEnabled };
}

export function biometricLabel(kind: BiometricKind): string {
  switch (kind) {
    case 'face':
      return 'Face ID';
    case 'touch':
      return 'Touch ID';
    case 'other':
      return 'Biometrics';
    default:
      return 'Biometrics';
  }
}
