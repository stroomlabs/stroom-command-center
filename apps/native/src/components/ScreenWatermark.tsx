import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import { colors, fonts } from '../constants/brand';

// Oversized silver "S" emblem that sits behind the header on any screen.
// Rendered absolutely positioned in the top-left corner, tucked partially
// off-screen, at very low opacity. Purely decorative — never receives
// touches, never announces itself to assistive tech.
//
// We draw the emblem as a Text node (Archivo Black "S") rather than an
// Image/SVG because the repo doesn't ship a transparent emblem asset and
// tinting the full icon.png would produce a solid square. The glyph is
// baseline-aligned inside a fixed-size box so the visible shape matches
// the spec's 320×320 footprint with the prescribed top/left offset.
//
// If a real asset is dropped in later (e.g. assets/stroomemblem.svg), the
// <Text> can be swapped for an <Image source={…} tintColor="#C8CCCE" />
// without changing any call sites — the wrapper box stays the same.
export function ScreenWatermark() {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceTransparency(enabled);
      })
      .catch(() => {
        // Older RN/Android may not expose the API — treat as "off".
      });
    const sub = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (enabled) => setReduceTransparency(!!enabled)
    );
    return () => {
      cancelled = true;
      // RN ≥0.65 returns a subscription with .remove(); older APIs used
      // removeEventListener. Guard against both without typing constraints.
      if (sub && typeof (sub as any).remove === 'function') {
        (sub as any).remove();
      }
    };
  }, []);

  const opacity = reduceTransparency ? 0.02 : 0.05;

  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[styles.wrap, { opacity }]}
    >
      <Text style={styles.glyph} allowFontScaling={false}>
        S
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -40,
    left: -60,
    width: 320,
    height: 320,
    zIndex: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glyph: {
    fontFamily: fonts.archivo.black,
    // Sized so the glyph fills the 320×320 box. Archivo Black at ~340pt
    // lines up visually with a 320pt bounding footprint.
    fontSize: 340,
    lineHeight: 340,
    color: colors.silver, // #C8CCCE
    letterSpacing: -8,
    includeFontPadding: false,
  },
});
