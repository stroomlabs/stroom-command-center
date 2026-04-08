import React from 'react';
import { StyleSheet, Pressable, type ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

// Shared vignette backdrop for all glassmorphic modals and bottom sheets.
// Renders a simulated radial gradient — lighter center → darker edges —
// that draws the eye to the modal content. The Pressable wrapper
// forwards the dismiss handler so tapping outside closes the modal.
interface ModalBackdropProps {
  children: React.ReactNode;
  onPress?: () => void;
  style?: ViewStyle;
}

export function ModalBackdrop({ children, onPress, style }: ModalBackdropProps) {
  return (
    <Pressable style={[styles.wrap, style]} onPress={onPress}>
      {/* Two-layer vignette: a vertical gradient for the top/bottom darken
          and an overlay for the horizontal edges. Together they approximate
          a radial vignette without a native RadialGradient component. */}
      <LinearGradient
        colors={[
          'rgba(0,0,0,0.55)',
          'rgba(0,0,0,0.30)',
          'rgba(0,0,0,0.30)',
          'rgba(0,0,0,0.65)',
        ]}
        locations={[0, 0.35, 0.65, 1]}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
});
