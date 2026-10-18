/**
 * AddDeviceScreen
 * Comprehensive 5-step hardware onboarding and calibration wizard:
 * 1. Hardware Pairing (QR Scanner via expo-camera, manual entry, or demo device + online verification)
 * 2. Plant Details & Location (searchable plant species presets + Balcony/Terrace/Indoor threshold defaults)
 * 3. Sensor Setup & Guided Soil Calibration (LDR toggle + 2-step dry/wet ADC capture)
 * 4. Bottle Setup & 10s Pump Flow Test (capacity + measured flow rate calculation)
 * 5. Confirmation & 3D Plant Pop-In
 */
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { useAppTheme } from '@/theme';
import { useLiveDevice, PlantLocation, DeviceRecord } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import { LocationCard } from '@/components/LocationCard';
import { DeviceQRScanner } from '@/components/DeviceQRScanner';
import { CalibrationWizard, CalibrationValues } from '@/components/CalibrationWizard';
import { PlantScene3D } from '@/components/Plant3D/PlantScene3D';
import { updateDeviceConfigInRTDB } from '@/services/devices';

// Preset plant species
const SPECIES_PRESETS = [
  'Tulsi',
  'Hibiscus',
  'Money Plant',
  'Rose',
  'Succulent',
  'Fern',
  'Monstera',
  'Custom',
];

