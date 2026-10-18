/**
 * Tab Layout – "The Stage" Architecture
 * Uses FloatingDock as a custom tab bar with Expo Router Tabs.
 * uiLayout.md Section 2 & 13
 */
import React, { useState } from 'react';
import { View } from 'react-native';
import { Tabs, router, useSegments } from 'expo-router';
import { FloatingDock } from '@/components/FloatingDock';
import { WaterNowSheet } from '@/components/WaterNowSheet';

export default function TabLayout() {
  const segments = useSegments();
  const [waterSheetVisible, setWaterSheetVisible] = useState(false);

  // Derive active route from segments
  const activeRoute = segments[segments.length - 1] ?? 'home';

  const handleTabPress = (name: string) => {
    router.navigate(`/(tabs)/${name}` as Parameters<typeof router.navigate>[0]);
  };

  const handleWaterDialSelect = (duration: number) => {
    if (duration === -1) {
      // Custom → open full water sheet
      setWaterSheetVisible(true);
    } else {
      setWaterSheetVisible(true);
    }
  };

  return (
    <View style={{ flex: 1 }}>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: { display: 'none' }, // hide standard tab bar
        }}
      >
        <Tabs.Screen name="home" />
        <Tabs.Screen name="history" />
        <Tabs.Screen name="alerts" />
        <Tabs.Screen name="control" />
        <Tabs.Screen name="settings" />
      </Tabs>

      {/* Custom floating dock overlays on top of all tabs */}
      <FloatingDock
        activeRoute={activeRoute}
        onTabPress={handleTabPress}
        onWaterPress={() => setWaterSheetVisible(true)}
        onWaterDialSelect={handleWaterDialSelect}
      />

      {/* Global Water Sheet accessible from dock */}
      <WaterNowSheet
        visible={waterSheetVisible}
        onClose={() => setWaterSheetVisible(false)}
      />
    </View>
  );
}
