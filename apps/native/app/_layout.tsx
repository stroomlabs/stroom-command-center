import React, { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../src/lib/auth';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { BrandAlertProvider } from '../src/components/BrandAlert';
import { BrandToastProvider } from '../src/components/BrandToast';
import { BrandSplash } from '../src/components/BrandSplash';
import { BiometricGate } from '../src/components/BiometricGate';
import { OnboardingFlow } from '../src/components/OnboardingFlow';
import { useOnboarding } from '../src/hooks/useOnboarding';
import { PulseProvider } from '../src/lib/PulseContext';
import { OfflineSyncProvider } from '../src/lib/OfflineSyncContext';
import { ShakeReportProvider } from '../src/lib/ShakeReportContext';
import { GestureHintsOverlay } from '../src/components/GestureHintsOverlay';
import { colors, gradient } from '../src/constants/brand';

// Keep splash visible while loading
SplashScreen.preventAutoHideAsync();

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const sessionReady = Boolean(session);
  const { needsOnboarding, complete: completeOnboarding } = useOnboarding(sessionReady);

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === 'login';

    if (!session && !inAuth) {
      router.replace('/login');
    } else if (session && inAuth) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  if (loading) {
    return (
      <LinearGradient
        colors={[gradient.background[0], gradient.background[1]]}
        style={styles.loading}
      >
        <ActivityIndicator color={colors.teal} size="large" />
      </LinearGradient>
    );
  }

  return (
    <>
      {children}
      <OnboardingFlow
        visible={sessionReady && needsOnboarding}
        onComplete={completeOnboarding}
      />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  useEffect(() => {
    async function loadFonts() {
      try {
        await Font.loadAsync({
          // Archivo
          Archivo_400Regular: require('../assets/fonts/Archivo-Regular.ttf'),
          Archivo_500Medium: require('../assets/fonts/Archivo-Medium.ttf'),
          Archivo_600SemiBold: require('../assets/fonts/Archivo-SemiBold.ttf'),
          Archivo_700Bold: require('../assets/fonts/Archivo-Bold.ttf'),
          Archivo_900Black: require('../assets/fonts/Archivo-Black.ttf'),
          // IBM Plex Mono
          IBMPlexMono_400Regular: require('../assets/fonts/IBMPlexMono-Regular.ttf'),
          IBMPlexMono_500Medium: require('../assets/fonts/IBMPlexMono-Medium.ttf'),
          IBMPlexMono_600SemiBold: require('../assets/fonts/IBMPlexMono-SemiBold.ttf'),
        });
      } catch (e) {
        if (__DEV__) console.warn('Font loading failed, falling back to system fonts:', e);
      } finally {
        setFontsLoaded(true);
        // Hand off from the native expo-splash-screen (which is covering the
        // screen with splash-icon.png on #0E0F14) to the custom BrandSplash
        // component now that fonts are ready to render.
        SplashScreen.hideAsync();
      }
    }

    loadFonts();
  }, []);

  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <BiometricGate ready={splashDone}>
      <AuthProvider>
        <BrandAlertProvider>
        <BrandToastProvider>
        <OfflineSyncProvider>
        <StatusBar style="light" />
        <RouteGuard>
          <PulseProvider>
          <ShakeReportProvider>
          <ErrorBoundary>
          <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.black },
            animation: 'slide_from_right',
            animationDuration: 250,
            fullScreenGestureEnabled: true,
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="login" />
          <Stack.Screen name="entity/[id]" />
          <Stack.Screen name="claim/[id]" />
          <Stack.Screen name="claim/edit/[id]" />
          <Stack.Screen name="audit" />
          <Stack.Screen name="research" />
          <Stack.Screen name="more" />
          <Stack.Screen name="notification-prefs" />
          <Stack.Screen name="change-password" />
          <Stack.Screen name="my-role" />
          <Stack.Screen name="users" />
          <Stack.Screen name="users/invite" />
          <Stack.Screen name="users/[id]" />
          <Stack.Screen name="dismissed-merges" />
          <Stack.Screen name="source/[id]" />
          <Stack.Screen name="sources" />
          <Stack.Screen name="predicate/[key]" />
          <Stack.Screen name="digest" />
          <Stack.Screen name="coverage" />
          <Stack.Screen name="pulse" />
          <Stack.Screen name="projects/[slug]" />
          <Stack.Screen name="policies" />
          <Stack.Screen name="analytics" />
          <Stack.Screen name="notifications" />
        </Stack>
          </ErrorBoundary>
          </ShakeReportProvider>
          </PulseProvider>
        </RouteGuard>
        <OfflineBanner />
        <GestureHintsOverlay />
        </OfflineSyncProvider>
        </BrandToastProvider>
        </BrandAlertProvider>
      </AuthProvider>
      </BiometricGate>
      {!splashDone && (
        <BrandSplash ready={fontsLoaded} onDone={() => setSplashDone(true)} />
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
