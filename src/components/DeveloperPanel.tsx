import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';
import { simulatedDevice, SimulatorScenario } from '@/services/simulator';
import { SliderControl } from './SliderControl';

interface DeveloperPanelProps {
  visible: boolean;
  onClose: () => void;
}

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

export function DeveloperPanel({ visible, onClose }: DeveloperPanelProps) {
  const { colors, radii } = useAppTheme();
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);

  // Local mirror states for sliders
  const [moisture, setMoisture] = useState<number>(device?.telemetry.soilMoisture ?? 45);
  const [temp, setTemp] = useState<number>(device?.telemetry.temperature ?? 28);
  const [humidity, setHumidity] = useState<number>(device?.telemetry.humidity ?? 65);
  const [bottle, setBottle] = useState<number>(device?.config.bottle.remainingMl ?? 380);
  const [activeScenario, setActiveScenario] = useState<SimulatorScenario>(
    simulatedDevice.overrides.activeScenario
  );

  // Sync slider positions when device changes or modal opens
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    if (visible && device) {
      setMoisture(simulatedDevice.overrides.forcedMoisture ?? device.telemetry.soilMoisture);
      setTemp(simulatedDevice.overrides.forcedTemp ?? device.telemetry.temperature);
      setHumidity(simulatedDevice.overrides.forcedHumidity ?? device.telemetry.humidity);
      setBottle(simulatedDevice.overrides.forcedBottleRemaining ?? device.config.bottle.remainingMl);
      setActiveScenario(simulatedDevice.overrides.activeScenario);
    }
  }, [visible, device]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const handleScenarioPress = (scenario: SimulatorScenario) => {
    if (activeScenario === scenario) {
      // Toggle off
      simulatedDevice.resetOverrides();
      setActiveScenario('none');
    } else {
      simulatedDevice.triggerScenario(scenario);
      setActiveScenario(scenario);
      if (device) {
        if (scenario === 'bottleEmpty') setBottle(0);
        if (scenario === 'heatWave') {
          setTemp(42);
          setHumidity(25);
        }
        if (scenario === 'soilDry') setMoisture(15);
        if (scenario === 'overwatered') {
          setMoisture(90);
          setHumidity(85);
        }
      }
    }
  };

  const handleMoistureChange = (val: number) => {
    setMoisture(val);
    setActiveScenario('none');
    simulatedDevice.setForcedMoisture(val);
  };

  const handleTempChange = (val: number) => {
    setTemp(val);
    setActiveScenario('none');
    simulatedDevice.setForcedTemp(val);
  };

  const handleHumidityChange = (val: number) => {
    setHumidity(val);
    setActiveScenario('none');
    simulatedDevice.setForcedHumidity(val);
  };

  const handleBottleChange = (val: number) => {
    setBottle(val);
    setActiveScenario('none');
    simulatedDevice.setForcedBottleRemaining(val);
  };

  const handleResetAll = () => {
    simulatedDevice.resetOverrides();
    setActiveScenario('none');
    if (device) {
      setMoisture(device.telemetry.soilMoisture);
      setTemp(device.telemetry.temperature);
      setHumidity(device.telemetry.humidity);
      setBottle(device.config.bottle.remainingMl);
    }
  };

  const capacity = device?.config.bottle.capacityMl ?? 500;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View
          style={[
            styles.modalSheet,
            {
              backgroundColor: colors.surface,
              borderTopLeftRadius: radii.hero,
              borderTopRightRadius: radii.hero,
            },
          ]}
        >
          {/* Header Row */}
          <View style={styles.headerRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.titleRow}>
                <Ionicons name="construct" size={18} color={colors.palette.warningText} />
                <Text style={[styles.headerTitle, { color: colors.palette.warningText }]}>
                  Developer Simulation Panel
                </Text>
              </View>
              <Text style={[styles.headerSubtitle, { color: colors.textMuted }]}>
                Spec §7.8: Force telemetry & test 3D states, alerts & offline sweeps
              </Text>
            </View>

            <TouchableOpacity
              onPress={onClose}
              style={[styles.closeBtn, { backgroundColor: colors.palette.mist }]}
              accessibilityLabel="Close developer panel"
            >
              <Ionicons name="close" size={20} color={colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            {/* ── Active Overrides Banner ──────────────────────── */}
            {activeScenario !== 'none' ||
            simulatedDevice.overrides.forcedMoisture !== null ||
            simulatedDevice.overrides.forcedTemp !== null ||
            simulatedDevice.overrides.forcedHumidity !== null ||
            simulatedDevice.overrides.forcedBottleRemaining !== null ? (
              <View
                style={[
                  styles.activeOverridesBanner,
                  {
                    backgroundColor: `${colors.palette.blush}60`,
                    borderColor: colors.palette.warningBorder,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[styles.overrideBannerTitle, { color: colors.palette.warningText }]}>
                    Active Simulator Overrides
                  </Text>
                  <Text style={[styles.overrideBannerDesc, { color: colors.palette.ink }]}>
                    {activeScenario !== 'none'
                      ? `Scenario: ${activeScenario}`
                      : 'Manual telemetry sliders active'}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={handleResetAll}
                  style={[
                    styles.resetBtnSmall,
                    {
                      backgroundColor: colors.palette.forest,
                      borderRadius: radii.sm,
                    },
                  ]}
                >
                  <Text style={styles.resetBtnSmallText}>Reset All</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {/* ── 1. One-Tap Scenario Preset Triggers ───────────── */}
            <Text style={[styles.sectionHeading, { color: colors.text }]}>
              One-Tap Scenario Triggers
            </Text>
            <Text style={[styles.sectionSubheading, { color: colors.textMuted }]}>
              Trigger instant alerts &amp; visual plant health changes
            </Text>

            <View style={styles.scenarioGrid}>
              {/* Bottle Empty */}
              <TouchableOpacity
                onPress={() => handleScenarioPress('bottleEmpty')}
                style={[
                  styles.scenarioTile,
                  {
                    backgroundColor:
                      activeScenario === 'bottleEmpty'
                        ? colors.palette.warningBorder
                        : colors.palette.mist,
                    borderColor: colors.palette.warningBorder,
                    borderRadius: radii.md,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="beaker-outline"
                  size={20}
                  color={
                    activeScenario === 'bottleEmpty'
                      ? colors.palette.white
                      : colors.palette.warningText
                  }
                />
                <Text
                  style={[
                    styles.scenarioTileTitle,
                    {
                      color:
                        activeScenario === 'bottleEmpty'
                          ? colors.palette.white
                          : colors.palette.warningText,
                    },
                  ]}
                >
                  Bottle Empty
                </Text>
                <Text
                  style={[
                    styles.scenarioTileSub,
                    {
                      color:
                        activeScenario === 'bottleEmpty'
                          ? colors.palette.white
                          : colors.textMuted,
                    },
                  ]}
                >
                  0 ml · Pump blocked
                </Text>
              </TouchableOpacity>

              {/* Heat Wave */}
              <TouchableOpacity
                onPress={() => handleScenarioPress('heatWave')}
                style={[
                  styles.scenarioTile,
                  {
                    backgroundColor:
                      activeScenario === 'heatWave'
                        ? '#D97706'
                        : colors.palette.mist,
                    borderColor: '#D97706',
                    borderRadius: radii.md,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="flame-outline"
                  size={20}
                  color={activeScenario === 'heatWave' ? colors.palette.white : '#D97706'}
                />
                <Text
                  style={[
                    styles.scenarioTileTitle,
                    {
                      color: activeScenario === 'heatWave' ? colors.palette.white : '#D97706',
                    },
                  ]}
                >
                  Heat Wave
                </Text>
                <Text
                  style={[
                    styles.scenarioTileSub,
                    {
                      color:
                        activeScenario === 'heatWave'
                          ? colors.palette.white
                          : colors.textMuted,
                    },
                  ]}
                >
                  42°C · Extreme Heat
                </Text>
              </TouchableOpacity>

              {/* Soil Dry */}
              <TouchableOpacity
                onPress={() => handleScenarioPress('soilDry')}
                style={[
                  styles.scenarioTile,
                  {
                    backgroundColor:
                      activeScenario === 'soilDry'
                        ? colors.palette.forest
                        : colors.palette.mist,
                    borderColor: colors.palette.forest,
                    borderRadius: radii.md,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="water-outline"
                  size={20}
                  color={activeScenario === 'soilDry' ? colors.palette.white : colors.palette.forest}
                />
                <Text
                  style={[
                    styles.scenarioTileTitle,
                    {
                      color:
                        activeScenario === 'soilDry'
                          ? colors.palette.white
                          : colors.palette.forest,
                    },
                  ]}
                >
                  Soil Dry
                </Text>
                <Text
                  style={[
                    styles.scenarioTileSub,
                    {
                      color:
                        activeScenario === 'soilDry'
                          ? colors.palette.white
                          : colors.textMuted,
                    },
                  ]}
                >
                  15% · Thirsty 3D state
                </Text>
              </TouchableOpacity>

              {/* Overwatered */}
              <TouchableOpacity
                onPress={() => handleScenarioPress('overwatered')}
                style={[
                  styles.scenarioTile,
                  {
                    backgroundColor:
                      activeScenario === 'overwatered'
                        ? '#2563EB'
                        : colors.palette.mist,
                    borderColor: '#2563EB',
                    borderRadius: radii.md,
                  },
                ]}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="rainy-outline"
                  size={20}
                  color={activeScenario === 'overwatered' ? colors.palette.white : '#2563EB'}
                />
                <Text
                  style={[
                    styles.scenarioTileTitle,
                    {
                      color:
                        activeScenario === 'overwatered'
                          ? colors.palette.white
                          : '#2563EB',
                    },
                  ]}
                >
                  Overwatered
                </Text>
                <Text
                  style={[
                    styles.scenarioTileSub,
                    {
                      color:
                        activeScenario === 'overwatered'
                          ? colors.palette.white
                          : colors.textMuted,
                    },
                  ]}
                >
                  90% · Too Wet Yellow
                </Text>
              </TouchableOpacity>

              {/* Device Offline */}
              <TouchableOpacity
                onPress={() => handleScenarioPress('forceOffline')}
                style={[
                  styles.scenarioTile,
                  {
                    backgroundColor:
                      activeScenario === 'forceOffline'
                        ? colors.palette.critical
                        : colors.palette.mist,
                    borderColor: colors.palette.critical,
                    borderRadius: radii.md,
                    width: '100%',
                  },
                ]}
                activeOpacity={0.8}
              >
                <Ionicons
                  name="cloud-offline-outline"
                  size={20}
                  color={activeScenario === 'forceOffline' ? colors.palette.white : colors.palette.critical}
                />
                <Text
                  style={[
                    styles.scenarioTileTitle,
                    {
                      color:
                        activeScenario === 'forceOffline'
                          ? colors.palette.white
                          : colors.palette.critical,
                    },
                  ]}
                >
                  {activeScenario === 'forceOffline' ? 'Forced Offline (Active)' : 'Device Offline'}
                </Text>
                <Text
                  style={[
                    styles.scenarioTileSub,
                    {
                      color:
                        activeScenario === 'forceOffline'
                          ? colors.palette.white
                          : colors.textMuted,
                    },
                  ]}
                >
                  Last seen &gt; 3 min ago · Grey canvas &amp; critical offline alert
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── 2. Manual Telemetry Sliders ─────────────────── */}
            <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 20 }]}>
              Manual Telemetry Sliders
            </Text>
            <Text style={[styles.sectionSubheading, { color: colors.textMuted }]}>
              Fine-tune live sensor readings on demand
            </Text>

            {/* Soil Moisture Slider */}
            <SliderControl
              label="Soil Moisture %"
              description="Calibrated analog soil moisture percentage"
              value={moisture}
              min={0}
              max={100}
              step={1}
              unit="%"
              accentColor={colors.palette.forest}
              onChange={handleMoistureChange}
            />

            <View style={[styles.divider, { backgroundColor: colors.palette.mist }]} />

            {/* Temperature Slider */}
            <SliderControl
              label="Temperature °C"
              description="DHT11 ambient thermal reading"
              value={temp}
              min={0}
              max={50}
              step={1}
              unit="°C"
              accentColor="#E28743"
              onChange={handleTempChange}
            />

            <View style={[styles.divider, { backgroundColor: colors.palette.mist }]} />

            {/* Humidity Slider */}
            <SliderControl
              label="Air Humidity %"
              description="DHT11 ambient relative humidity"
              value={humidity}
              min={0}
              max={100}
              step={1}
              unit="%"
              accentColor="#4A90E2"
              onChange={handleHumidityChange}
            />

            <View style={[styles.divider, { backgroundColor: colors.palette.mist }]} />

            {/* Bottle Reservoir Level Slider */}
            <SliderControl
              label="Reservoir Water Level (ml)"
              description={`Estimated bottle level (Capacity: ${capacity}ml)`}
              value={bottle}
              min={0}
              max={capacity}
              step={25}
              unit=" ml"
              accentColor={colors.palette.forest}
              onChange={handleBottleChange}
            />

            {/* ── 3. Quick Health State Presets ───────────────── */}
            <Text style={[styles.sectionHeading, { color: colors.text, marginTop: 18 }]}>
              Plant Health State Presets
            </Text>

            <View style={styles.presetsRow}>
              <TouchableOpacity
                onPress={() => handleMoistureChange(18)}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: colors.palette.blush,
                    borderColor: colors.palette.warningBorder,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <Ionicons name="alert" size={14} color={colors.palette.warningText} />
                <Text style={[styles.presetChipText, { color: colors.palette.warningText }]}>
                  Thirsty (18%)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleMoistureChange(48)}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: colors.palette.mint,
                    borderColor: colors.palette.forest,
                    borderRadius: radii.full,
                  },
                ]}
              >
                <Ionicons name="checkmark-circle" size={14} color={colors.palette.forest} />
                <Text style={[styles.presetChipText, { color: colors.palette.forest }]}>
                  Healthy (48%)
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleMoistureChange(88)}
                style={[
                  styles.presetChip,
                  {
                    backgroundColor: '#E0E7FF',
                    borderColor: '#4338CA',
                    borderRadius: radii.full,
                  },
                ]}
              >
                <Ionicons name="water" size={14} color="#4338CA" />
                <Text style={[styles.presetChipText, { color: '#4338CA' }]}>
                  Overwatered (88%)
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Clear All Button ───────────────────────────── */}
            <TouchableOpacity
              onPress={handleResetAll}
              style={[
                styles.resetBtnFull,
                {
                  borderColor: colors.border,
                  backgroundColor: colors.palette.mist,
                  borderRadius: radii.card,
                },
              ]}
            >
              <Ionicons name="refresh-outline" size={18} color={colors.palette.forest} />
              <Text style={[styles.resetBtnFullText, { color: colors.palette.forest }]}>
                Restore Natural Simulation Curves
              </Text>
            </TouchableOpacity>

            <View style={{ height: 40 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    maxHeight: SCREEN_HEIGHT * 0.88,
    paddingTop: 20,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  scrollContent: {
    paddingBottom: 24,
  },
  activeOverridesBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  overrideBannerTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  overrideBannerDesc: {
    fontSize: 11,
    marginTop: 2,
  },
  resetBtnSmall: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  resetBtnSmallText: {
    color: '#FFF',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  sectionSubheading: {
    fontSize: 11,
    marginTop: 2,
    marginBottom: 12,
  },
  scenarioGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginBottom: 8,
  },
  scenarioTile: {
    width: '48%',
    padding: 12,
    borderWidth: 1.5,
    gap: 4,
  },
  scenarioTileTitle: {
    fontSize: 13,
    fontWeight: '700',
    marginTop: 2,
  },
  scenarioTileSub: {
    fontSize: 10,
    fontWeight: '500',
  },
  divider: {
    height: 1,
    marginVertical: 12,
  },
  presetsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 20,
    marginTop: 4,
  },
  presetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1,
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  resetBtnFull: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderWidth: 1.5,
    marginTop: 8,
  },
  resetBtnFullText: {
    fontSize: 13,
    fontWeight: '700',
  },
});
