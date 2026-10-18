import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import { simulatedDevice } from '@/services/simulator';
import { LocationCard } from '@/components/LocationCard';

export default function SettingsScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const { user, isDemoMode, signOut } = useSession();
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const updateLocation = useLiveDevice((s) => s.updateLocation);
  const updateSensors = useLiveDevice((s) => s.updateSensors);
  const refillBottle = useLiveDevice((s) => s.refillBottle);

  // Hidden developer panel unlock (5 taps on version label - spec section 7.8)
  const [tapCount, setTapCount] = useState<number>(0);
  const [devPanelOpen, setDevPanelOpen] = useState<boolean>(false);

  // Developer panel override states
  const [offlineTrigger, setOfflineTrigger] = useState(false);
  const [bottleEmptyTrigger, setBottleEmptyTrigger] = useState(false);
  const [heatWaveTrigger, setHeatWaveTrigger] = useState(false);

  if (!device) return null;

  const { config, status } = device;
  const hasLdr = config.sensors.lightMode !== 'none';

  const handleVersionTap = () => {
    const nextCount = tapCount + 1;
    if (nextCount >= 5) {
      setDevPanelOpen(true);
      Alert.alert('Developer Mode Active', 'Simulator force overrides are now accessible.');
      setTapCount(0);
    } else {
      setTapCount(nextCount);
    }
  };

  const handleSignOut = async () => {
    Alert.alert('Sign Out', 'Are you sure you want to exit your session?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/(auth)/login');
        },
      },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>Settings & Plant Setup</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Device hardware, threshold calibration & simulator controls.
        </Text>

        {/* User Account Bar */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.border,
              padding: spacing.md,
            },
          ]}
        >
          <View style={styles.accountRow}>
            <View
              style={[
                styles.avatarWrap,
                {
                  backgroundColor: isDemoMode ? colors.palette.lime : colors.palette.mist,
                  borderRadius: radii.full,
                },
              ]}
            >
              <Ionicons
                name={isDemoMode ? 'sparkles' : 'person'}
                size={20}
                color={colors.palette.forest}
              />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.accountName, { color: colors.text }]}>
                {user?.displayName || (isDemoMode ? 'Demo Mode User' : 'Authenticated User')}
              </Text>
              <Text style={[styles.accountEmail, { color: colors.textMuted }]}>
                {user?.email || (isDemoMode ? 'Local Simulation (No hardware)' : '')}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleSignOut}
              style={[
                styles.logoutBtn,
                {
                  backgroundColor: colors.palette.blush,
                  borderRadius: radii.sm,
                  borderColor: colors.palette.warningBorder,
                },
              ]}
            >
              <Ionicons name="log-out-outline" size={14} color={colors.palette.warningText} />
              <Text style={[styles.logoutBtnText, { color: colors.palette.warningText }]}>
                {isDemoMode ? 'Exit Demo' : 'Sign Out'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Plant Location Profiles */}
        <View style={styles.sectionRow}>
          <View style={[styles.sectionDot, { backgroundColor: colors.palette.forest }]} />
          <Text style={[styles.sectionHeading, { color: colors.text }]}>
            Plant Location Profile
          </Text>
        </View>
        <LocationCard
          location="balcony"
          selected={config.location === 'balcony'}
          onSelect={updateLocation}
        />
        <LocationCard
          location="terrace"
          selected={config.location === 'terrace'}
          onSelect={updateLocation}
        />
        <LocationCard
          location="indoor"
          selected={config.location === 'indoor'}
          onSelect={updateLocation}
        />

        {/* Hardware & Sensor Toggles */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.border,
              padding: spacing.md,
            },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <Ionicons name="hardware-chip-outline" size={18} color={colors.palette.forest} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Sensors & Reservoir</Text>
          </View>

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Light Sensor (LDR)</Text>
              <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                Sunlight telemetry tile visibility
              </Text>
            </View>
            <Switch
              value={hasLdr}
              onValueChange={(val) => updateSensors({ lightMode: val ? 'digital' : 'none' })}
              trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
              thumbColor={colors.palette.white}
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.palette.lime }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Reservoir Bottle</Text>
              <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                Capacity: {config.bottle.capacityMl} ml (Flow: {config.bottle.flowMlPerSec} ml/s)
              </Text>
            </View>
            <TouchableOpacity
              onPress={refillBottle}
              style={[
                styles.smallBtn,
                { backgroundColor: colors.palette.lime, borderRadius: radii.sm },
              ]}
            >
              <Ionicons
                name="refresh-outline"
                size={12}
                color={colors.palette.ink}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.smallBtnText, { color: colors.palette.ink }]}>Refill</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Device Information & Mesh Ready */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.border,
              padding: spacing.md,
            },
          ]}
        >
          <View style={styles.cardTitleRow}>
            <Ionicons name="server-outline" size={18} color={colors.palette.forest} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Device & Mesh Hub</Text>
          </View>

          <View style={styles.infoLine}>
            <Text style={[styles.infoKey, { color: colors.textMuted }]}>Device ID</Text>
            <View
              style={[
                styles.infoValueWrap,
                { backgroundColor: colors.palette.mist, borderRadius: radii.sm },
              ]}
            >
              <Text style={[styles.infoValMono, { color: colors.palette.forest }]}>
                {device.id}
              </Text>
            </View>
          </View>
          <View style={styles.infoLine}>
            <Text style={[styles.infoKey, { color: colors.textMuted }]}>Firmware Version</Text>
            <Text style={[styles.infoVal, { color: colors.text }]}>{status.firmware}</Text>
          </View>
          <View style={styles.infoLine}>
            <Text style={[styles.infoKey, { color: colors.textMuted }]}>Wi-Fi Signal (RSSI)</Text>
            <View style={styles.rssiRow}>
              <Ionicons
                name="wifi"
                size={14}
                color={colors.palette.forest}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.infoVal, { color: colors.text }]}>
                {device.telemetry.rssi} dBm
              </Text>
            </View>
          </View>
          <View style={styles.infoLine}>
            <Text style={[styles.infoKey, { color: colors.textMuted }]}>Mesh Hub Topology</Text>
            <View
              style={[
                styles.meshBadge,
                { backgroundColor: colors.palette.lime, borderRadius: radii.sm },
              ]}
            >
              <Ionicons
                name="git-network-outline"
                size={12}
                color={colors.palette.forest}
                style={{ marginRight: 4 }}
              />
              <Text style={[styles.meshBadgeText, { color: colors.palette.forest }]}>
                Hub-ready
              </Text>
            </View>
          </View>
        </View>

        {/* Developer Simulator Panel (Section 7.8) */}
        {devPanelOpen && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: 'rgba(248, 215, 218, 0.35)',
                borderRadius: radii.card,
                borderColor: colors.palette.blush,
                padding: spacing.md,
              },
            ]}
          >
            <View style={styles.cardTitleRow}>
              <Ionicons name="construct-outline" size={18} color={colors.palette.warningText} />
              <Text style={[styles.cardTitle, { color: colors.palette.warningText }]}>
                Hardware Simulator Developer Panel
              </Text>
            </View>
            <Text style={[styles.settingDesc, { color: colors.textMuted, marginBottom: 14 }]}>
              Control simulation curves, force threshold breaches, and test offline status:
            </Text>

            {/* Force Toggles */}
            <View style={styles.devGrid}>
              <TouchableOpacity
                onPress={() => {
                  const nextState = !offlineTrigger;
                  setOfflineTrigger(nextState);
                  simulatedDevice.overrides.forceOffline = nextState;
                  if (!nextState) {
                    useLiveDevice.getState().setOnlineStatus(true);
                  }
                }}
                style={[
                  styles.devToggleCard,
                  {
                    backgroundColor: offlineTrigger
                      ? colors.palette.forest
                      : colors.surface,
                    borderColor: colors.border,
                    borderRadius: radii.sm,
                  },
                ]}
              >
                <Ionicons
                  name={offlineTrigger ? 'cloud-offline' : 'cloud-done-outline'}
                  size={16}
                  color={offlineTrigger ? colors.palette.white : colors.palette.forest}
                />
                <Text
                  style={[
                    styles.devToggleText,
                    { color: offlineTrigger ? colors.palette.white : colors.text },
                  ]}
                >
                  {offlineTrigger ? 'Device Offline' : 'Device Online'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  const nextState = !bottleEmptyTrigger;
                  setBottleEmptyTrigger(nextState);
                  simulatedDevice.overrides.bottleEmptyTrigger = nextState;
                }}
                style={[
                  styles.devToggleCard,
                  {
                    backgroundColor: bottleEmptyTrigger
                      ? colors.palette.warningBorder
                      : colors.surface,
                    borderColor: colors.border,
                    borderRadius: radii.sm,
                  },
                ]}
              >
                <Ionicons
                  name="beaker-outline"
                  size={16}
                  color={bottleEmptyTrigger ? colors.palette.white : colors.palette.warningText}
                />
                <Text
                  style={[
                    styles.devToggleText,
                    { color: bottleEmptyTrigger ? colors.palette.white : colors.text },
                  ]}
                >
                  {bottleEmptyTrigger ? 'Bottle Empty' : 'Empty Bottle Test'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  const nextState = !heatWaveTrigger;
                  setHeatWaveTrigger(nextState);
                  simulatedDevice.overrides.heatWaveTrigger = nextState;
                }}
                style={[
                  styles.devToggleCard,
                  {
                    backgroundColor: heatWaveTrigger
                      ? colors.palette.warningBorder
                      : colors.surface,
                    borderColor: colors.border,
                    borderRadius: radii.sm,
                  },
                ]}
              >
                <Ionicons
                  name="flame-outline"
                  size={16}
                  color={heatWaveTrigger ? colors.palette.white : colors.palette.warningText}
                />
                <Text
                  style={[
                    styles.devToggleText,
                    { color: heatWaveTrigger ? colors.palette.white : colors.text },
                  ]}
                >
                  {heatWaveTrigger ? 'Heat Wave (38°C)' : 'Trigger Heat Wave'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* Quick Presets for Soil Moisture */}
            <Text
              style={[
                styles.settingLabel,
                { color: colors.text, marginTop: 12, marginBottom: 8, fontSize: 13 },
              ]}
            >
              Force Plant Health State (Moisture):
            </Text>
            <View style={styles.presetRow}>
              <TouchableOpacity
                onPress={() => {
                  simulatedDevice.overrides.forcedMoisture = 18;
                  useLiveDevice.getState().updateTelemetry({ soilMoisture: 18 });
                }}
                style={[
                  styles.presetBtn,
                  { backgroundColor: colors.palette.blush, borderRadius: radii.sm },
                ]}
              >
                <Text style={[styles.presetBtnText, { color: colors.palette.warningText }]}>
                  Thirsty (18%)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  simulatedDevice.overrides.forcedMoisture = 48;
                  useLiveDevice.getState().updateTelemetry({ soilMoisture: 48 });
                }}
                style={[
                  styles.presetBtn,
                  { backgroundColor: colors.palette.lime, borderRadius: radii.sm },
                ]}
              >
                <Text style={[styles.presetBtnText, { color: colors.palette.forest }]}>
                  Healthy (48%)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  simulatedDevice.overrides.forcedMoisture = 85;
                  useLiveDevice.getState().updateTelemetry({ soilMoisture: 85 });
                }}
                style={[
                  styles.presetBtn,
                  { backgroundColor: colors.palette.blush, borderRadius: radii.sm },
                ]}
              >
                <Text style={[styles.presetBtnText, { color: colors.palette.warningText }]}>
                  Overwatered (85%)
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  simulatedDevice.overrides.forcedMoisture = null;
                  simulatedDevice.overrides.forcedTemp = null;
                  simulatedDevice.overrides.forcedHumidity = null;
                  simulatedDevice.overrides.forcedBottleRemaining = null;
                }}
                style={[
                  styles.presetBtn,
                  { backgroundColor: colors.palette.mist, borderRadius: radii.sm },
                ]}
              >
                <Text style={[styles.presetBtnText, { color: colors.palette.ink }]}>Auto</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Version Footer */}
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleVersionTap}
          style={styles.versionFooter}
        >
          <View
            style={[
              styles.versionWrap,
              { backgroundColor: colors.palette.mist, borderRadius: radii.md },
            ]}
          >
            <Ionicons
              name="leaf-outline"
              size={16}
              color={colors.palette.sage}
              style={{ marginRight: 6 }}
            />
            <View>
              <Text style={[styles.versionText, { color: colors.textMuted }]}>
                LeafLink Mobile App v1.0.0 (Expo SDK 57)
              </Text>
              <Text style={[styles.versionHint, { color: colors.palette.sage }]}>
                {devPanelOpen
                  ? 'Developer mode enabled'
                  : 'Tap 5 times to reveal simulation tools'}
              </Text>
            </View>
          </View>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    paddingBottom: 100,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: 16,
  },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountName: {
    fontSize: 15,
    fontWeight: '700',
  },
  accountEmail: {
    fontSize: 12,
    marginTop: 2,
  },
  logoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    gap: 4,
  },
  logoutBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  sectionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  sectionDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1.5,
    marginVertical: 8,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  settingDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  smallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  infoLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  infoKey: {
    fontSize: 13,
    flex: 1,
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  infoValueWrap: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  infoValMono: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  rssiRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  meshBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  meshBadgeText: {
    fontSize: 12,
    fontWeight: '700',
  },
  devGrid: {
    gap: 8,
  },
  devToggleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    gap: 8,
  },
  devToggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  presetRow: {
    flexDirection: 'row',
    gap: 6,
  },
  presetBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },
  versionFooter: {
    paddingVertical: 20,
  },
  versionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  versionHint: {
    fontSize: 11,
    marginTop: 2,
  },
});
