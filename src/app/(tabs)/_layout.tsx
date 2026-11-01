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
import { useLiveDevice } from '@/hooks/useLiveDevice';
import { useAlertEngine } from '@/hooks/useAlertEngine';

export default function TabLayout() {
  const segments = useSegments();
  const [waterSheetVisible, setWaterSheetVisible] = useState(false);

  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const isWateringActive = useLiveDevice((s) => s.isWateringActive);
  const { unreadCount } = useAlertEngine();

  // Live pump state bound to Firebase telemetry.isPumpActive and control.pumpState
  const isPumpActive = Boolean(
    device?.telemetry?.isPumpActive ||
    device?.telemetry?.pumpOn ||
    device?.control?.pumpState ||
    isWateringActive
  );

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

      {/* Custom floating dock overlays on top of all tabs with live pump state */}
      <FloatingDock
        activeRoute={activeRoute}
        onTabPress={handleTabPress}
        onWaterPress={() => setWaterSheetVisible(true)}
        onWaterDialSelect={handleWaterDialSelect}
        isWatering={isPumpActive}
        unreadAlerts={unreadCount}
      />

      {/* Global Water Sheet accessible from dock */}
      <WaterNowSheet
        visible={waterSheetVisible}
        onClose={() => setWaterSheetVisible(false)}
      />
    </View>
  );
}
