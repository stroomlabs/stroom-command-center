import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { BottomTabBar, type BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import { haptics } from '../../src/lib/haptics';
import { usePulseContext } from '../../src/lib/PulseContext';
import { TabIcon } from '../../src/components/TabIcon';
import { useCapabilities } from '../../src/hooks/useCapabilities';
import { colors, fonts } from '../../src/constants/brand';

const tabPressListeners = {
  tabPress: () => {
    haptics.tap.light();
  },
};

// Custom tab bar wrapper — renders a BlurView behind the default
// BottomTabBar for real glassmorphism, with a 1px top glow line.
function GlassTabBar(props: BottomTabBarProps) {
  return (
    <View
      style={tabStyles.wrap}
      accessibilityRole={'tabBar' as any}
      accessibilityLabel="Main navigation"
    >
      {Platform.OS === 'ios' && (
        <BlurView intensity={20} tint="dark" style={StyleSheet.absoluteFill} />
      )}
      <View style={tabStyles.topGlow} pointerEvents="none" />
      <BottomTabBar {...props} />
    </View>
  );
}

const tabStyles = StyleSheet.create({
  wrap: {
    // The BottomTabBar positions itself; we just layer behind it.
    backgroundColor: Platform.OS === 'ios' ? 'rgba(5, 5, 7, 0.75)' : '#050507',
    overflow: 'hidden',
  },
  topGlow: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    zIndex: 1,
  },
});

export default function TabLayout() {
  const { data } = usePulseContext();
  const queueDepth = data?.queueDepth ?? 0;
  const { hasCapability, isLoading: capsLoading, capabilities } =
    useCapabilities();

  // While the very first capability snapshot is still in flight (i.e. no
  // cached snapshot at all), permit every tab so we don't visibly collapse
  // the bar mid-load. Once a snapshot lands — even a stale one from
  // AsyncStorage — we honor its answer. Owner role (Kevin) has every
  // capability set, so this only matters for future restricted operators.
  const haveSnapshot = !capsLoading || Object.keys(capabilities).length > 0;
  const canSee = (capability: string) =>
    !haveSnapshot ? true : hasCapability(capability);

  // Expo Router 4 hides a tab from the bar by setting `href: null` on the
  // screen options. The route stays registered (so deep links still work
  // for an owner reaching it via a direct path), but it disappears from
  // the visible bottom bar.
  const hideIfDenied = (capability: string) =>
    canSee(capability) ? undefined : { href: null as any };

  return (
    <Tabs
      screenListeners={tabPressListeners}
      tabBar={(props) => <GlassTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        // Override React Navigation's default white scene background so the
        // ScreenCanvas stays visible during tab transitions — no white flash.
        // In React Navigation v7, sceneStyle in screenOptions replaces the
        // older top-level sceneContainerStyle prop.
        sceneStyle: { backgroundColor: 'transparent' },
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopWidth: 0,
          height: 85,
          paddingBottom: 30,
          paddingTop: 8,
          elevation: 0,
        },
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: 'rgba(255, 255, 255, 0.4)',
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
          tabBarAccessibilityLabel: 'Pulse tab',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon name="pulse" size={size} color={color} focused={focused} />
          ),
        }}
      />
      <Tabs.Screen
        name="queue"
        options={{
          title: 'Queue',
          tabBarAccessibilityLabel:
            queueDepth > 0 ? `Queue tab, ${queueDepth} items` : 'Queue tab',
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
            backgroundColor: colors.statusReject,
            color: colors.alabaster,
            fontFamily: fonts.mono.semibold,
            fontSize: 11,
            minWidth: 18,
            height: 18,
            lineHeight: 14,
          },
          ...hideIfDenied('claims.review'),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarAccessibilityLabel: 'Explore tab',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="search-outline"
              size={size}
              color={color}
              focused={focused}
            />
          ),
          ...hideIfDenied('entities.read'),
        }}
      />
      <Tabs.Screen
        name="command"
        options={{
          title: 'Command',
          tabBarAccessibilityLabel: 'Command tab',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="sparkles"
              size={size}
              color={color}
              focused={focused}
            />
          ),
          ...hideIfDenied('command.use'),
        }}
      />
      <Tabs.Screen
        name="projects"
        options={{
          title: 'Projects',
          tabBarAccessibilityLabel: 'Projects tab',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name={focused ? 'briefcase' : 'briefcase-outline'}
              size={size}
              color={color}
              focused={focused}
            />
          ),
          ...hideIfDenied('projects.read'),
        }}
      />
      <Tabs.Screen
        name="ops"
        options={{
          title: 'Ops',
          tabBarAccessibilityLabel: 'Ops tab',
          tabBarIcon: ({ color, size, focused }) => (
            <TabIcon
              name="construct-outline"
              size={size}
              color={color}
              focused={focused}
            />
          ),
          ...hideIfDenied('admin.settings'),
        }}
      />
    </Tabs>
  );
}
