import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Platform,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { colors, fonts, spacing, radius } from '../constants/brand';

export type BrandAlertButtonStyle = 'default' | 'cancel' | 'destructive';

export interface BrandAlertButton {
  text: string;
  onPress?: () => void | Promise<void>;
  style?: BrandAlertButtonStyle;
}

interface BrandAlertState {
  title: string;
  message?: string;
  buttons: BrandAlertButton[];
}

interface BrandAlertContextValue {
  // Imperative API that mirrors React Native's Alert.alert signature so
  // existing call sites can migrate by swapping imports.
  alert: (
    title: string,
    message?: string,
    buttons?: BrandAlertButton[]
  ) => void;
}

const BrandAlertContext = createContext<BrandAlertContextValue | null>(null);

export function BrandAlertProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<BrandAlertState | null>(null);

  const alert = useCallback(
    (title: string, message?: string, buttons?: BrandAlertButton[]) => {
      setState({
        title,
        message,
        buttons: buttons && buttons.length > 0 ? buttons : [{ text: 'OK' }],
      });
    },
    []
  );

  const dismiss = useCallback(() => setState(null), []);

  const handlePress = useCallback(
    async (btn: BrandAlertButton) => {
      // Close first so the modal animation runs while the handler fires.
      setState(null);
      try {
        await btn.onPress?.();
      } catch {
        // Swallow — buttons shouldn't crash the provider.
      }
    },
    []
  );

  const value = useMemo<BrandAlertContextValue>(() => ({ alert }), [alert]);

  return (
    <BrandAlertContext.Provider value={value}>
      {children}
      <Modal
        visible={state !== null}
        animationType="fade"
        transparent
        onRequestClose={dismiss}
        statusBarTranslucent
      >
        <Pressable style={styles.backdrop} onPress={dismiss}>
          <BlurView
            intensity={Platform.OS === 'ios' ? 40 : 80}
            tint="dark"
            style={StyleSheet.absoluteFill}
          />
          <Pressable style={styles.card} onPress={() => {}}>
            <Text style={styles.title}>{state?.title}</Text>
            {state?.message ? (
              <Text style={styles.message}>{state.message}</Text>
            ) : null}

            <View
              style={[
                styles.buttonRow,
                (state?.buttons.length ?? 0) > 2 && styles.buttonColumn,
              ]}
            >
              {state?.buttons.map((btn, i) => (
                <Pressable
                  key={`${i}-${btn.text}`}
                  onPress={() => handlePress(btn)}
                  style={({ pressed }) => [
                    styles.button,
                    buttonStyle(btn.style),
                    pressed && { opacity: 0.8 },
                  ]}
                >
                  <Text style={[styles.buttonText, buttonTextStyle(btn.style)]}>
                    {btn.text}
                  </Text>
                </Pressable>
              ))}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </BrandAlertContext.Provider>
  );
}

// Hook mirroring the imperative ergonomics of RN's Alert.alert.
// Usage: const { alert } = useBrandAlert(); alert('Title', 'body', [...])
export function useBrandAlert(): BrandAlertContextValue {
  const ctx = useContext(BrandAlertContext);
  if (!ctx) {
    throw new Error('useBrandAlert must be used inside <BrandAlertProvider>');
  }
  return ctx;
}

function buttonStyle(style?: BrandAlertButtonStyle) {
  switch (style) {
    case 'destructive':
      return styles.buttonDestructive;
    case 'cancel':
      return styles.buttonCancel;
    default:
      return styles.buttonDefault;
  }
}

function buttonTextStyle(style?: BrandAlertButtonStyle) {
  switch (style) {
    case 'destructive':
      return styles.buttonTextDestructive;
    case 'cancel':
      return styles.buttonTextCancel;
    default:
      return styles.buttonTextDefault;
  }
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#111416', // Brand's surfaceElevated, spec requires literal
    borderRadius: radius.xl, // 24px
    borderWidth: 1,
    borderColor: 'rgba(0, 161, 155, 0.3)',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: spacing.md,
    // Glow
    shadowColor: colors.teal,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 12,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 18,
    color: colors.alabaster,
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  message: {
    fontFamily: fonts.archivo.regular,
    fontSize: 14,
    color: colors.silver,
    textAlign: 'center',
    lineHeight: 20,
    marginTop: spacing.sm,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.lg,
  },
  buttonColumn: {
    flexDirection: 'column',
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDefault: {
    backgroundColor: colors.tealDim,
    borderColor: colors.teal,
  },
  buttonDestructive: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: colors.statusReject,
  },
  buttonCancel: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderColor: colors.glassBorder,
  },
  buttonText: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 14,
    letterSpacing: -0.1,
  },
  buttonTextDefault: {
    color: colors.teal,
  },
  buttonTextDestructive: {
    color: colors.statusReject,
  },
  buttonTextCancel: {
    color: colors.silver,
  },
});
