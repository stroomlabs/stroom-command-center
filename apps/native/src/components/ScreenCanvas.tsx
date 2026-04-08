import React from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Universal full-screen background. Mounts at the root of every screen as
// the single source of truth for atmosphere. Renders absolutely-positioned
// with zIndex -1 and pointer-events disabled so it sits fully behind every
// other element without intercepting touches.
//
// Static — two layers, no animation, no circles, no pulses:
//   1. Linear gradient top-left #0d0e10 → bottom-right #07080a
//   2. Faint silver wash rgba(200, 204, 206, 0.03) full-screen overlay
export function ScreenCanvas() {
  return (
    <View pointerEvents="none" style={styles.canvas}>
      {/* Layer 1 — diagonal base gradient */}
      <LinearGradient
        colors={['#0d0e10', '#07080a']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
      />

      {/* Layer 2 — faint silver wash overlay */}
      <View style={styles.silverWash} />
    </View>
  );
}

const styles = StyleSheet.create({
  canvas: {
    ...StyleSheet.absoluteFillObject,
    zIndex: -1,
  },
  silverWash: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(200, 204, 206, 0.03)',
  },
});
