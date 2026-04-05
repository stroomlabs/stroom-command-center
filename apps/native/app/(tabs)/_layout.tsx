import React from 'react';
import { Tabs } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { usePulseData } from '../../src/hooks/usePulseData';
import { TabIcon } from '../../src/components/TabIcon';
import { colors, fonts } from '../../src/constants/brand';

// Tab switch animation: every tab screen wraps its root in <ScreenTransition>
// (src/components/ScreenTransition.tsx), which runs a Reanimated fade +
// translateY(15 → 0) over 200ms on every focus event. Expo Router's Tabs
// navigator doesn't expose a per-screen content wrapper, so the animation
// lives inside each screen rather than at the navigator level — this is the
// layout-level entering animation for tabs.

const tabPressListeners = {
  tabPress: () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  },
};

export default function TabLayout() {
  const { data } = usePulseData();
  const queueDepth = data?.queueDepth ?? 0;

  return (
    <Tabs
      screenListeners={tabPressListeners}
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surfaceElevated,
          borderTopColor: colors.glassBorder,
          borderTopWidth: 1,
          height: 88,
          paddingBottom: 30,
          paddingTop: 8,
        },
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.slate,
        tabBarLabelStyle: {
          fontFamily: fonts.archivo.medium,
          fontSize: 11,
          letterSpacing: 0.3,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Pulse',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="pulse" size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Queue',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="layers-outline"
              size={size}
              color={color}
              focused={focused}
            />
          ),
          tabBarBadge: queueDepth > 0 ? queueDepth : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.statusPending,
            color: colors.obsidian,
            fontFamily: fonts.mono.semibold,
            fontSize: 11,
            minWidth: 18,
            height: 18,
            lineHeight: 14,
          },
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="search-outline"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="command"
        options={{
          title: 'Command',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="sparkles"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="ops"
        options={{
          title: 'Ops',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="construct-outline"
              size={size}
              color={color}
              focused={focused}
            />
          ),
        }}
      />
    </Tabs>
  );
}
