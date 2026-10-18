import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Switch,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice, PlantLocation, DeviceRecord } from '@/store/useLiveDevice';
import { LocationCard } from '@/components/LocationCard';

export default function AddDeviceScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const addDevice = useLiveDevice((s) => s.addDevice);

  const [step, setStep] = useState<number>(1);
  const [plantName, setPlantName] = useState<string>('Terrace Tulsi Pot');
  const [plantSpecies, setPlantSpecies] = useState<string>('Holy Basil (Tulsi)');
  const [selectedLocation, setSelectedLocation] = useState<PlantLocation>('terrace');
  const [hasLightSensor, setHasLightSensor] = useState<boolean>(true);
  const [calibratedDry, setCalibratedDry] = useState<number>(1024);
  const [calibratedWet, setCalibratedWet] = useState<number>(400);
  const [bottleCapacity, setBottleCapacity] = useState<string>('500');

  const handleFinish = () => {
    const newId = `esp8266-${Date.now().toString().slice(-4)}`;
    const newRecord: DeviceRecord = {
      id: newId,
      config: {
        name: plantName,
        plantName,
        plantSpecies,
        location: selectedLocation,
        mode: 'auto',
        thresholds: {
          moistureMin: selectedLocation === 'indoor' ? 35 : selectedLocation === 'balcony' ? 30 : 25,
          moistureMax: selectedLocation === 'indoor' ? 65 : selectedLocation === 'balcony' ? 60 : 55,
          tempMax: 35,
          humidityMax: 80,
          pumpDurationSec: 5,
        },
        sensors: {
          lightMode: hasLightSensor ? 'digital' : 'none',
        },
        calibration: {
          soilDryRaw: calibratedDry,
          soilWetRaw: calibratedWet,
        },
        bottle: {
          capacityMl: parseInt(bottleCapacity, 10) || 500,
          flowMlPerSec: 15,
          remainingMl: parseInt(bottleCapacity, 10) || 500,
        },
        pairedAt: Date.now(),
      },
      telemetry: {
        soilRaw: 550,
        soilMoisture: 45,
        temperature: 27,
        humidity: 62,
        light: hasLightSensor ? 1 : null,
        pumpOn: false,
        rssi: -62,
        ts: Date.now(),
      },
      status: {
        online: true,
        lastSeen: Date.now(),
        firmware: 'v1.0.4-esp8266',
      },
    };

    addDevice(newRecord);
    Alert.alert('Device Paired!', `${plantName} has been configured and is ready to monitor.`, [
      { text: 'Go to Dashboard', onPress: () => router.replace('/(tabs)/home') },
    ]);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={styles.topNav}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Ionicons name="arrow-back" size={16} color={colors.palette.forest} />
              <Text style={[styles.backText, { color: colors.palette.forest }]}>Back</Text>
            </View>
          </TouchableOpacity>
          <Text style={[styles.stepIndicator, { color: colors.textMuted }]}>
            Step {step} of 3
          </Text>
        </View>

        <Text style={[styles.title, { color: colors.text }]}>Add Plant Companion</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Pair and calibrate your ESP8266 automated watering hardware.
        </Text>

        {/* STEP 1: Basic Info & Location */}
        {step === 1 && (
          <View>
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
              <Text style={[styles.label, { color: colors.text }]}>Plant Nickname</Text>
              <TextInput
                value={plantName}
                onChangeText={setPlantName}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                    borderRadius: radii.sm,
                  },
                ]}
                placeholder="e.g. Balcony Jasmine"
                placeholderTextColor={colors.textMuted}
              />

              <Text style={[styles.label, { color: colors.text, marginTop: 12 }]}>
                Species / Variety
              </Text>
              <TextInput
                value={plantSpecies}
                onChangeText={setPlantSpecies}
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                    borderRadius: radii.sm,
                  },
                ]}
                placeholder="e.g. Arabian Jasmine"
                placeholderTextColor={colors.textMuted}
              />
            </View>

            <Text style={[styles.sectionHeading, { color: colors.text }]}>
              Choose Plant Location:
            </Text>
            <LocationCard
              location="balcony"
              selected={selectedLocation === 'balcony'}
              onSelect={setSelectedLocation}
            />
            <LocationCard
              location="terrace"
              selected={selectedLocation === 'terrace'}
              onSelect={setSelectedLocation}
            />
            <LocationCard
              location="indoor"
              selected={selectedLocation === 'indoor'}
              onSelect={setSelectedLocation}
            />

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setStep(2)}
              style={[
                styles.nextBtn,
                { backgroundColor: colors.palette.forest, borderRadius: radii.xl },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={styles.nextBtnText}>Continue to Sensors</Text>
                <Ionicons name="arrow-forward" size={16} color="#FFF" />
              </View>
            </TouchableOpacity>
          </View>
        )}

        {/* STEP 2: Sensor Configuration */}
        {step === 2 && (
          <View>
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
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.cardHeading, { color: colors.text }]}>
                    Sunlight Sensor (LDR)
                  </Text>
                  <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                    Did you wire the LDR light sensor to ESP8266 GPIO13 (Pin D7)?
                  </Text>
                </View>
                <Switch
                  value={hasLightSensor}
                  onValueChange={setHasLightSensor}
                  trackColor={{ false: '#D0D8D0', true: colors.palette.forest }}
                  thumbColor="#FFFFFF"
                />
              </View>
            </View>

            {/* Calibration Wizard Section */}
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
              <Text style={[styles.cardHeading, { color: colors.text }]}>
                Soil Sensor Calibration (A0)
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                Calibrate ADC bounds for accurate 0–100% moisture reading.
              </Text>

              <View style={styles.calibItem}>
                <View>
                  <Text style={[styles.calibTitle, { color: colors.text }]}>1. Dry Point</Text>
                  <Text style={[styles.calibDesc, { color: colors.textMuted }]}>
                    Hold probe in dry air: raw = {calibratedDry}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setCalibratedDry(1024)}
                  style={[styles.calibBtn, { backgroundColor: colors.palette.lime }]}
                >
                  <Text style={styles.calibBtnText}>Capture Dry</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.calibItem}>
                <View>
                  <Text style={[styles.calibTitle, { color: colors.text }]}>2. Wet Point</Text>
                  <Text style={[styles.calibDesc, { color: colors.textMuted }]}>
                    Submerge probe in water: raw = {calibratedWet}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setCalibratedWet(380)}
                  style={[styles.calibBtn, { backgroundColor: colors.palette.mint }]}
                >
                  <Text style={styles.calibBtnText}>Capture Wet</Text>
                </TouchableOpacity>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={() => setStep(1)}
                style={[styles.backStepBtn, { borderRadius: radii.xl }]}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setStep(3)}
                style={[
                  styles.nextStepBtn,
                  { backgroundColor: colors.palette.forest, borderRadius: radii.xl },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.nextBtnText}>Continue to Bottle</Text>
                  <Ionicons name="arrow-forward" size={16} color="#FFF" />
                </View>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* STEP 3: Bottle Reservoir Setup */}
        {step === 3 && (
          <View>
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
              <Text style={[styles.cardHeading, { color: colors.text }]}>
                Reservoir Bottle Capacity
              </Text>
              <Text style={[styles.cardSubtitle, { color: colors.textMuted }]}>
                Standard plastic bottle attached to submersible mini pump:
              </Text>

              <TextInput
                value={bottleCapacity}
                onChangeText={setBottleCapacity}
                keyboardType="numeric"
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    borderColor: colors.border,
                    color: colors.text,
                    borderRadius: radii.sm,
                    fontSize: 18,
                    fontWeight: '700',
                  },
                ]}
                placeholder="500"
              />
              <Text style={[styles.helper, { color: colors.textMuted }]}>
                Default: 500 ml (~10–12 pump cycles)
              </Text>
            </View>

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
              <Text style={[styles.cardHeading, { color: colors.text }]}>Hardware Summary</Text>
              <View style={styles.summaryItem}>
                <Ionicons name="location-outline" size={15} color={colors.palette.forest} />
                <Text style={[styles.summaryLine, { color: colors.text }]}>
                  Location: {selectedLocation.toUpperCase()}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons name="sunny-outline" size={15} color={colors.palette.forest} />
                <Text style={[styles.summaryLine, { color: colors.text }]}>
                  Sunlight: {hasLightSensor ? 'Digital LDR Active' : 'Disabled'}
                </Text>
              </View>
              <View style={styles.summaryItem}>
                <Ionicons name="water-outline" size={15} color={colors.palette.forest} />
                <Text style={[styles.summaryLine, { color: colors.text }]}>
                  Auto Pump: 5s pulse per cycle
                </Text>
              </View>
            </View>

            <View style={styles.buttonRow}>
              <TouchableOpacity
                onPress={() => setStep(2)}
                style={[styles.backStepBtn, { borderRadius: radii.xl }]}
              >
                <Text style={{ color: colors.text, fontWeight: '600' }}>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleFinish}
                style={[
                  styles.nextStepBtn,
                  { backgroundColor: colors.palette.forest, borderRadius: radii.xl },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Ionicons name="checkmark-circle-outline" size={18} color="#FFF" />
                  <Text style={styles.nextBtnText}>Complete Setup</Text>
                </View>
              </TouchableOpacity>
            </View>
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
    marginBottom: 8,
  },
  backBtn: {
    paddingVertical: 6,
  },
  backText: {
    fontSize: 14,
    fontWeight: '700',
  },
  stepIndicator: {
    fontSize: 13,
    fontWeight: '600',
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.4,
  },
  subtitle: {
    fontSize: 13,
    marginTop: 2,
    marginBottom: 16,
  },
  card: {
    borderWidth: 1.5,
    marginVertical: 8,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  sectionHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginTop: 14,
    marginBottom: 6,
  },
  cardHeading: {
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 2,
  },
  cardSubtitle: {
    fontSize: 12,
    lineHeight: 16,
    marginTop: 2,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calibItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EDF2EC',
  },
  calibTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  calibDesc: {
    fontSize: 12,
  },
  calibBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  calibBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1F2A21',
  },
  helper: {
    fontSize: 11,
    marginTop: 6,
  },
  summaryItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginVertical: 3,
  },
  summaryLine: {
    fontSize: 13,
    fontWeight: '600',
  },
  nextBtn: {
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
  },
  nextBtnText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  backStepBtn: {
    flex: 1,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#E5EDE5',
  },
  nextStepBtn: {
    flex: 2,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
