import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import Svg, { Circle, Line, G } from 'react-native-svg';
import type { EntityConnection } from '@stroom/supabase';
import { colors, fonts, radius, spacing } from '../constants/brand';

interface EntityMiniMapProps {
  centerName: string;
  connections: EntityConnection[];
  onNodePress: (otherEntityId: string) => void;
  // Hard cap on neighbours rendered — beyond this the map gets cluttered.
  maxNodes?: number;
}

const SIZE = 260;
const CENTER = SIZE / 2;
const CENTER_RADIUS = 22;
const NODE_RADIUS = 14;
const ORBIT_RADIUS = 92;

// Visual mini-map of an entity's direct neighbours. The center node is the
// current entity; surrounding nodes are laid out evenly on a single orbit,
// connected by thin teal lines. Each surrounding node is tappable via an
// absolutely-positioned Pressable overlay matched to the SVG circle.
export function EntityMiniMap({
  centerName,
  connections,
  onNodePress,
  maxNodes = 8,
}: EntityMiniMapProps) {
  // Dedup by otherEntityId, keep the strongest (highest claimCount) entry.
  const nodes = React.useMemo(() => {
    const best = new Map<string, EntityConnection>();
    for (const c of connections) {
      const existing = best.get(c.otherEntityId);
      if (!existing || c.claimCount > existing.claimCount) {
        best.set(c.otherEntityId, c);
      }
    }
    return Array.from(best.values())
      .sort((a, b) => b.claimCount - a.claimCount)
      .slice(0, maxNodes);
  }, [connections, maxNodes]);

  const positioned = React.useMemo(() => {
    const count = nodes.length;
    if (count === 0) return [];
    return nodes.map((n, i) => {
      // Distribute evenly around the circle, starting at the top.
      const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
      const x = CENTER + Math.cos(angle) * ORBIT_RADIUS;
      const y = CENTER + Math.sin(angle) * ORBIT_RADIUS;
      return { node: n, x, y };
    });
  }, [nodes]);

  if (nodes.length === 0) {
    return (
      <View style={styles.emptyCard}>
        <Text style={styles.emptyText}>No connections to map yet.</Text>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>RELATIONSHIP MAP</Text>
      <View style={styles.stage}>
        <Svg width={SIZE} height={SIZE}>
          {/* Lines from center to each node */}
          <G>
            {positioned.map(({ node, x, y }) => (
              <Line
                key={`line-${node.otherEntityId}`}
                x1={CENTER}
                y1={CENTER}
                x2={x}
                y2={y}
                stroke={colors.teal}
                strokeOpacity={0.35}
                strokeWidth={1}
              />
            ))}
          </G>
          {/* Orbit ring (faint) */}
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={ORBIT_RADIUS}
            stroke={colors.glassBorder}
            strokeWidth={1}
            fill="transparent"
          />
          {/* Neighbour nodes */}
          {positioned.map(({ node, x, y }) => (
            <Circle
              key={`node-${node.otherEntityId}`}
              cx={x}
              cy={y}
              r={NODE_RADIUS}
              fill={colors.surfaceElevated}
              stroke={colors.teal}
              strokeOpacity={0.6}
              strokeWidth={1.5}
            />
          ))}
          {/* Center node — current entity */}
          <Circle
            cx={CENTER}
            cy={CENTER}
            r={CENTER_RADIUS}
            fill={colors.teal}
            stroke={colors.teal}
            strokeWidth={2}
          />
        </Svg>

        {/* Overlayed Pressable hotspots + name labels for each neighbour */}
        {positioned.map(({ node, x, y }) => (
          <Pressable
            key={`hit-${node.otherEntityId}`}
            onPress={() => onNodePress(node.otherEntityId)}
            style={({ pressed }) => [
              styles.nodeHit,
              {
                left: x - NODE_RADIUS - 4,
                top: y - NODE_RADIUS - 4,
              },
              pressed && { opacity: 0.6, transform: [{ scale: 0.95 }] },
            ]}
            hitSlop={4}
            accessibilityRole="button"
            accessibilityLabel={`Open ${node.otherEntityName}`}
          >
            <View style={styles.nodeHitInner} />
          </Pressable>
        ))}

        {/* Floating labels under each neighbour */}
        {positioned.map(({ node, x, y }) => {
          // Keep labels inside the stage — clamp left edge.
          const labelLeft = Math.max(0, Math.min(SIZE - 80, x - 40));
          return (
            <Text
              key={`label-${node.otherEntityId}`}
              numberOfLines={1}
              style={[
                styles.nodeLabel,
                {
                  left: labelLeft,
                  top: y + NODE_RADIUS + 4,
                  width: 80,
                },
              ]}
            >
              {node.otherEntityName}
            </Text>
          );
        })}

        {/* Center label */}
        <Text
          numberOfLines={1}
          style={[
            styles.centerLabel,
            { left: CENTER - 60, top: CENTER + CENTER_RADIUS + 6 },
          ]}
        >
          {centerName}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  label: {
    fontFamily: fonts.archivo.medium,
    fontSize: 11,
    color: colors.slate,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  stage: {
    width: SIZE,
    height: SIZE + 20,
    alignSelf: 'center',
    position: 'relative',
  },
  nodeHit: {
    position: 'absolute',
    width: (NODE_RADIUS + 4) * 2,
    height: (NODE_RADIUS + 4) * 2,
    borderRadius: NODE_RADIUS + 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeHitInner: {
    width: '100%',
    height: '100%',
    borderRadius: 999,
  },
  nodeLabel: {
    position: 'absolute',
    fontFamily: fonts.mono.regular,
    fontSize: 9,
    color: colors.silver,
    textAlign: 'center',
  },
  centerLabel: {
    position: 'absolute',
    width: 120,
    fontFamily: fonts.archivo.semibold,
    fontSize: 10,
    color: colors.teal,
    textAlign: 'center',
  },
  emptyCard: {
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.glassBorder,
    backgroundColor: colors.surfaceCard,
  },
  emptyText: {
    fontFamily: fonts.archivo.regular,
    fontSize: 12,
    color: colors.slate,
    textAlign: 'center',
  },
});