export default function AddDeviceScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const addDevice = useLiveDevice((s) => s.addDevice);
  const setActiveDeviceId = useSession((s) => s.setActiveDeviceId);
  const isDemoMode = useSession((s) => s.isDemoMode);

  // Wizard Step (1 through 5)
  const [step, setStep] = useState<number>(1);

  // STEP 1 State: Hardware Connection
  const [connectTab, setConnectTab] = useState<'qr' | 'manual' | 'demo'>('qr');
  const [deviceIdInput, setDeviceIdInput] = useState<string>('');
  const [isVerifyingOnline, setIsVerifyingOnline] = useState<boolean>(false);
  const [isDeviceOnline, setIsDeviceOnline] = useState<boolean>(false);

  // STEP 2 State: Plant Details & Location
  const [plantName, setPlantName] = useState<string>('Terrace Tulsi Pot');
  const [selectedSpecies, setSelectedSpecies] = useState<string>('Tulsi');
  const [customSpecies, setCustomSpecies] = useState<string>('');
  const [speciesSearch, setSpeciesSearch] = useState<string>('');
  const [selectedLocation, setSelectedLocation] = useState<PlantLocation>('terrace');

  // STEP 3 State: Sensors & Calibration
  const [hasLightSensor, setHasLightSensor] = useState<boolean>(true);
  const [calibration, setCalibration] = useState<CalibrationValues>({
    soilDryRaw: 1024,
    soilWetRaw: 400,
  });

  // STEP 4 State: Bottle & Pump Test
  const [bottleCapacity, setBottleCapacity] = useState<string>('500');
  const [isTestingPump, setIsTestingPump] = useState<boolean>(false);
  const [pumpTestCountdown, setPumpTestCountdown] = useState<number>(10);
  const [measuredMl, setMeasuredMl] = useState<string>('150');
  const [calculatedFlow, setCalculatedFlow] = useState<number>(15);

  // Pulse animation for waiting state
  const pulseScale = useSharedValue(1);
  useEffect(() => {
    if (isVerifyingOnline) {
      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.15, { duration: 600 }),
          withTiming(1.0, { duration: 600 })
        ),
        -1,
        true
      );
    }
  }, [isVerifyingOnline, pulseScale]);

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
  }));

  // When location changes, update default thresholds and suggested light sensor setting
  const handleLocationChange = (loc: PlantLocation) => {
    setSelectedLocation(loc);
    if (loc === 'indoor') {
      setHasLightSensor(false);
    } else {
      setHasLightSensor(true);
    }
  };

  // Step 1: Handle scanned or manual device ID
  const handleDeviceIdSelected = (id: string) => {
    setDeviceIdInput(id);
    setIsVerifyingOnline(true);

    // Simulate online handshake verification
    setTimeout(() => {
      setIsVerifyingOnline(false);
      setIsDeviceOnline(true);
    }, 1500);
  };

  const handleUseDemoDevice = () => {
    const demoId = `esp8266-demo-${Math.floor(1000 + Math.random() * 9000)}`;
    setDeviceIdInput(demoId);
    setIsVerifyingOnline(true);
    setTimeout(() => {
      setIsVerifyingOnline(false);
      setIsDeviceOnline(true);
    }, 800);
  };

  // Step 4: Run 10-second pump test
  const startPumpTest = () => {
    setIsTestingPump(true);
    setPumpTestCountdown(10);

    const interval = setInterval(() => {
      setPumpTestCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          setIsTestingPump(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const handleMeasuredMlChange = (val: string) => {
    setMeasuredMl(val);
    const num = parseFloat(val);
    if (!isNaN(num) && num > 0) {
      setCalculatedFlow(parseFloat((num / 10).toFixed(1)));
    }
  };

  // Finish Setup: Build final device record and commit
  const handleFinalFinish = async () => {
    const devId = deviceIdInput || `esp8266-${Date.now().toString().slice(-4)}`;
    const effectiveSpecies =
      selectedSpecies === 'Custom' ? customSpecies || 'Houseplant' : selectedSpecies;

    const thresholds = {
      indoor: { moistureMin: 35, moistureMax: 65, tempMax: 32, humidityMax: 75, pumpDurationSec: 5 },
      balcony: { moistureMin: 30, moistureMax: 60, tempMax: 35, humidityMax: 80, pumpDurationSec: 5 },
      terrace: { moistureMin: 25, moistureMax: 55, tempMax: 38, humidityMax: 85, pumpDurationSec: 5 },
    }[selectedLocation];

    const capacityNum = parseInt(bottleCapacity, 10) || 500;

    const newRecord: DeviceRecord = {
      id: devId,
      config: {
        name: plantName,
        plantName,
        plantSpecies: effectiveSpecies,
        location: selectedLocation,
        mode: 'auto',
        thresholds,
        sensors: {
          lightMode: hasLightSensor ? 'digital' : 'none',
        },
        calibration,
        bottle: {
          capacityMl: capacityNum,
          flowMlPerSec: calculatedFlow || 15,
          remainingMl: capacityNum,
        },
        pairedAt: Date.now(),
      },
      telemetry: {
        soilRaw: Math.round((calibration.soilDryRaw + calibration.soilWetRaw) / 2),
        soilMoisture: Math.round((thresholds.moistureMin + thresholds.moistureMax) / 2),
        temperature: 28,
        humidity: 60,
        light: hasLightSensor ? 1 : null,
        pumpOn: false,
        rssi: -58,
        ts: Date.now(),
      },
      status: {
        online: true,
        lastSeen: Date.now(),
        firmware: 'v1.0.4-esp8266',
      },
    };

    // Commit to local store
    addDevice(newRecord);
    setActiveDeviceId(devId);

    // Sync to RTDB if not in demo mode
    if (!isDemoMode) {
      try {
        await updateDeviceConfigInRTDB(devId, newRecord.config);
      } catch {
        // Fallback silently if offline
      }
    }

    Alert.alert('Plant Ready!', `${plantName} has been paired and calibrated successfully.`, [
      {
        text: 'Open Dashboard',
        onPress: () => router.replace('/(tabs)/home'),
      },
    ]);
  };

  // Filtered plant species presets
  const filteredSpecies = useMemo(
    () =>
      SPECIES_PRESETS.filter((s) =>
        s.toLowerCase().includes(speciesSearch.toLowerCase())
      ),
    [speciesSearch]
  );

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Top Header */}
        <View style={styles.topNav}>
          <TouchableOpacity
            onPress={() => {
              if (step > 1) {
                setStep(step - 1);
              } else {
                router.back();
              }
            }}
            style={styles.backBtn}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="arrow-back" size={16} color={colors.palette.forest} />
              <Text style={[styles.backText, { color: colors.palette.forest }]}>
                {step > 1 ? 'Previous' : 'Cancel'}
              </Text>
            </View>
          </TouchableOpacity>

          {/* Step Progress Pill */}
          <View style={[styles.stepPill, { backgroundColor: colors.palette.lime, borderRadius: radii.full }]}>
            <Text style={[styles.stepPillText, { color: colors.palette.forest }]}>
              Step {step} of 5
            </Text>
          </View>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Add Plant Companion</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          {step === 1 && 'Pair your ESP8266 automated watering hardware.'}
          {step === 2 && 'Personalize your plant profile and growing location.'}
          {step === 3 && 'Calibrate moisture sensor for accurate threshold tracking.'}
          {step === 4 && 'Configure water reservoir and measure pump flow rate.'}
          {step === 5 && 'Setup complete! Your plant companion is ready.'}
        </Text>

        {/* STEP 1: Connect Hardware */}
        {step === 1 && (
          <View>
            {/* Sub-tab Switcher */}
            <View style={[styles.tabBar, { backgroundColor: colors.palette.mist, borderRadius: radii.md }]}>
              <TouchableOpacity
                onPress={() => setConnectTab('qr')}
                style={[
                  styles.tabItem,
                  {
                    backgroundColor: connectTab === 'qr' ? colors.palette.forest : 'transparent',
                    borderRadius: radii.md - 2,
                  },
                ]}
              >
                <Ionicons
                  name="qr-code-outline"
                  size={14}
                  color={connectTab === 'qr' ? colors.palette.white : colors.palette.sage}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.tabText, { color: connectTab === 'qr' ? colors.palette.white : colors.text }]}>
                  Scan QR
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setConnectTab('manual')}
                style={[
                  styles.tabItem,
                  {
                    backgroundColor: connectTab === 'manual' ? colors.palette.forest : 'transparent',
                    borderRadius: radii.md - 2,
                  },
                ]}
              >
                <Ionicons
                  name="keypad-outline"
                  size={14}
                  color={connectTab === 'manual' ? colors.palette.white : colors.palette.sage}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.tabText, { color: connectTab === 'manual' ? colors.palette.white : colors.text }]}>
                  Enter ID
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setConnectTab('demo')}
                style={[
                  styles.tabItem,
                  {
                    backgroundColor: connectTab === 'demo' ? colors.palette.forest : 'transparent',
                    borderRadius: radii.md - 2,
                  },
                ]}
              >
                <Ionicons
                  name="flask-outline"
                  size={14}
                  color={connectTab === 'demo' ? colors.palette.white : colors.palette.sage}
                  style={{ marginRight: 4 }}
                />
                <Text style={[styles.tabText, { color: connectTab === 'demo' ? colors.palette.white : colors.text }]}>
                  Demo
                </Text>
              </TouchableOpacity>
            </View>

            {/* QR Scanner Mode */}
            {connectTab === 'qr' && (
              <DeviceQRScanner
                onScan={handleDeviceIdSelected}
                onManualInputPress={() => setConnectTab('manual')}
                onDemoPress={handleUseDemoDevice}
              />
            )}

            {/* Manual Input Mode */}
            {connectTab === 'manual' && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.card, borderColor: colors.border }]}>
                <Text style={[styles.label, { color: colors.text }]}>Device Serial ID</Text>
                <TextInput
                  style={[styles.input, { borderColor: colors.border, borderRadius: radii.md, color: colors.text }]}
                  placeholder="e.g. esp8266-9b4f"
                  placeholderTextColor={colors.textMuted}
                  value={deviceIdInput}
                  onChangeText={setDeviceIdInput}
                  autoCapitalize="none"
                />

                <TouchableOpacity
                  style={[
                    styles.primaryBtn,
                    {
                      backgroundColor: deviceIdInput.trim() ? colors.primary : colors.palette.sage,
                      borderRadius: radii.xl,
                    },
                  ]}
                  onPress={() => handleDeviceIdSelected(deviceIdInput.trim())}
                  disabled={!deviceIdInput.trim()}
                >
                  <Ionicons name="checkmark" size={18} color={colors.palette.white} style={{ marginRight: 6 }} />
                  <Text style={styles.primaryBtnText}>Connect Hardware</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Demo Device Mode */}
            {connectTab === 'demo' && (
              <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.card, borderColor: colors.border }]}>
                <View style={[styles.demoIconWrap, { backgroundColor: colors.palette.lime }]}>
                  <Ionicons name="hardware-chip-outline" size={32} color={colors.palette.forest} />
                </View>
                <Text style={[styles.cardTitleCenter, { color: colors.text }]}>Simulator Companion Node</Text>
                <Text style={[styles.cardSubtitleCenter, { color: colors.textMuted }]}>
                  No physical ESP8266 board needed. Runs complete telemetry, pump cycles, and environmental noise in client simulation.
                </Text>

                <TouchableOpacity
                  style={[styles.primaryBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.xl }]}
                  onPress={handleUseDemoDevice}
                >
                  <Ionicons name="play-outline" size={18} color={colors.palette.white} style={{ marginRight: 6 }} />
                  <Text style={styles.primaryBtnText}>Launch Simulator Device</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Waiting for Device Online State */}
            {isVerifyingOnline && (
              <Animated.View
                entering={FadeIn}
                exiting={FadeOut}
                style={[styles.waitingCard, { backgroundColor: colors.palette.lime, borderRadius: radii.card }]}
              >
                <Animated.View style={[styles.pulseIconWrap, { backgroundColor: colors.palette.mint }, pulseStyle]}>
                  <Ionicons name="wifi" size={28} color={colors.palette.forest} />
                </Animated.View>
                <Text style={[styles.waitingTitle, { color: colors.palette.ink }]}>
                  Waiting for device to come online...
                </Text>
                <Text style={[styles.waitingSubtitle, { color: colors.palette.forest }]}>
                  Handshaking with {deviceIdInput}...
                </Text>
                <ActivityIndicator color={colors.palette.forest} style={{ marginTop: 10 }} />
              </Animated.View>
            )}

            {/* Connected Confirmation Banner */}
            {isDeviceOnline && !isVerifyingOnline && (
              <View style={[styles.onlineConfirmCard, { backgroundColor: colors.palette.mint, borderRadius: radii.card }]}>
                <View style={styles.onlineConfirmRow}>
                  <Ionicons name="checkmark-circle" size={22} color={colors.palette.forest} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.onlineConfirmTitle, { color: colors.palette.forest }]}>
                      Device Connected & Online!
                    </Text>
                    <Text style={[styles.onlineConfirmSub, { color: colors.palette.ink }]}>
                      ID: {deviceIdInput}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  style={[styles.continueBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.xl }]}
                  onPress={() => setStep(2)}
                >
                  <Text style={styles.continueBtnText}>Continue to Plant Setup</Text>
                  <Ionicons name="arrow-forward" size={16} color={colors.palette.white} style={{ marginLeft: 6 }} />
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}

        {/* STEP 2: Plant Customization & Location Cards */}
        {step === 2 && (
          <View>
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.card, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.text }]}>Plant Name</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, borderRadius: radii.md, color: colors.text }]}
                value={plantName}
                onChangeText={setPlantName}
                placeholder="e.g. Balcony Tulsi"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.label, { color: colors.text, marginTop: 14 }]}>Species Preset</Text>
              <TextInput
                style={[styles.inputSm, { borderColor: colors.border, borderRadius: radii.md, color: colors.text }]}
                value={speciesSearch}
                onChangeText={setSpeciesSearch}
                placeholder="Search species presets..."
                placeholderTextColor={colors.textMuted}
              />

              {/* Species Chips */}
              <View style={styles.chipsRow}>
                {filteredSpecies.map((sp) => (
                  <TouchableOpacity
                    key={sp}
                    onPress={() => setSelectedSpecies(sp)}
                    style={[
                      styles.speciesChip,
                      {
                        backgroundColor: selectedSpecies === sp ? colors.palette.forest : colors.palette.mist,
                        borderRadius: radii.full,
                      },
                    ]}
                  >
                    <Ionicons
                      name="leaf"
                      size={12}
                      color={selectedSpecies === sp ? colors.palette.white : colors.palette.forest}
                    />
                    <Text
                      style={[
                        styles.speciesChipText,
                        { color: selectedSpecies === sp ? colors.palette.white : colors.palette.ink },
                      ]}
                    >
                      {sp}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {selectedSpecies === 'Custom' && (
                <View style={{ marginTop: 10 }}>
                  <Text style={[styles.subLabel, { color: colors.textMuted }]}>Enter Custom Species</Text>
                  <TextInput
                    style={[styles.input, { borderColor: colors.border, borderRadius: radii.md, color: colors.text }]}
                    value={customSpecies}
                    onChangeText={setCustomSpecies}
                    placeholder="e.g. Philodendron Birkin"
                    placeholderTextColor={colors.textMuted}
                  />
                </View>
              )}
            </View>

            {/* Location Selector (3 Large Cards) */}
            <Text style={[styles.sectionHeading, { color: colors.text }]}>Select Location Environment</Text>
            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
              Sets automatic moisture thresholds and sun exposure safeguards.
            </Text>

            <View style={styles.locationsWrap}>
              <LocationCard
                location="indoor"
                selected={selectedLocation === 'indoor'}
                onSelect={() => handleLocationChange('indoor')}
              />
              <LocationCard
                location="balcony"
                selected={selectedLocation === 'balcony'}
                onSelect={() => handleLocationChange('balcony')}
              />
              <LocationCard
                location="terrace"
                selected={selectedLocation === 'terrace'}
                onSelect={() => handleLocationChange('terrace')}
              />
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: radii.xl, marginTop: 10 }]}
              onPress={() => setStep(3)}
            >
              <Text style={styles.primaryBtnText}>Proceed to Sensor Calibration</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.palette.white} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 3: Sensor Setup & Calibration Wizard */}
        {step === 3 && (
          <View>
            {/* Light Sensor Question Card */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.card, borderColor: colors.border }]}>
              <View style={styles.switchRow}>
                <View style={{ flex: 1, marginRight: 12 }}>
                  <View style={styles.iconTitleRow}>
                    <Ionicons name="sunny-outline" size={18} color={colors.palette.forest} />
                    <Text style={[styles.cardTitle, { color: colors.text }]}>Light Sensor (LDR)</Text>
                  </View>
                  <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                    Did you fit the optional light-dependent resistor?
                  </Text>
                </View>
                <Switch
                  value={hasLightSensor}
                  onValueChange={setHasLightSensor}
                  trackColor={{ false: colors.border, true: colors.palette.forest }}
                  thumbColor={colors.palette.white}
                />
              </View>

              <View
                style={[
                  styles.sensorBadge,
                  {
                    backgroundColor: hasLightSensor ? colors.palette.lime : colors.palette.mist,
                    borderRadius: radii.sm,
                  },
                ]}
              >
                <Ionicons
                  name={hasLightSensor ? 'checkmark-circle-outline' : 'close-circle-outline'}
                  size={14}
                  color={colors.palette.forest}
                />
                <Text style={[styles.sensorBadgeText, { color: colors.palette.forest }]}>
                  {hasLightSensor
                    ? 'Sunlight metric tile will display live Bright / Dim status'
                    : 'Sunlight tile hidden (not fitted)'}
                </Text>
              </View>
            </View>

            {/* Guided Soil Sensor Calibration Wizard */}
            <Text style={[styles.sectionHeading, { color: colors.text }]}>Soil Moisture Calibration</Text>
            <Text style={[styles.sectionSub, { color: colors.textMuted }]}>
              Calibrates raw voltage levels for maximum accuracy across different soil types.
            </Text>

            <CalibrationWizard
              initialValues={calibration}
              onCalibrationComplete={(vals) => {
                setCalibration(vals);
                setStep(4);
              }}
              onSkip={() => setStep(4)}
            />
          </View>
        )}

        {/* STEP 4: Bottle Setup & 10s Pump Flow Rate Test */}
        {step === 4 && (
          <View>
            {/* Reservoir Capacity */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.card, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.text }]}>Water Bottle Capacity (ml)</Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, borderRadius: radii.md, color: colors.text }]}
                keyboardType="numeric"
                value={bottleCapacity}
                onChangeText={setBottleCapacity}
                placeholder="500"
                placeholderTextColor={colors.textMuted}
              />

              <View style={styles.chipsRow}>
                {['250', '500', '750', '1000'].map((cap) => (
                  <TouchableOpacity
                    key={cap}
                    onPress={() => setBottleCapacity(cap)}
                    style={[
                      styles.capChip,
                      {
                        backgroundColor: bottleCapacity === cap ? colors.palette.forest : colors.palette.mist,
                        borderRadius: radii.full,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.capChipText,
                        { color: bottleCapacity === cap ? colors.palette.white : colors.palette.ink },
                      ]}
                    >
                      {cap} ml
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Pump Flow Test Card */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.card, borderColor: colors.border }]}>
              <View style={styles.iconTitleRow}>
                <Ionicons name="speedometer-outline" size={18} color={colors.palette.forest} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Pump Flow Rate Calibration</Text>
              </View>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                {"Run a 10-second test into a measuring cup to determine your pump's flow speed."}
              </Text>

              {isTestingPump ? (
                <View style={[styles.pumpTestBox, { backgroundColor: colors.palette.lime, borderRadius: radii.md }]}>
                  <Ionicons name="water" size={32} color={colors.palette.forest} />
                  <Text style={[styles.testCountdownText, { color: colors.palette.ink }]}>
                    Running Test... {pumpTestCountdown}s
                  </Text>
                  <ActivityIndicator color={colors.palette.forest} style={{ marginTop: 6 }} />
                </View>
              ) : (
                <TouchableOpacity
                  style={[styles.testBtn, { backgroundColor: colors.palette.lime, borderRadius: radii.xl }]}
                  onPress={startPumpTest}
                >
                  <Ionicons name="play" size={16} color={colors.palette.forest} style={{ marginRight: 6 }} />
                  <Text style={[styles.testBtnText, { color: colors.palette.forest }]}>
                    Run 10s Pump Test
                  </Text>
                </TouchableOpacity>
              )}

              <Text style={[styles.label, { color: colors.text, marginTop: 14 }]}>
                Measured Volume Collected (ml)
              </Text>
              <TextInput
                style={[styles.input, { borderColor: colors.border, borderRadius: radii.md, color: colors.text }]}
                keyboardType="numeric"
                value={measuredMl}
                onChangeText={handleMeasuredMlChange}
                placeholder="150"
                placeholderTextColor={colors.textMuted}
              />

              <View style={[styles.flowDisplay, { backgroundColor: colors.palette.mist, borderRadius: radii.md }]}>
                <Text style={[styles.flowLabel, { color: colors.textMuted }]}>Calculated Flow Speed</Text>
                <Text style={[styles.flowVal, { color: colors.palette.forest }]}>
                  {calculatedFlow} ml/sec
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.primary, borderRadius: radii.xl, marginTop: 10 }]}
              onPress={() => setStep(5)}
            >
              <Text style={styles.primaryBtnText}>Review & Finish</Text>
              <Ionicons name="arrow-forward" size={16} color={colors.palette.white} style={{ marginLeft: 6 }} />
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 5: Confirmation & 3D Pop-In */}
        {step === 5 && (
          <View>
            {/* 3D Plant Pop-In Card */}
            <Animated.View
              entering={FadeIn.duration(400).springify().damping(12)}
              style={[
                styles.popInCard,
                {
                  backgroundColor: colors.palette.lime,
                  borderRadius: radii.card,
                  borderColor: colors.palette.forest,
                },
              ]}
            >
              <View style={styles.sceneContainer}>
                <PlantScene3D health="healthy" isWatering={false} />
              </View>
              <Text style={[styles.popInTitle, { color: colors.palette.ink }]}>{plantName}</Text>
              <Text style={[styles.popInSub, { color: colors.palette.forest }]}>
                {selectedSpecies} • {selectedLocation.toUpperCase()}
              </Text>
            </Animated.View>

            {/* Configuration Summary Table */}
            <View style={[styles.card, { backgroundColor: colors.surface, borderRadius: radii.card, borderColor: colors.border }]}>
              <Text style={[styles.summaryHeader, { color: colors.text }]}>Companion Specs</Text>

              <View style={styles.specRow}>
                <Text style={[styles.specKey, { color: colors.textMuted }]}>Device ID</Text>
                <Text style={[styles.specVal, { color: colors.text }]}>{deviceIdInput || 'esp8266-demo'}</Text>
              </View>
              <View style={styles.specDivider} />

              <View style={styles.specRow}>
                <Text style={[styles.specKey, { color: colors.textMuted }]}>Environment</Text>
                <Text style={[styles.specVal, { color: colors.palette.forest }]}>
                  {selectedLocation.toUpperCase()}
                </Text>
              </View>
              <View style={styles.specDivider} />

              <View style={styles.specRow}>
                <Text style={[styles.specKey, { color: colors.textMuted }]}>Light Tracking</Text>
                <Text style={[styles.specVal, { color: colors.text }]}>
                  {hasLightSensor ? 'Fitted (LDR)' : 'Disabled'}
                </Text>
              </View>
              <View style={styles.specDivider} />

              <View style={styles.specRow}>
                <Text style={[styles.specKey, { color: colors.textMuted }]}>Reservoir</Text>
                <Text style={[styles.specVal, { color: colors.text }]}>
                  {bottleCapacity} ml (~{Math.round(parseInt(bottleCapacity, 10) / (calculatedFlow * 5))} waterings)
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.xl, marginTop: 12 }]}
              onPress={handleFinalFinish}
            >
              <Ionicons name="checkmark-done" size={20} color={colors.palette.white} style={{ marginRight: 8 }} />
              <Text style={styles.primaryBtnText}>Finish Setup & Open Dashboard</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    paddingBottom: 40,
  },
  topNav: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  backBtn: {
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  backText: {
    fontSize: 14,
    fontWeight: '700',
  },
  stepPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  stepPillText: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  tabBar: {
    flexDirection: 'row',
    padding: 3,
    marginBottom: 14,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  tabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  card: {
    padding: 16,
    borderWidth: 1,
    marginBottom: 14,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  inputSm: {
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 7,
    fontSize: 13,
    marginBottom: 10,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 6,
  },
  speciesChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  speciesChipText: {
    fontSize: 11,
    fontWeight: '700',
  },
  sectionHeading: {
    fontSize: 15,
    fontWeight: '800',
    marginTop: 6,
    marginBottom: 2,
  },
  sectionSub: {
    fontSize: 12,
    marginBottom: 12,
  },
  locationsWrap: {
    gap: 10,
    marginBottom: 10,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  iconTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  cardTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  cardSubtitle: {
    fontSize: 12,
    lineHeight: 16,
  },
  sensorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 12,
  },
  sensorBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 4,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  capChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  capChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  testBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    marginTop: 12,
  },
  testBtnText: {
    fontSize: 13,
    fontWeight: '800',
  },
  pumpTestBox: {
    alignItems: 'center',
    padding: 16,
    marginTop: 12,
  },
  testCountdownText: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 6,
  },
  flowDisplay: {
    padding: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  flowLabel: {
    fontSize: 11,
    fontWeight: '600',
    marginBottom: 2,
  },
  flowVal: {
    fontSize: 20,
    fontWeight: '800',
  },
  // Waiting state
  waitingCard: {
    padding: 24,
    alignItems: 'center',
    marginVertical: 14,
  },
  pulseIconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  waitingTitle: {
    fontSize: 15,
    fontWeight: '800',
    marginBottom: 4,
  },
  waitingSubtitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  onlineConfirmCard: {
    padding: 16,
    marginVertical: 14,
  },
  onlineConfirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  onlineConfirmTitle: {
    fontSize: 14,
    fontWeight: '800',
  },
  onlineConfirmSub: {
    fontSize: 12,
    fontWeight: '600',
  },
  continueBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  continueBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
  // Demo mode
  demoIconWrap: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginBottom: 10,
  },
  cardTitleCenter: {
    fontSize: 15,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 4,
  },
  cardSubtitleCenter: {
    fontSize: 12,
    textAlign: 'center',
    lineHeight: 16,
    marginBottom: 14,
  },
  // Step 5 Pop-In
  popInCard: {
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    marginBottom: 16,
  },
  sceneContainer: {
    width: 200,
    height: 200,
  },
  popInTitle: {
    fontSize: 20,
    fontWeight: '800',
    marginTop: 6,
  },
  popInSub: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    marginTop: 2,
  },
  summaryHeader: {
    fontSize: 14,
    fontWeight: '800',
    marginBottom: 10,
  },
  specRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  specKey: {
    fontSize: 12,
    fontWeight: '600',
  },
  specVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  specDivider: {
    height: 1,
    backgroundColor: 'rgba(0,0,0,0.05)',
  },
});
