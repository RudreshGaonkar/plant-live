import { SkeletonLoader } from '@/components/SkeletonLoader';
/**
 * Tab Layout – "The Stage" Architecture
 * Uses FloatingDock as a custom tab bar with Expo Router Tabs.
 * uiLayout.md Section 2 & 13
 */
import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import { Tabs, router, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';
import { ref, onValue } from 'firebase/database';
import { db } from '@/services/firebase';
import { FloatingDock } from '@/components/FloatingDock';
import { WaterNowSheet } from '@/components/WaterNowSheet';
import { useLiveDevice, useLiveDeviceSync } from '@/hooks/useLiveDevice';
import { useAlertEngine } from '@/hooks/useAlertEngine';
import { normalizePrefs, useSession } from '@/store/useSession';

export default function TabLayout() {
  const segments = useSegments();
  const [waterSheetVisible, setWaterSheetVisible] = useState(false);

  const user = useSession((s) => s.user);
  const pairingStatus = useSession((s) => s.pairingStatus);
  const retryBoot = useSession((s) => s.retryBoot);

  useLiveDeviceSync();
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const { unreadCount } = useAlertEngine();

  useEffect(() => {
    if (!user?.uid || pairingStatus === 'pending') return;
    const uid = user.uid;
    let active = true;
    const unsubscribe = onValue(ref(db, `users/${uid}/prefs`), (snapshot) => {
      if (active && useSession.getState().user?.uid === uid) {
        useSession.getState().setPrefs(normalizePrefs(snapshot.val()));
      }
    }, (error) => console.warn('[LeafLink] Preferences unavailable:', error.message));
    return () => {
      active = false;
      unsubscribe();
    };
  }, [user?.uid, pairingStatus]);

  if (pairingStatus === 'pending') {
    const route = segments.at(-1);
    if (route === 'history' || route === 'settings' || route === 'home' || route === '(tabs)') {
      return <SkeletonLoader screen={route === '(tabs)' ? 'home' : route} />;
    }
    return (
      <View style={{ flex: 1, backgroundColor: '#16221A', justifyContent: 'center', alignItems: 'center' }}>
        <StatusBar style="light" />
        <ActivityIndicator size="large" color="#CEEA9F" />
      </View>
    );
  }

  // Guard direct entry if device resolution failed or is unavailable
  if (pairingStatus === 'unavailable') {
    return (
      <View style={{ flex: 1, backgroundColor: '#16221A', justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <StatusBar style="light" />
        <Ionicons name="cloud-offline-outline" size={56} color="#F6FAF2" style={{ marginBottom: 16 }} />
        <Text style={{ color: '#F6FAF2', fontSize: 18, fontWeight: '700', textAlign: 'center', marginBottom: 8 }}>
          Connection Unavailable
        </Text>
        <Text style={{ color: '#80B07F', fontSize: 14, textAlign: 'center', marginBottom: 24, lineHeight: 20 }}>
          Could not load your plant controller data. Please check your network and retry.
        </Text>
        <TouchableOpacity
          onPress={() => retryBoot()}
          style={{ backgroundColor: '#CEEA9F', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 999 }}
        >
          <Text style={{ color: '#16221A', fontWeight: '700', fontSize: 15 }}>Retry Connection</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const ackStatus = device?.command?.ack?.status;
  const isTerminalAck = ackStatus === 'done' || ackStatus === 'failed' || ackStatus === 'rejected';

  // Live pump state: reflects ONLY active pumping and immediately resets to idle
  // as soon as telemetry.pumpOn becomes false or /command/ack/status reaches "done", "failed", or "rejected"
  const isPumpActive =
    !isTerminalAck &&
    Boolean(device?.telemetry?.isPumpActive === true || device?.telemetry?.pumpOn === true);

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
