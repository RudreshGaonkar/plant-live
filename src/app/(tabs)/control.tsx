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
            <View style={{ flex: 1, marginRight: 8 }}>
              <View style={styles.cardTitleRow}>
                <Ionicons name="settings-outline" size={18} color={colors.palette.forest} />
                <Text style={[styles.cardTitle, { color: colors.text }]}>Operating Mode</Text>
              </View>
              <Text style={[styles.cardDesc, { color: colors.textMuted }]}>
                {isAuto
                  ? 'Auto mode waters based on sensor thresholds & moisture checks.'
                  : 'Manual mode disables automatic watering. Device will only alert.'}
              </Text>
            </View>
            <StatusChip status={health} />
          </View>

          <View style={[styles.toggleRow, { backgroundColor: colors.palette.mist, borderRadius: radii.md }]}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => isAuto || toggleMode()}
              style={[
                styles.toggleBtn,
                {
                  backgroundColor: isAuto ? colors.palette.forest : 'transparent',
                  borderRadius: radii.md - 2,
                },
              ]}
            >
              <Ionicons
                name="flash"
                size={16}
                color={isAuto ? colors.palette.white : colors.text}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.toggleText, { color: isAuto ? colors.palette.white : colors.text }]}>
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
                  borderRadius: radii.md - 2,
                },
              ]}
            >
              <Ionicons
                name="hand-left"
                size={16}
                color={!isAuto ? colors.palette.white : colors.text}
                style={{ marginRight: 6 }}
              />
              <Text style={[styles.toggleText, { color: !isAuto ? colors.palette.white : colors.text }]}>
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
          <View style={styles.cardTitleRow}>
            <Ionicons name="water-outline" size={18} color={colors.palette.forest} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Dispense Water</Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.textMuted }]}>
            Select pump activation duration:
          </Text>

          {/* Duration Chips */}
          <View style={styles.durationRow}>
            {durationOptions.map((sec) => {
              const isSelected = selectedDuration === sec;
              return (
                <TouchableOpacity
                  key={sec}
                  activeOpacity={0.8}
                  onPress={() => setSelectedDuration(sec)}
                  style={[
                    styles.durationChip,
                    {
                      backgroundColor: isSelected
                        ? colors.palette.forest
                        : colors.palette.mist,
                      borderColor: isSelected
                        ? colors.palette.forest
                        : colors.palette.lime,
                      borderRadius: radii.md,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.durationValue,
                      {
                        color: isSelected ? colors.palette.white : colors.palette.ink,
                      },
                    ]}
                  >
                    {sec}
                  </Text>
                  <Text
                    style={[
                      styles.durationUnit,
                      {
                        color: isSelected ? colors.palette.lime : colors.palette.sage,
                      },
                    ]}
                  >
                    sec
                  </Text>
                </TouchableOpacity>
              );
            })}
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
              color={colors.palette.white}
              style={{ marginRight: 8 }}
            />
            <Text style={styles.waterNowBtnText}>
              {isWatering
                ? `Dispensing... (${secondsLeft}s)`
                : `Water Now (${selectedDuration}s)`}
            </Text>
          </TouchableOpacity>

          {/* Watering progress bar */}
          {isWatering && (
            <View style={[styles.progressTrack, { backgroundColor: colors.palette.mist }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${((selectedDuration - secondsLeft) / selectedDuration) * 100}%`,
                    backgroundColor: colors.palette.forest,
                  },
                ]}
              />
            </View>
          )}

          <View style={styles.estimateRow}>
            <View style={styles.estimateItem}>
              <Ionicons name="beaker-outline" size={13} color={colors.textMuted} style={{ marginRight: 4 }} />
              <Text style={[styles.estimateLabel, { color: colors.textMuted }]}>
                ~{selectedDuration * config.bottle.flowMlPerSec} ml output
              </Text>
            </View>
            <View style={styles.estimateItem}>
              <Ionicons name="flask-outline" size={13} color={colors.textMuted} style={{ marginRight: 4 }} />
              <Text style={[styles.estimateLabel, { color: colors.textMuted }]}>
                {config.bottle.remainingMl} ml left
              </Text>
            </View>
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
          <View style={styles.cardTitleRow}>
            <Ionicons name="radio-outline" size={18} color={colors.palette.forest} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>ESP8266 Command Stream</Text>
          </View>
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
          {isWatering && (
            <View style={[styles.streamActive, { backgroundColor: colors.palette.lime, borderRadius: radii.sm }]}>
              <Ionicons name="pulse-outline" size={14} color={colors.palette.forest} style={{ marginRight: 6 }} />
              <Text style={[styles.streamActiveText, { color: colors.palette.forest }]}>
                Relay active for {secondsLeft} more seconds
              </Text>
            </View>
          )}
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
    paddingBottom: 100,
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
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 17,
    fontWeight: '700',
  },
  cardDesc: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  toggleRow: {
    flexDirection: 'row',
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
    paddingVertical: 14,
    alignItems: 'center',
    borderWidth: 1.5,
  },
  durationValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  durationUnit: {
    fontSize: 11,
    fontWeight: '600',
    marginTop: 1,
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
    elevation: 4,
  },
  waterNowBtnText: {
    color: '#FFF',
    fontSize: 17,
    fontWeight: '800',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    marginTop: 10,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 2,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
  },
  estimateItem: {
    flexDirection: 'row',
    alignItems: 'center',
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
    flex: 1,
  },
  streamActive: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  streamActiveText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
