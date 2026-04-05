import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import NetInfo from '@react-native-community/netinfo';
import { colors, fonts, spacing } from '../constants/brand';

// Subtle red banner that appears at the top of every screen when the device
// loses network connectivity. Rendered once at the root layout.
export function OfflineBanner() {
  const insets = useSafeAreaInsets();
  const [online, setOnline] = useState(true);

  useEffect(() => {
    // Prime state
    NetInfo.fetch().then((state) => {
      setOnline(Boolean(state.isConnected && (state.isInternetReachable ?? true)));
    });

    const unsub = NetInfo.addEventListener((state) => {
      setOnline(Boolean(state.isConnected && (state.isInternetReachable ?? true)));
    });
    return () => unsub();
  }, []);

  if (online) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 4 }]} pointerEvents="none">
      <Ionicons name="cloud-offline-outline" size={13} color={colors.statusReject} />
      <Text style={styles.text}>Offline — data may be stale</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingBottom: 6,
    backgroundColor: 'rgba(239, 68, 68, 0.12)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(239, 68, 68, 0.3)',
  },
  text: {
    fontFamily: fonts.archivo.semibold,
    fontSize: 11,
    color: colors.statusReject,
    letterSpacing: 0.3,
  },
});
