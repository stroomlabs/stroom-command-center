import React, { useEffect, useCallback, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { haptics } from '../lib/haptics';
import { colors, fonts, spacing, radius } from '../constants/brand';

const PREFIX = 'stroom.ops.collapsed.';

interface CollapsibleSectionProps {
  sectionKey: string;
  title: string;
  children: React.ReactNode;
}

export function CollapsibleSection({
  sectionKey,
  title,
  children,
}: CollapsibleSectionProps) {
  const [collapsed, setCollapsed] = useState(false);
  const rotate = useSharedValue(0);
  const heightScale = useSharedValue(1);

  // Load persisted state
  useEffect(() => {
    AsyncStorage.getItem(PREFIX + sectionKey).then((v) => {
      if (v === '1') {
        setCollapsed(true);
        rotate.value = -90;
        heightScale.value = 0;
      }
    });
  }, [sectionKey, rotate, heightScale]);

  const toggle = useCallback(() => {
    haptics.tap.light();
    const next = !collapsed;
    setCollapsed(next);
    rotate.value = withTiming(next ? -90 : 0, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
    heightScale.value = withTiming(next ? 0 : 1, {
      duration: 200,
      easing: Easing.out(Easing.ease),
    });
    AsyncStorage.setItem(PREFIX + sectionKey, next ? '1' : '0');
  }, [collapsed, sectionKey, rotate, heightScale]);

  const chevronStyle = useAnimatedStyle(() => ({
    transform: [{ rotate: `${rotate.value}deg` }],
  }));

  const bodyStyle = useAnimatedStyle(() => ({
    opacity: heightScale.value,
    maxHeight: heightScale.value === 0 ? 0 : 9999,
    overflow: 'hidden' as const,
  }));

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={toggle}
        style={({ pressed }) => [
          styles.header,
          pressed && { opacity: 0.7 },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`${collapsed ? 'Expand' : 'Collapse'} ${title}`}
      >
        <Text style={styles.title}>{title}</Text>
        <Animated.View style={chevronStyle}>
          <Ionicons name="chevron-down" size={14} color={colors.slate} />
        </Animated.View>
      </Pressable>
      <Animated.View style={bodyStyle}>{children}</Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    marginBottom: spacing.md,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: spacing.sm,
  },
  title: {
    fontFamily: fonts.archivo.bold,
    fontSize: 13,
    color: colors.alabaster,
    letterSpacing: 0.2,
  },
});
