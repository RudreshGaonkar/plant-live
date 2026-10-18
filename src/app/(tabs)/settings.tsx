/**
 * Settings Screen – "Plant Passport"
 * uiLayout.md Section 8 and spec.md Section 7.8
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice, PlantLocation, LightMode } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import { simulatedDevice } from '@/services/simulator';
import {
  PlantPassportHeader,
  SliderControl,
  CalibrationWizard,
  CalibrationValues,
} from '@/components';

export default function SettingsScreen() {
  const { colors, radii, spacing, shadow } = useAppTheme();
  const { user, isDemoMode, signOut } = useSession();

  // Store bindings
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const updateThresholds = useLiveDevice((s) => s.updateThresholds);
  const updateSensors = useLiveDevice((s) => s.updateSensors);
  const updateConfig = useLiveDevice((s) => s.updateConfig);
  const updateCalibration = useLiveDevice((s) => s.updateCalibration);
  const updateLocation = useLiveDevice((s) => s.updateLocation);
  const refillBottle = useLiveDevice((s) => s.refillBottle);
  const updateTelemetry = useLiveDevice((s) => s.updateTelemetry);
  const setOnlineStatus = useLiveDevice((s) => s.setOnlineStatus);
  const removeDevice = useLiveDevice((s) => s.removeDevice);

  // Hidden developer panel unlock (5 taps on version label - spec section 7.8)
  const [tapCount, setTapCount] = useState<number>(0);
  const [devPanelOpen, setDevPanelOpen] = useState<boolean>(false);

  // Calibration Wizard modal state
  const [calibrationModalOpen, setCalibrationModalOpen] = useState<boolean>(false);

  // App & Alert Preferences
  const [tempUnit, setTempUnit] = useState<'C' | 'F'>('C');
  const [selectedTheme, setSelectedTheme] = useState<'Light' | 'Dark' | 'System'>('Light');
  const [quietHoursEnabled, setQuietHoursEnabled] = useState<boolean>(false);
  const [quietHoursRange, setQuietHoursRange] = useState<string>('22:00 - 07:00');

  // Alert Category Toggles
  const [alerts, setAlerts] = useState({
    bottle: true,
    dry: true,
    wet: true,
    heat: true,
    offline: true,
  });

  // Developer panel override states
  const [devMoisture, setDevMoisture] = useState<number>(device?.telemetry.soilMoisture ?? 42);
  const [devTemp, setDevTemp] = useState<number>(device?.telemetry.temperature ?? 28);
  const [devHumidity, setDevHumidity] = useState<number>(device?.telemetry.humidity ?? 65);
  const [devBottle, setDevBottle] = useState<number>(device?.config.bottle.remainingMl ?? 380);
  const [isForcedOffline, setIsForcedOffline] = useState<boolean>(false);
  const [isBottleEmptyScenario, setIsBottleEmptyScenario] = useState<boolean>(false);
  const [isHeatWaveScenario, setIsHeatWaveScenario] = useState<boolean>(false);

  if (!device) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.emptyContainer}>
          <Ionicons name="leaf-outline" size={48} color={colors.palette.sage} />
          <Text style={[styles.emptyTitle, { color: colors.text }]}>No Active Plant Device</Text>
          <TouchableOpacity
            onPress={() => router.push('/add-device' as any)}
            style={[styles.primaryBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.md }]}
          >
            <Ionicons name="add" size={18} color={colors.palette.white} />
            <Text style={[styles.primaryBtnText, { color: colors.palette.white }]}>Add Device</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  const { config, status, telemetry } = device;

  // 5-Tap Gesture on version label (Spec Section 7.8)
  const handleVersionTap = () => {
    const nextCount = tapCount + 1;
    if (nextCount >= 5) {
      setDevPanelOpen(true);
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

  const handleRemoveDevice = () => {
    Alert.alert(
      'Remove Device',
      `Are you sure you want to unpair "${config.name || 'this device'}"? All local cached telemetry will be disconnected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: () => {
            removeDevice(device.id);
            Alert.alert('Device Removed', 'Device unpaired successfully.');
          },
        },
      ]
    );
  };

  const handleCalibrationComplete = (values: CalibrationValues) => {
    updateCalibration(values);
    setCalibrationModalOpen(false);
    Alert.alert(
      'Calibration Saved',
      `Soil sensor calibrated!\nDry Air Raw: ${values.soilDryRaw}\nWet Water Raw: ${values.soilWetRaw}`
    );
  };

  // Developer panel slider handlers
  const handleForceMoisture = (val: number) => {
    setDevMoisture(val);
    simulatedDevice.overrides.forcedMoisture = val;
    updateTelemetry({ soilMoisture: val });
  };

  const handleForceTemp = (val: number) => {
    setDevTemp(val);
    simulatedDevice.overrides.forcedTemp = val;
    updateTelemetry({ temperature: val });
  };

  const handleForceHumidity = (val: number) => {
    setDevHumidity(val);
    simulatedDevice.overrides.forcedHumidity = val;
    updateTelemetry({ humidity: val });
  };

  const handleForceBottle = (val: number) => {
    setDevBottle(val);
    simulatedDevice.overrides.forcedBottleRemaining = val;
    updateConfig({
      bottle: {
        ...config.bottle,
        remainingMl: val,
      },
    });
  };

  // Scenario Triggers
  const handleTriggerBottleEmpty = () => {
    const next = !isBottleEmptyScenario;
    setIsBottleEmptyScenario(next);
    simulatedDevice.overrides.bottleEmptyTrigger = next;
    if (next) {
      handleForceBottle(0);
    } else {
      handleForceBottle(config.bottle.capacityMl);
    }
  };

  const handleTriggerHeatWave = () => {
    const next = !isHeatWaveScenario;
    setIsHeatWaveScenario(next);
    simulatedDevice.overrides.heatWaveTrigger = next;
    if (next) {
      handleForceTemp(38);
      handleForceHumidity(30);
    } else {
      simulatedDevice.overrides.forcedTemp = null;
      simulatedDevice.overrides.forcedHumidity = null;
    }
  };

  const handleTriggerOffline = () => {
    const next = !isForcedOffline;
    setIsForcedOffline(next);
    simulatedDevice.overrides.forceOffline = next;
    setOnlineStatus(!next);
  };

  const handleResetDevOverrides = () => {
    simulatedDevice.overrides.forcedMoisture = null;
    simulatedDevice.overrides.forcedTemp = null;
    simulatedDevice.overrides.forcedHumidity = null;
    simulatedDevice.overrides.forcedBottleRemaining = null;
    simulatedDevice.overrides.forceOffline = false;
    simulatedDevice.overrides.bottleEmptyTrigger = false;
    simulatedDevice.overrides.heatWaveTrigger = false;
    setIsForcedOffline(false);
    setIsBottleEmptyScenario(false);
    setIsHeatWaveScenario(false);
    setOnlineStatus(true);
    Alert.alert('Overrides Cleared', 'Simulator is now running on natural telemetry curves.');
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Page Title & Subtitle */}
        <View style={styles.headerTitleWrap}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Settings</Text>
          <Text style={[styles.screenSubtitle, { color: colors.textMuted }]}>
            Device hardware, plant passport & thresholds
          </Text>
        </View>

        {/* 1. PLANT PASSPORT HEADER CARD (uiLayout.md §8) */}
        <PlantPassportHeader
          config={config}
          status={status}
          telemetry={telemetry}
        />

        {/* 2. GROUPED SETTINGS SECTION CARDS */}

        {/* --- SECTION A: WATERING --- */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconPill, { backgroundColor: colors.palette.mint }]}>
              <Ionicons name="water-outline" size={18} color={colors.palette.forest} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Watering</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                Soil moisture bounds & cycle duration
              </Text>
            </View>
          </View>

          {/* Moisture Min Slider */}
          <SliderControl
            label="Moisture Threshold Min"
            description="Triggers auto-watering when soil drops below this %"
            value={config.thresholds.moistureMin}
            min={10}
            max={50}
            step={5}
            unit="%"
            accentColor={colors.palette.warningBorder}
            onChange={(val) => updateThresholds({ moistureMin: val })}
          />

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Moisture Max Slider */}
          <SliderControl
            label="Moisture Threshold Max"
            description="Target moisture saturation cap for irrigation"
            value={config.thresholds.moistureMax}
            min={50}
            max={90}
            step={5}
            unit="%"
            accentColor={colors.palette.forest}
            onChange={(val) => updateThresholds({ moistureMax: val })}
          />

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Pump Duration Slider */}
          <SliderControl
            label="Auto Pump Duration"
            description="Run-time per automatic irrigation cycle (max 15s)"
            value={config.thresholds.pumpDurationSec}
            min={1}
            max={15}
            step={1}
            unit="s"
            accentColor={colors.palette.sage}
            onChange={(val) => updateThresholds({ pumpDurationSec: val })}
          />
        </View>

        {/* --- SECTION B: SENSORS & RESERVOIR --- */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconPill, { backgroundColor: colors.palette.lime }]}>
              <Ionicons name="hardware-chip-outline" size={18} color={colors.palette.forest} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Sensors & Reservoir</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                Sunlight sensor, soil calibration & bottle
              </Text>
            </View>
          </View>

          {/* Light Sensor Mode */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1, paddingRight: 8 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Light Sensor (LDR)</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Sunlight telemetry tile mode ({config.sensors.lightMode})
              </Text>
            </View>
            <View style={styles.pillSelectorRow}>
              {(['none', 'digital', 'analog'] as LightMode[]).map((mode) => {
                const isSelected = config.sensors.lightMode === mode;
                return (
                  <TouchableOpacity
                    key={mode}
                    onPress={() => updateSensors({ lightMode: mode })}
                    style={[
                      styles.modePill,
                      {
                        backgroundColor: isSelected ? colors.palette.forest : colors.palette.mist,
                        borderColor: isSelected ? colors.palette.forest : colors.border,
                        borderRadius: radii.sm,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modePillText,
                        { color: isSelected ? colors.palette.white : colors.palette.ink },
                      ]}
                    >
                      {mode.charAt(0).toUpperCase() + mode.slice(1)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Soil Calibration Wizard Trigger */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Soil Sensor Calibration</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Dry: {config.calibration.soilDryRaw} | Wet: {config.calibration.soilWetRaw}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => setCalibrationModalOpen(true)}
              style={[
                styles.actionBtnOutline,
                { borderColor: colors.palette.forest, borderRadius: radii.sm },
              ]}
            >
              <Ionicons name="speedometer-outline" size={14} color={colors.palette.forest} />
              <Text style={[styles.actionBtnText, { color: colors.palette.forest }]}>
                Calibrate
              </Text>
            </TouchableOpacity>
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Reservoir Capacity & Flow Settings */}
          <SliderControl
            label="Bottle Capacity"
            description="Volume of reservoir attached to the plant"
            value={config.bottle.capacityMl}
            min={250}
            max={2000}
            step={50}
            unit=" ml"
            accentColor={colors.palette.forest}
            onChange={(val) =>
              updateConfig({
                bottle: {
                  ...config.bottle,
                  capacityMl: val,
                },
              })
            }
          />

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          <SliderControl
            label="Pump Flow Rate"
            description="Calibration flow rate measured during bottle pump test"
            value={config.bottle.flowMlPerSec}
            min={5}
            max={30}
            step={1}
            unit=" ml/s"
            accentColor={colors.palette.sage}
            onChange={(val) =>
              updateConfig({
                bottle: {
                  ...config.bottle,
                  flowMlPerSec: val,
                },
              })
            }
          />

          {/* Shortcut refill button */}
          <TouchableOpacity
            onPress={() => {
              refillBottle();
              Alert.alert('Reservoir Refilled', `Reset bottle level to ${config.bottle.capacityMl} ml.`);
            }}
            style={[
              styles.refillRowBtn,
              { backgroundColor: colors.palette.lime, borderRadius: radii.sm },
            ]}
          >
            <Ionicons name="refresh" size={14} color={colors.palette.forest} />
            <Text style={[styles.refillRowText, { color: colors.palette.forest }]}>
              Mark Bottle as Refilled ({config.bottle.remainingMl} / {config.bottle.capacityMl} ml)
            </Text>
          </TouchableOpacity>
        </View>

        {/* --- SECTION C: ALERTS & NOTIFICATIONS --- */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconPill, { backgroundColor: colors.palette.blush }]}>
              <Ionicons name="notifications-outline" size={18} color={colors.palette.warningText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Alerts & Notifications</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                Push alerts for thresholds & quiet hours
              </Text>
            </View>
          </View>

          {/* Bottle Low / Empty */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Reservoir Low / Empty</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Alert when bottle level drops below 20%
              </Text>
            </View>
            <Switch
              value={alerts.bottle}
              onValueChange={(val) => setAlerts((prev) => ({ ...prev, bottle: val }))}
              trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
              thumbColor={colors.palette.white}
            />
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Dry Soil */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Dry Soil Warning</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Alert if moisture stays under min threshold for 30m
              </Text>
            </View>
            <Switch
              value={alerts.dry}
              onValueChange={(val) => setAlerts((prev) => ({ ...prev, dry: val }))}
              trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
              thumbColor={colors.palette.white}
            />
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Overwatered Risk */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Over-watering Risk</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Alert if soil moisture exceeds max cap with high humidity
              </Text>
            </View>
            <Switch
              value={alerts.wet}
              onValueChange={(val) => setAlerts((prev) => ({ ...prev, wet: val }))}
              trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
              thumbColor={colors.palette.white}
            />
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Extreme Heat */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Extreme Heat & Weather</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Alert if temperature exceeds {config.thresholds.tempMax}°C
              </Text>
            </View>
            <Switch
              value={alerts.heat}
              onValueChange={(val) => setAlerts((prev) => ({ ...prev, heat: val }))}
              trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
              thumbColor={colors.palette.white}
            />
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Device Offline */}
          <View style={styles.toggleRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Device Offline</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Alert if no telemetry signal received for &gt; 3 mins
              </Text>
            </View>
            <Switch
              value={alerts.offline}
              onValueChange={(val) => setAlerts((prev) => ({ ...prev, offline: val }))}
              trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
              thumbColor={colors.palette.white}
            />
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Quiet Hours Picker */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Quiet Hours</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Silence audible notifications during night ({quietHoursRange})
              </Text>
            </View>
            <Switch
              value={quietHoursEnabled}
              onValueChange={setQuietHoursEnabled}
              trackColor={{ false: colors.palette.mist, true: colors.palette.forest }}
              thumbColor={colors.palette.white}
            />
          </View>
        </View>

        {/* --- SECTION D: APP PREFERENCES --- */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconPill, { backgroundColor: colors.palette.mist }]}>
              <Ionicons name="options-outline" size={18} color={colors.palette.forest} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>App Preferences</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                Units, appearance & account session
              </Text>
            </View>
          </View>

          {/* Temperature Unit Toggle */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>Temperature Unit</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Used on vitals sheet & weather chips
              </Text>
            </View>
            <View style={styles.unitToggleWrap}>
              <TouchableOpacity
                onPress={() => setTempUnit('C')}
                style={[
                  styles.unitBtn,
                  {
                    backgroundColor: tempUnit === 'C' ? colors.palette.forest : colors.palette.mist,
                    borderRadius: radii.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.unitBtnText,
                    { color: tempUnit === 'C' ? colors.palette.white : colors.text },
                  ]}
                >
                  °C
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setTempUnit('F')}
                style={[
                  styles.unitBtn,
                  {
                    backgroundColor: tempUnit === 'F' ? colors.palette.forest : colors.palette.mist,
                    borderRadius: radii.sm,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.unitBtnText,
                    { color: tempUnit === 'F' ? colors.palette.white : colors.text },
                  ]}
                >
                  °F
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* App Theme Selection */}
          <View style={styles.rowBetween}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.itemLabel, { color: colors.text }]}>App Theme</Text>
              <Text style={[styles.itemDesc, { color: colors.textMuted }]}>
                Organic botanical color theme
              </Text>
            </View>
            <View style={styles.pillSelectorRow}>
              {(['Light', 'Dark', 'System'] as const).map((th) => {
                const isSelected = selectedTheme === th;
                return (
                  <TouchableOpacity
                    key={th}
                    onPress={() => setSelectedTheme(th)}
                    style={[
                      styles.modePill,
                      {
                        backgroundColor: isSelected ? colors.palette.forest : colors.palette.mist,
                        borderColor: isSelected ? colors.palette.forest : colors.border,
                        borderRadius: radii.sm,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.modePillText,
                        { color: isSelected ? colors.palette.white : colors.palette.ink },
                      ]}
                    >
                      {th}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Sign Out Action */}
          <TouchableOpacity
            onPress={handleSignOut}
            style={[
              styles.signOutRow,
              { backgroundColor: colors.palette.blush, borderRadius: radii.sm },
            ]}
          >
            <Ionicons name="log-out-outline" size={16} color={colors.palette.warningText} />
            <Text style={[styles.signOutText, { color: colors.palette.warningText }]}>
              {isDemoMode ? 'Exit Demo Session' : 'Sign Out of Account'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* --- SECTION E: DEVICE & NETWORK --- */}
        <View
          style={[
            styles.card,
            {
              backgroundColor: colors.surface,
              borderRadius: radii.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.cardHeaderRow}>
            <View style={[styles.iconPill, { backgroundColor: colors.palette.mist }]}>
              <Ionicons name="wifi-outline" size={18} color={colors.palette.forest} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Device & Network</Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                Hardware pairing, credentials & removal
              </Text>
            </View>
          </View>

          {/* Device ID */}
          <View style={styles.rowBetween}>
            <Text style={[styles.itemLabel, { color: colors.textMuted }]}>Hardware ID</Text>
            <View
              style={[
                styles.monoBadge,
                { backgroundColor: colors.palette.mist, borderRadius: radii.sm },
              ]}
            >
              <Text style={[styles.monoText, { color: colors.palette.forest }]}>
                {device.id}
              </Text>
            </View>
          </View>

          <View style={[styles.cardDivider, { backgroundColor: colors.palette.mist }]} />

          {/* Action: Re-pair Device */}
          <TouchableOpacity
            onPress={() => router.push('/add-device' as any)}
            style={[
              styles.actionBtnOutlineFull,
              { borderColor: colors.palette.forest, borderRadius: radii.sm },
            ]}
          >
            <Ionicons name="sync-outline" size={16} color={colors.palette.forest} />
            <Text style={[styles.actionBtnText, { color: colors.palette.forest }]}>
              Re-pair Device / Wi-Fi Setup
            </Text>
          </TouchableOpacity>

          {/* Action: Remove Device */}
          <TouchableOpacity
            onPress={handleRemoveDevice}
            style={[
              styles.actionBtnOutlineFull,
              {
                borderColor: colors.palette.warningBorder,
                backgroundColor: 'rgba(248, 215, 218, 0.25)',
                borderRadius: radii.sm,
                marginTop: 8,
              },
            ]}
          >
            <Ionicons name="trash-outline" size={16} color={colors.palette.warningText} />
            <Text style={[styles.actionBtnText, { color: colors.palette.warningText }]}>
              Remove Device
            </Text>
          </TouchableOpacity>
        </View>

        {/* --- SECTION F: MESH MODE CARD --- */}
        <View
          style={[
            styles.meshCard,
            {
              backgroundColor: colors.palette.mist,
              borderColor: colors.palette.sage,
              borderRadius: radii.card,
            },
          ]}
        >
          <View style={styles.meshHeaderRow}>
            <Ionicons name="git-network-outline" size={20} color={colors.palette.forest} />
            <Text style={[styles.meshTitle, { color: colors.palette.forest }]}>
              Mesh Mode: Coming soon
            </Text>
          </View>
          <Text style={[styles.meshDesc, { color: colors.palette.ink }]}>
            ESP-NOW multi-node garden network. Connect multiple plant nodes through a single Wi-Fi hub without needing individual router connections.
          </Text>
        </View>

        {/* 3. HIDDEN DEVELOPER PANEL FOOTER (Spec Section 7.8) */}
        <TouchableOpacity
          activeOpacity={0.7}
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
              size={18}
              color={colors.palette.forest}
              style={{ marginRight: 8 }}
            />
            <View style={{ flex: 1 }}>
              <Text style={[styles.versionText, { color: colors.text }]}>
                LeafLink Mobile App v1.0.0 (Expo SDK 57)
              </Text>
              <Text style={[styles.versionHint, { color: colors.textMuted }]}>
                {devPanelOpen
                  ? 'Developer Mode Active • Simulator Tools Enabled'
                  : 'Tap 5 times to reveal hardware simulation panel'}
              </Text>
            </View>
            {tapCount > 0 && tapCount < 5 && (
              <View
                style={[
                  styles.tapCountBadge,
                  { backgroundColor: colors.palette.lime, borderRadius: radii.full },
                ]}
              >
                <Text style={[styles.tapCountText, { color: colors.palette.forest }]}>
                  {5 - tapCount}
                </Text>
              </View>
            )}
          </View>
        </TouchableOpacity>
      </ScrollView>

      {/* --- DEVELOPER PANEL MODAL (Spec Section 7.8) --- */}
      <Modal
        visible={devPanelOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setDevPanelOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.devModalSheet,
              {
                backgroundColor: colors.surface,
                borderTopLeftRadius: radii.hero,
                borderTopRightRadius: radii.hero,
              },
            ]}
          >
            {/* Modal Header */}
            <View style={styles.devModalHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.devHeaderTitleRow}>
                  <Ionicons name="construct" size={18} color={colors.palette.warningText} />
                  <Text style={[styles.devModalTitle, { color: colors.palette.warningText }]}>
                    Hardware Simulator Dev Panel
                  </Text>
                </View>
                <Text style={[styles.devModalSubtitle, { color: colors.textMuted }]}>
                  Spec §7.8: Force telemetry & test alert triggers
                </Text>
              </View>

              <TouchableOpacity
                onPress={() => setDevPanelOpen(false)}
                style={[styles.closeModalBtn, { backgroundColor: colors.palette.mist }]}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.devScrollContent}>
              {/* Scenario Quick Buttons */}
              <Text style={[styles.devSectionLabel, { color: colors.text }]}>
                Test State Scenarios
              </Text>

              <View style={styles.devScenariosRow}>
                {/* Bottle Empty Scenario */}
                <TouchableOpacity
                  onPress={handleTriggerBottleEmpty}
                  style={[
                    styles.scenarioBtn,
                    {
                      backgroundColor: isBottleEmptyScenario
                        ? colors.palette.warningBorder
                        : colors.palette.mist,
                      borderColor: colors.palette.warningBorder,
                      borderRadius: radii.sm,
                    },
                  ]}
                >
                  <Ionicons
                    name="beaker-outline"
                    size={16}
                    color={isBottleEmptyScenario ? colors.palette.white : colors.palette.warningText}
                  />
                  <Text
                    style={[
                      styles.scenarioBtnText,
                      {
                        color: isBottleEmptyScenario
                          ? colors.palette.white
                          : colors.palette.warningText,
                      },
                    ]}
                  >
                    {isBottleEmptyScenario ? 'Bottle Empty Active' : 'Bottle Empty'}
                  </Text>
                </TouchableOpacity>

                {/* Heat Wave Scenario */}
                <TouchableOpacity
                  onPress={handleTriggerHeatWave}
                  style={[
                    styles.scenarioBtn,
                    {
                      backgroundColor: isHeatWaveScenario
                        ? colors.palette.warningBorder
                        : colors.palette.mist,
                      borderColor: colors.palette.warningBorder,
                      borderRadius: radii.sm,
                    },
                  ]}
                >
                  <Ionicons
                    name="flame-outline"
                    size={16}
                    color={isHeatWaveScenario ? colors.palette.white : colors.palette.warningText}
                  />
                  <Text
                    style={[
                      styles.scenarioBtnText,
                      {
                        color: isHeatWaveScenario
                          ? colors.palette.white
                          : colors.palette.warningText,
                      },
                    ]}
                  >
                    {isHeatWaveScenario ? 'Heat Wave (38°C)' : 'Heat Wave'}
                  </Text>
                </TouchableOpacity>

                {/* Device Offline Scenario */}
                <TouchableOpacity
                  onPress={handleTriggerOffline}
                  style={[
                    styles.scenarioBtn,
                    {
                      backgroundColor: isForcedOffline
                        ? colors.palette.forest
                        : colors.palette.mist,
                      borderColor: colors.palette.forest,
                      borderRadius: radii.sm,
                    },
                  ]}
                >
                  <Ionicons
                    name="cloud-offline-outline"
                    size={16}
                    color={isForcedOffline ? colors.palette.white : colors.palette.forest}
                  />
                  <Text
                    style={[
                      styles.scenarioBtnText,
                      {
                        color: isForcedOffline
                          ? colors.palette.white
                          : colors.palette.forest,
                      },
                    ]}
                  >
                    {isForcedOffline ? 'Forced Offline' : 'Device Offline'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Sliders to Force Telemetry Values */}
              <Text style={[styles.devSectionLabel, { color: colors.text, marginTop: 16 }]}>
                Force Live Telemetry Sliders
              </Text>

              {/* Force Soil Moisture */}
              <SliderControl
                label="Soil Moisture"
                value={devMoisture}
                min={0}
                max={100}
                step={1}
                unit="%"
                accentColor={colors.palette.forest}
                onChange={handleForceMoisture}
              />

              {/* Force Temperature */}
              <SliderControl
                label="Temperature"
                value={devTemp}
                min={10}
                max={45}
                step={1}
                unit="°C"
                accentColor={colors.palette.warningBorder}
                onChange={handleForceTemp}
              />

              {/* Force Humidity */}
              <SliderControl
                label="Humidity"
                value={devHumidity}
                min={20}
                max={95}
                step={1}
                unit="%"
                accentColor={colors.palette.sage}
                onChange={handleForceHumidity}
              />

              {/* Force Bottle Level */}
              <SliderControl
                label="Reservoir Bottle Level"
                value={devBottle}
                min={0}
                max={config.bottle.capacityMl}
                step={25}
                unit=" ml"
                accentColor={colors.palette.forest}
                onChange={handleForceBottle}
              />

              {/* Quick Health State Presets */}
              <Text style={[styles.devSectionLabel, { color: colors.text, marginTop: 14 }]}>
                Quick Health State Presets
              </Text>

              <View style={styles.presetButtonsRow}>
                <TouchableOpacity
                  onPress={() => handleForceMoisture(18)}
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
                  onPress={() => handleForceMoisture(48)}
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
                  onPress={() => handleForceMoisture(85)}
                  style={[
                    styles.presetBtn,
                    { backgroundColor: colors.palette.blush, borderRadius: radii.sm },
                  ]}
                >
                  <Text style={[styles.presetBtnText, { color: colors.palette.warningText }]}>
                    Overwatered (85%)
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Clear / Reset Button */}
              <TouchableOpacity
                onPress={handleResetDevOverrides}
                style={[
                  styles.resetOverridesBtn,
                  { backgroundColor: colors.palette.mist, borderColor: colors.border, borderRadius: radii.sm },
                ]}
              >
                <Ionicons name="refresh-outline" size={16} color={colors.text} />
                <Text style={[styles.resetOverridesText, { color: colors.text }]}>
                  Reset All Overrides (Natural Curves)
                </Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* --- CALIBRATION WIZARD MODAL --- */}
      <Modal
        visible={calibrationModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setCalibrationModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.calibrationModalSheet,
              {
                backgroundColor: colors.surface,
                borderRadius: radii.hero,
              },
            ]}
          >
            <View style={styles.calModalHeader}>
              <Text style={[styles.calModalTitle, { color: colors.text }]}>
                Soil Sensor Calibration
              </Text>
              <TouchableOpacity
                onPress={() => setCalibrationModalOpen(false)}
                style={[styles.closeModalBtn, { backgroundColor: colors.palette.mist }]}
              >
                <Ionicons name="close" size={20} color={colors.text} />
              </TouchableOpacity>
            </View>

            <CalibrationWizard
              initialValues={config.calibration}
              onCalibrationComplete={handleCalibrationComplete}
              onSkip={() => setCalibrationModalOpen(false)}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    paddingBottom: 110,
  },
  headerTitleWrap: {
    marginBottom: 14,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.6,
  },
  screenSubtitle: {
    fontSize: 13,
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginTop: 12,
    marginBottom: 16,
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  primaryBtnText: {
    fontSize: 15,
    fontWeight: '700',
  },
  card: {
    borderWidth: 1.5,
    padding: 16,
    marginBottom: 14,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  iconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 1,
  },
  cardDivider: {
    height: 1,
    marginVertical: 12,
  },
  rowBetween: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  itemLabel: {
    fontSize: 14,
    fontWeight: '700',
  },
  itemDesc: {
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  pillSelectorRow: {
    flexDirection: 'row',
    gap: 6,
  },
  modePill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
  },
  modePillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1.5,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  actionBtnOutlineFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1.5,
    paddingVertical: 10,
    marginTop: 6,
  },
  actionBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  refillRowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 10,
  },
  refillRowText: {
    fontSize: 12,
    fontWeight: '700',
  },
  unitToggleWrap: {
    flexDirection: 'row',
    gap: 6,
  },
  unitBtn: {
    width: 36,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unitBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  signOutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    marginTop: 4,
  },
  signOutText: {
    fontSize: 13,
    fontWeight: '700',
  },
  monoBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  monoText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'monospace',
  },
  meshCard: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    padding: 16,
    marginBottom: 16,
  },
  meshHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  meshTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  meshDesc: {
    fontSize: 12,
    lineHeight: 18,
  },
  versionFooter: {
    marginVertical: 12,
  },
  versionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  versionText: {
    fontSize: 13,
    fontWeight: '700',
  },
  versionHint: {
    fontSize: 11,
    marginTop: 2,
  },
  tapCountBadge: {
    width: 22,
    height: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  tapCountText: {
    fontSize: 11,
    fontWeight: '800',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  devModalSheet: {
    maxHeight: '85%',
    paddingTop: 16,
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  devModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  devHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  devModalTitle: {
    fontSize: 17,
    fontWeight: '800',
  },
  devModalSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeModalBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  devScrollContent: {
    paddingBottom: 24,
  },
  devSectionLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
  },
  devScenariosRow: {
    flexDirection: 'row',
    gap: 8,
  },
  scenarioBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
  },
  scenarioBtnText: {
    fontSize: 11,
    fontWeight: '700',
    textAlign: 'center',
  },
  presetButtonsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    marginBottom: 16,
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
  resetOverridesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    paddingVertical: 12,
    marginTop: 6,
  },
  resetOverridesText: {
    fontSize: 13,
    fontWeight: '700',
  },
  calibrationModalSheet: {
    margin: 16,
    padding: 20,
    maxHeight: '90%',
  },
  calModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  calModalTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
});
