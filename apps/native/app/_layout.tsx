import React, { useEffect, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Font from 'expo-font';
import { LinearGradient } from 'expo-linear-gradient';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { AuthProvider, useAuth } from '../src/lib/auth';
import { OfflineBanner } from '../src/components/OfflineBanner';
import { ErrorBoundary } from '../src/components/ErrorBoundary';
import { colors, fonts, gradient } from '../src/constants/brand';

// Keep splash visible while loading
SplashScreen.preventAutoHideAsync();

function RouteGuard({ children }: { children: React.ReactNode }) {
  const { session, loading, biometricPassed, checkBiometric } = useAuth();
  const segments = useSegments();
  const router = useRouter();
  const [biometricChecked, setBiometricChecked] = useState(false);

  useEffect(() => {
    if (loading) return;

    const inAuth = segments[0] === 'login';

    if (!session && !inAuth) {
      router.replace('/login');
    } else if (session && inAuth) {
      router.replace('/(tabs)');
    }
  }, [session, loading, segments]);

  // Face ID gate after auth
  useEffect(() => {
    if (!session || biometricChecked) return;

    checkBiometric().then(() => {
      setBiometricChecked(true);
    });
  }, [session, biometricChecked]);

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

  if (session && !biometricPassed && biometricChecked) {
    return (
      <LinearGradient
        colors={[gradient.background[0], gradient.background[1]]}
        style={styles.loading}
      >
        <Text style={styles.biometricText}>Authentication required</Text>
      </LinearGradient>
    );
  }

  return <>{children}</>;
}

export default function RootLayout() {
  const [fontsLoaded, setFontsLoaded] = useState(false);

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
        console.warn('Font loading failed, falling back to system fonts:', e);
      } finally {
        setFontsLoaded(true);
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
      <AuthProvider>
        <StatusBar style="light" />
        <RouteGuard>
          <ErrorBoundary>
          <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.black },
            animation: 'slide_from_right',
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
          <Stack.Screen name="source/[id]" />
          <Stack.Screen name="sources" />
          <Stack.Screen name="predicate/[key]" />
          <Stack.Screen name="digest" />
          <Stack.Screen name="coverage" />
        </Stack>
          </ErrorBoundary>
        </RouteGuard>
        <OfflineBanner />
      </AuthProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  biometricText: {
    fontFamily: fonts.archivo.medium,
    fontSize: 16,
    color: colors.slate,
  },
});
