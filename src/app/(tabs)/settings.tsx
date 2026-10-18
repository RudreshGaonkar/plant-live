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
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';
import { LocationCard } from '@/components/LocationCard';

export default function SettingsScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const updateLocation = useLiveDevice((s) => s.updateLocation);
  const updateSensors = useLiveDevice((s) => s.updateSensors);
  const setOnlineStatus = useLiveDevice((s) => s.setOnlineStatus);
  const refillBottle = useLiveDevice((s) => s.refillBottle);

  // Hidden developer panel unlock (5 taps on version label - spec section 7.8)
  const [tapCount, setTapCount] = useState<number>(0);
  const [devPanelOpen, setDevPanelOpen] = useState<boolean>(false);

  if (!device) return null;

  const { config, status } = device;
  const hasLdr = config.sensors.lightMode !== 'none';

  const handleVersionTap = () => {
    const nextCount = tapCount + 1;
    if (nextCount >= 5) {
      setDevPanelOpen(true);
      Alert.alert('Developer Mode Active', 'Simulator force overrides are now visible.');
      setTapCount(0);
    } else {
      setTapCount(nextCount);
    }
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

        {/* Plant Location Profiles */}
        <Text style={[styles.sectionHeading, { color: colors.text }]}>Plant Location Profile</Text>
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
          <Text style={[styles.cardTitle, { color: colors.text }]}>Sensors & Reservoir</Text>

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
              trackColor={{ false: '#D0D8D0', true: colors.palette.forest }}
              thumbColor="#FFFFFF"
            />
          </View>

          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.settingRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Reservoir Bottle</Text>
              <Text style={[styles.settingDesc, { color: colors.textMuted }]}>
                Capacity: {config.bottle.capacityMl} ml (Flow: {config.bottle.flowMlPerSec} ml/s)
              </Text>
            </View>
            <TouchableOpacity
              onPress={refillBottle}
              style={[styles.smallBtn, { backgroundColor: colors.palette.lime }]}
            >
              <Text style={styles.smallBtnText}>Refill 100%</Text>
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
          <Text style={[styles.cardTitle, { color: colors.text }]}>Device & Mesh Hub</Text>
          <View style={styles.infoLine}>
            <Text style={[styles.infoKey, { color: colors.textMuted }]}>Device ID</Text>
            <Text style={[styles.infoVal, { color: colors.text }]}>{device.id}</Text>
          </View>
          <View style={styles.infoLine}>
            <Text style={[styles.infoKey, { color: colors.textMuted }]}>Firmware Version</Text>
            <Text style={[styles.infoVal, { color: colors.text }]}>{status.firmware}</Text>
          </View>
          <View style={styles.infoLine}>
            <Text style={[styles.infoKey, { color: colors.textMuted }]}>Wi-Fi Signal (RSSI)</Text>
            <Text style={[styles.infoVal, { color: colors.text }]}>{device.telemetry.rssi} dBm</Text>
          </View>
          <View style={styles.infoLine}>
            <Text style={[styles.infoKey, { color: colors.textMuted }]}>Mesh Hub Topology</Text>
            <Text style={[styles.infoVal, { color: colors.palette.forest, fontWeight: '700' }]}>
              Hub-ready (Standby)
            </Text>
          </View>
        </View>

        {/* Developer Simulator Panel (Section 7.8) */}
        {devPanelOpen && (
          <View
            style={[
              styles.card,
              {
                backgroundColor: 'rgba(248, 215, 218, 0.4)',
                borderRadius: radii.card,
                borderColor: colors.palette.blush,
                padding: spacing.md,
              },
            ]}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Ionicons name="construct-outline" size={18} color={colors.palette.warningText} />
              <Text style={[styles.cardTitle, { color: colors.palette.warningText, marginBottom: 0 }]}>
                Hardware Simulator Tools
              </Text>
            </View>
            <Text style={[styles.settingDesc, { color: colors.textMuted, marginBottom: 10 }]}>
              Trigger live hardware events for testing without physical ESP8266:
            </Text>

            <View style={styles.devBtnRow}>
              <TouchableOpacity
                onPress={() => setOnlineStatus(!status.online)}
                style={[styles.devBtn, { backgroundColor: colors.palette.forest }]}
              >
                <Text style={styles.devBtnText}>
                  Toggle {status.online ? 'Offline' : 'Online'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => {
                  useLiveDevice.getState().updateTelemetry({ soilMoisture: 18 });
                  Alert.alert('Simulated', 'Moisture forced to 18% (Thirsty state)');
                }}
                style={[styles.devBtn, { backgroundColor: colors.palette.warningBorder }]}
              >
                <Text style={styles.devBtnText}>Force Thirsty</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Version Footer */}
        <TouchableOpacity activeOpacity={0.8} onPress={handleVersionTap} style={styles.versionFooter}>
          <Text style={[styles.versionText, { color: colors.textMuted }]}>
            LeafLink Mobile App v1.0.0 (Expo SDK 57)
          </Text>
          <Text style={[styles.versionHint, { color: colors.textMuted }]}>
            {devPanelOpen ? '● Developer mode enabled' : 'Tap 5 times to reveal simulation tools'}
          </Text>
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
    paddingBottom: 90,
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
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 10,
    marginBottom: 8,
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
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  settingLabel: {
    fontSize: 15,
    fontWeight: '700',
  },
  settingDesc: {
    fontSize: 12,
    marginTop: 2,
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  smallBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2A21',
  },
  infoLine: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  infoKey: {
    fontSize: 13,
  },
  infoVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  devBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  devBtn: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    borderRadius: 8,
  },
  devBtnText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '700',
  },
  versionFooter: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  versionText: {
    fontSize: 12,
    fontWeight: '600',
  },
  versionHint: {
    fontSize: 11,
    marginTop: 4,
  },
});
