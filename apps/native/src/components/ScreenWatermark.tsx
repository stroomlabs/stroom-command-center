import React, { useEffect, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { colors } from '../constants/brand';

// Stroom Helix brand watermark — sits behind the header on every main
// screen. Purely decorative: ignored by touches and assistive tech.
//
// Path data is inlined from assets/stroomhelix.svg (original viewBox
// 6134.78 × 2798.3, two teal strokes making the double-helix mark).
// We inline rather than import-the-file because the repo doesn't have
// react-native-svg-transformer wired into metro.config — inlining keeps
// the watermark purely JS and therefore OTA-safe. If you ever add the
// transformer, the component can be swapped for
//   <HelixSvg width={520} height={238} fill={...} />
// without touching any call site.
//
// Honors prefers-reduced-transparency: opacity drops from 0.05 → 0.02.

const HELIX_VIEWBOX_WIDTH = 6134.78;
const HELIX_VIEWBOX_HEIGHT = 2798.3;

// Path data extracted verbatim from assets/stroomhelix.svg.
const HELIX_PATH_TOP =
  'M3949.39,801.3h-10.9c-268.5,0-556.3,172.5-731.3,410.6c-3.6,34.3-9.9,69.6-18.9,105.5' +
  'c-27.7,111-77.8,217.7-144.4,315c-195.3,285.4-531.6,490.6-854.1,490.6h-88.3l-1307.1-0.1l338.5-1357.7' +
  'c10.6-42.6,71.3-89.9,104.5-89.9h1114.4c104.1-144.8,230.1-277.3,374.2-392.2c127-101.1,263.4-184.8,405.3-249.6' +
  'c-95.5-22.2-196.2-33.5-300.9-33.5h-1693.3c-347.5,0-674.1,258.7-759.7,601.8L20.59,2033.1' +
  'c-48.5,194.5-10.4,390.6,104.7,537.8c112.9,144.5,288.8,227.4,482.5,227.4h1693.3c115.4,0,230.4-14,343.1-40.3' +
  'c431.8-101,828.8-384.2,1079.9-761c105.2-157.8,184.8-332,230.7-516.2C4013.49,1245.6,4010.29,1011.7,3949.39,801.3z';

const HELIX_PATH_BOTTOM =
  'M6009.49,227.4C5896.59,82.9,5720.79,0,5526.99,0h-1686c-115.5,0-230.5,14-343.2,40.4' +
  'c-431.8,101-828.7,384.1-1079.9,760.9c-105.2,157.8-184.8,332-230.7,516.2c-58.7,235.2-55.5,469.1,5.4,679.5' +
  'c267.7-1.2,554.1-173.2,728.5-410.4c3.6-34.4,9.9-69.7,18.9-105.8c27.7-111,77.8-217.6,144.5-314.9' +
  'c195.3-285.4,531.6-490.6,854-490.6h1282.7c71.9,0,124.6,67.5,107.2,137.2l-304.3,1220.6' +
  'c-10.6,42.5-71.3,89.9-104.4,89.9h-1129.6c-104,144.8-229.9,277.3-374,392.1c-127,101.1-263.5,184.9-405.4,249.7' +
  'c95.5,22.2,196.3,33.5,301,33.5h1686c347.5,0,674.1-258.7,759.7-601.8l356.8-1431.3' +
  'C6162.69,570.6,6124.59,374.6,6009.49,227.4z';

// Box size — preserves the SVG's native 2.19:1 aspect ratio so the
// helix reads as itself rather than a squashed blob.
const BOX_WIDTH = 520;
const BOX_HEIGHT = Math.round(
  (BOX_WIDTH * HELIX_VIEWBOX_HEIGHT) / HELIX_VIEWBOX_WIDTH
); // ≈ 237

export function ScreenWatermark() {
  const [reduceTransparency, setReduceTransparency] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((enabled) => {
        if (!cancelled) setReduceTransparency(enabled);
      })
      .catch(() => {
        // Older RN / Android may not expose the API — treat as "off".
      });
    const sub = AccessibilityInfo.addEventListener(
      'reduceTransparencyChanged',
      (enabled) => setReduceTransparency(!!enabled)
    );
    return () => {
      cancelled = true;
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
      <Svg
        width={BOX_WIDTH}
        height={BOX_HEIGHT}
        viewBox={`0 0 ${HELIX_VIEWBOX_WIDTH} ${HELIX_VIEWBOX_HEIGHT}`}
      >
        <G>
          <Path d={HELIX_PATH_TOP} fill={colors.teal} />
          <Path d={HELIX_PATH_BOTTOM} fill={colors.teal} />
        </G>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    top: -30,
    left: -80,
    width: BOX_WIDTH,
    height: BOX_HEIGHT,
    zIndex: 0,
  },
});
