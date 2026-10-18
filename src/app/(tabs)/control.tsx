import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';
import { usePlantState } from '@/hooks/usePlantState';
import { StatusChip } from '@/components';

export default function ControlScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const { device, health, isWatering, secondsLeft } = usePlantState();
  const triggerWaterNow = useLiveDevice((s) => s.triggerWaterNow);
  const toggleMode = useLiveDevice((s) => s.toggleMode);
  const refillBottle = useLiveDevice((s) => s.refillBottle);

  const [selectedDuration, setSelectedDuration] = useState<number>(5);

  if (!device) return null;

  const { config, telemetry } = device;
  const isAuto = config.mode === 'auto';
  const durationOptions = [3, 5, 10, 15];

  const handleWaterPress = () => {
    if (config.bottle.remainingMl <= 20) {
      Alert.alert(
        'Water Reservoir Low',
        'Estimated water bottle is nearly empty. Please refill before triggering pump.',
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'I Refilled', onPress: refillBottle },
        ]
      );
      return;
    }

    if (telemetry.soilMoisture > config.thresholds.moistureMax) {
      Alert.alert(
        'Soil Already Wet',
        `Current soil moisture is ${telemetry.soilMoisture}% (above recommended ${config.thresholds.moistureMax}%). Water anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Water Anyway', onPress: () => triggerWaterNow(selectedDuration) },
        ]
      );
      return;
    }

    triggerWaterNow(selectedDuration);
  };

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.screenTitle, { color: colors.text }]}>Manual Control</Text>
        <Text style={[styles.screenSubtitle, { color: colors.textMuted }]}>
          Safety limits: Max 15s pump runtime per command.
        </Text>

        {/* Mode Selector Card */}
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
          <View style={styles.cardHeaderRow}>
            <View>
              <Text style={[styles.cardTitle, { color: colors.text }]}>Operating Mode</Text>
              <Text style={[styles.cardDesc, { color: colors.textMuted }]}>
                {isAuto
                  ? 'Auto mode waters based on sensor thresholds & moisture checks.'
                  : 'Manual mode disables automatic watering. Device will only alert.'}
              </Text>
            </View>
            <StatusChip status={health} />
          </View>

          <View style={styles.toggleRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => isAuto || toggleMode()}
              style={[
                styles.toggleBtn,
                {
                  backgroundColor: isAuto ? colors.palette.forest : 'transparent',
                  borderRadius: radii.md,
                },
              ]}
            >
              <Ionicons
                name="flash"
                size={16}
                color={isAuto ? '#FFF' : colors.text}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.toggleText, { color: isAuto ? '#FFF' : colors.text }]}>
                Automatic
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => !isAuto || toggleMode()}
              style={[
                styles.toggleBtn,
                {
                  backgroundColor: !isAuto ? colors.palette.forest : 'transparent',
                  borderRadius: radii.md,
                },
              ]}
            >
              <Ionicons
                name="hand-left"
                size={16}
                color={!isAuto ? '#FFF' : colors.text}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.toggleText, { color: !isAuto ? '#FFF' : colors.text }]}>
                Manual
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Water Now Section */}
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
          <Text style={[styles.cardTitle, { color: colors.text }]}>Dispense Water</Text>
          <Text style={[styles.cardDesc, { color: colors.textMuted }]}>
            Select pump activation duration:
          </Text>

          {/* Duration Chips */}
          <View style={styles.durationRow}>
            {durationOptions.map((sec) => (
              <TouchableOpacity
                key={sec}
                activeOpacity={0.8}
                onPress={() => setSelectedDuration(sec)}
                style={[
                  styles.durationChip,
                  {
                    backgroundColor:
                      selectedDuration === sec
                        ? colors.palette.forest
                        : 'rgba(90, 138, 92, 0.1)',
                    borderColor:
                      selectedDuration === sec
                        ? colors.palette.forest
                        : colors.palette.sage,
                    borderRadius: radii.md,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.durationText,
                    {
                      color: selectedDuration === sec ? '#FFF' : colors.text,
                      fontWeight: selectedDuration === sec ? '800' : '600',
                    },
                  ]}
                >
                  {sec} sec
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Big Action Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleWaterPress}
            disabled={isWatering}
            style={[
              styles.waterNowBtn,
              {
                backgroundColor: isWatering ? colors.palette.sage : colors.palette.forest,
                borderRadius: radii.xl,
              },
            ]}
          >
            <Ionicons
              name={isWatering ? 'hourglass' : 'water'}
              size={20}
              color="#FFF"
              style={{ marginRight: 8 }}
            />
            <Text style={styles.waterNowBtnText}>
              {isWatering
                ? `Dispensing... (${secondsLeft}s)`
                : `Water Now (${selectedDuration}s)`}
            </Text>
          </TouchableOpacity>

          <View style={styles.estimateRow}>
            <Text style={[styles.estimateLabel, { color: colors.textMuted }]}>
              Estimated output: ~{selectedDuration * config.bottle.flowMlPerSec} ml
            </Text>
            <Text style={[styles.estimateLabel, { color: colors.textMuted }]}>
              Reservoir: {config.bottle.remainingMl} ml left
            </Text>
          </View>
        </View>

        {/* Command Lifecycle Status */}
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
          <Text style={[styles.cardTitle, { color: colors.text }]}>ESP8266 Command Stream</Text>
          <View style={styles.streamRow}>
            <View
              style={[
                styles.streamDot,
                {
                  backgroundColor: isWatering
                    ? colors.palette.forest
                    : colors.palette.mint,
                },
              ]}
            />
            <Text style={[styles.streamStatus, { color: colors.text }]}>
              {isWatering
                ? `Command ACK received: Relay Pin D6 Active`
                : 'Stream listening on /devices/' + device.id + '/command'}
            </Text>
          </View>
        </View>
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
  screenTitle: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
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
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 14,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 4,
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
    maxWidth: 240,
  },
  toggleRow: {
    flexDirection: 'row',
    backgroundColor: '#EDF2EC',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleText: {
    fontSize: 14,
    fontWeight: '700',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
    marginVertical: 14,
  },
  durationChip: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  durationText: {
    fontSize: 14,
  },
  waterNowBtn: {
    flexDirection: 'row',
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  waterNowBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  estimateLabel: {
    fontSize: 12,
  },
  streamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  streamDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  streamStatus: {
    fontSize: 13,
    fontWeight: '500',
  },
});
