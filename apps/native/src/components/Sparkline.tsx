import React from 'react';
import { View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';
import { colors } from '../constants/brand';

// Tiny inline sparkline — renders a claim-frequency trend line over the
// last N days as a minimal SVG polyline. No axes, no labels, no grid.
// Green = active enrichment, flat = dormant. Designed to fit in tight
// spaces (default 80x30). If data is empty, renders nothing.
interface SparklineProps {
  data: number[]; // one value per day, most-recent last
  width?: number;
  height?: number;
  color?: string;
}

export function Sparkline({
  data,
  width = 80,
  height = 30,
  color = colors.teal,
}: SparklineProps) {
  if (data.length < 2) return null;

  const max = Math.max(...data, 1); // at least 1 to avoid /0
  const padY = 2;
  const usableH = height - padY * 2;
  const stepX = width / (data.length - 1);

  const points = data
    .map((v, i) => {
      const x = i * stepX;
      const y = padY + usableH - (v / max) * usableH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <View style={{ width, height }}>
      <Svg width={width} height={height}>
        <Polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}
