/**
 * ControlScreen
 * Manual watering control and command lifecycle management:
 * - Auto vs Manual operating mode toggle (Section 7.4 of spec.md)
 * - Duration selector with 1-15s bounds and quick presets (3s, 5s, 10s, 15s)
 * - Safety guards: 15s max limit, 60s cooldown, empty bottle block, wet soil warning
 * - Live real-time command lifecycle stepper: Sent -> Received -> Watering -> Done
 * - Hardware stream status with relay pin indicator
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';
import { usePlantState } from '@/hooks/usePlantState';
import { StatusChip } from '@/components';
import { useCommand } from '@/hooks/useCommand';

export default function ControlScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const { device, health } = usePlantState();
  const toggleMode = useLiveDevice((s) => s.toggleMode);

  const [selectedDuration, setSelectedDuration] = useState<number>(5);

  const {
    stage,
    secondsRemaining,
    cooldownSecondsLeft,
    errorMessage,
    canWater,
    executeWaterNow,
    resetCommandState,
    refillBottle,
  } = useCommand();

  if (!device) return null;

  const { config, telemetry, status } = device;
  const isAuto = config.mode === 'auto';
  const durationOptions = [3, 5, 10, 15];
  const isDispensing = stage === 'running' || secondsRemaining > 0;
  const isReservoirLow = config.bottle.remainingMl <= 20;

  const handleWaterPress = async () => {
    await executeWaterNow(selectedDuration);
  };

  // Stage mapping helper
  const getStageIndex = (): number => {
    switch (stage) {
      case 'sent':
        return 1;
      case 'received':
        return 2;
      case 'running':
        return 3;
      case 'done':
        return 4;
      default:
        return 0;
    }
  };

  const activeStageIndex = getStageIndex();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.screenTitle, { color: colors.text }]}>Manual Control</Text>
        <Text style={[styles.screenSubtitle, { color: colors.textMuted }]}>
          Safety limits: Max 15s pump runtime • 60s cooldown between waterings.
        </Text>

        {/* Cooldown Active Banner */}
        {cooldownSecondsLeft > 0 && (
          <View style={[styles.cooldownBanner, { backgroundColor: colors.palette.lime, borderRadius: radii.md }]}>
            <Ionicons name="timer-outline" size={16} color={colors.palette.forest} />
            <Text style={[styles.cooldownText, { color: colors.palette.ink }]}>
              Pump Cooldown Active: {cooldownSecondsLeft}s remaining before next manual cycle
            </Text>
          </View>
        )}

        {/* Empty Reservoir Warning */}
        {isReservoirLow && (
          <View style={[styles.reservoirBanner, { backgroundColor: colors.palette.blush, borderRadius: radii.md }]}>
            <Ionicons name="alert-circle-outline" size={20} color={colors.palette.warningText} />
            <View style={{ flex: 1, marginHorizontal: 8 }}>
              <Text style={[styles.bannerTitle, { color: colors.palette.warningText }]}>
                Reservoir Low ({config.bottle.remainingMl} ml)
              </Text>
              <Text style={[styles.bannerSub, { color: colors.textMuted }]}>
                Watering disabled until bottle is refilled.
              </Text>
            </View>
            <TouchableOpacity
              style={[styles.refillBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.full }]}
              onPress={refillBottle}
            >
              <Text style={styles.refillBtnText}>I Refilled</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Operating Mode Selector Card */}
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
                  ? 'Auto mode waters automatically based on soil moisture & climate thresholds.'
                  : 'Manual mode disables automatic pump runs. The app only delivers notifications.'}
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

        {/* Manual Water Dispenser Card */}
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
            <Text style={[styles.cardTitle, { color: colors.text }]}>Manual Water Dispenser</Text>
          </View>
          <Text style={[styles.cardDesc, { color: colors.textMuted }]}>
            Select pump duration (strictly capped between 1 and 15 seconds):
          </Text>

          {/* Preset Duration Chips */}
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

          {/* Stepper Buttons for Fine Tuning */}
          <View style={[styles.stepperBox, { backgroundColor: colors.palette.mist, borderRadius: radii.md }]}>
            <TouchableOpacity
              onPress={() => setSelectedDuration(Math.max(1, selectedDuration - 1))}
              disabled={selectedDuration <= 1 || isDispensing}
              style={[styles.stepperBtn, { backgroundColor: colors.surface, borderRadius: radii.sm }]}
            >
              <Ionicons name="remove" size={16} color={selectedDuration <= 1 ? colors.textMuted : colors.palette.forest} />
            </TouchableOpacity>

            <View style={styles.stepperCenter}>
              <Text style={[styles.stepperNumber, { color: colors.palette.forest }]}>{selectedDuration}</Text>
              <Text style={[styles.stepperUnit, { color: colors.textMuted }]}>seconds</Text>
            </View>

            <TouchableOpacity
              onPress={() => setSelectedDuration(Math.min(15, selectedDuration + 1))}
              disabled={selectedDuration >= 15 || isDispensing}
              style={[styles.stepperBtn, { backgroundColor: colors.surface, borderRadius: radii.sm }]}
            >
              <Ionicons name="add" size={16} color={selectedDuration >= 15 ? colors.textMuted : colors.palette.forest} />
            </TouchableOpacity>
          </View>

          {/* Primary Water Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={stage === 'done' ? resetCommandState : handleWaterPress}
            disabled={(!canWater && stage === 'idle') || isDispensing}
            style={[
              styles.waterNowBtn,
              {
                backgroundColor: isDispensing
                  ? colors.palette.sage
                  : stage === 'done'
                  ? colors.palette.forest
                  : !canWater
                  ? colors.palette.sage
                  : colors.primary,
                borderRadius: radii.xl,
              },
            ]}
          >
            {isDispensing ? (
              <>
                <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 8 }} />
                <Text style={styles.waterNowBtnText}>
                  Dispensing... ({secondsRemaining}s)
                </Text>
              </>
            ) : stage === 'done' ? (
              <>
                <Ionicons name="checkmark-done" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.waterNowBtnText}>Cycle Complete (Reset)</Text>
              </>
            ) : (
              <>
                <Ionicons name="water" size={20} color="#FFFFFF" style={{ marginRight: 8 }} />
                <Text style={styles.waterNowBtnText}>
                  {cooldownSecondsLeft > 0
                    ? `Cooldown (${cooldownSecondsLeft}s)`
                    : isReservoirLow
                    ? 'Bottle Empty'
                    : `Water Now (${selectedDuration}s)`}
                </Text>
              </>
            )}
          </TouchableOpacity>

          {/* Live Progress Bar when Dispensing */}
          {isDispensing && (
            <View style={[styles.progressTrack, { backgroundColor: colors.palette.mist }]}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${((selectedDuration - secondsRemaining) / selectedDuration) * 100}%`,
                    backgroundColor: colors.palette.forest,
                  },
                ]}
              />
            </View>
          )}

          {/* Volume and Reserve Estimates */}
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

        {/* Real-Time Command Lifecycle Stream Card */}
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
            <Text style={[styles.cardTitle, { color: colors.text }]}>Real-Time Command Stream</Text>
          </View>

          {/* 4-Step Lifecycle Progress Stepper */}
          <View style={styles.stepperRow}>
            {[
              { label: 'Sent', idx: 1, icon: 'paper-plane-outline' as const },
              { label: 'Received', idx: 2, icon: 'checkmark-circle-outline' as const },
              { label: 'Watering', idx: 3, icon: 'water-outline' as const },
              { label: 'Done', idx: 4, icon: 'checkmark-done-circle' as const },
            ].map((st, i) => {
              const isPast = activeStageIndex >= st.idx;
              const isCurrent = activeStageIndex === st.idx;
              return (
                <React.Fragment key={st.label}>
                  {i > 0 && (
                    <View
                      style={[
                        styles.stepperLine,
                        { backgroundColor: isPast ? colors.palette.forest : colors.border },
                      ]}
                    />
                  )}
                  <View style={styles.stepCol}>
                    <View
                      style={[
                        styles.stepDot,
                        {
                          backgroundColor: isPast ? colors.palette.forest : colors.surface,
                          borderColor: isPast ? colors.palette.forest : colors.border,
                        },
                      ]}
                    >
                      <Ionicons
                        name={st.icon}
                        size={12}
                        color={isPast ? colors.palette.white : colors.textMuted}
                      />
                    </View>
                    <Text
                      style={[
                        styles.stepLabel,
                        {
                          color: isCurrent ? colors.palette.forest : colors.textMuted,
                          fontWeight: isCurrent ? '800' : '600',
                        },
                      ]}
                    >
                      {st.label}
                    </Text>
                  </View>
                </React.Fragment>
              );
            })}
          </View>

          {/* Hardware Stream Status */}
          <View style={styles.streamRow}>
            <View
              style={[
                styles.streamDot,
                {
                  backgroundColor: isDispensing
                    ? colors.palette.forest
                    : status.online
                    ? colors.palette.mint
                    : colors.palette.blush,
                },
              ]}
            />
            <Text style={[styles.streamStatus, { color: colors.text }]}>
              {isDispensing
                ? `Relay Pin D6: HIGH (Active watering)`
                : `Listening on /devices/${device.id}/command`}
            </Text>
          </View>

          {/* Timeout error banner */}
          {(stage === 'timeout' || stage === 'rejected') && (
            <View style={[styles.errorBanner, { backgroundColor: colors.palette.blush, borderRadius: radii.md }]}>
              <Ionicons name="warning" size={16} color={colors.palette.warningText} />
              <Text style={[styles.errorText, { color: colors.palette.warningText }]}>
                {errorMessage || "Device didn't respond within 15 seconds."}
              </Text>
              <TouchableOpacity
                style={[styles.retryBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.sm }]}
                onPress={handleWaterPress}
              >
                <Text style={styles.retryBtnText}>Retry</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {/* Safety & Firmware Guardrails Card */}
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
            <Ionicons name="shield-checkmark-outline" size={18} color={colors.palette.forest} />
            <Text style={[styles.cardTitle, { color: colors.text }]}>Safety Guardrails</Text>
          </View>

          <View style={styles.guardItem}>
            <Ionicons name="stopwatch-outline" size={16} color={colors.palette.forest} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.guardTitle, { color: colors.text }]}>15s Hard Safety Cutoff</Text>
              <Text style={[styles.guardDesc, { color: colors.textMuted }]}>
                Prevents accidental root drowning or flooding.
              </Text>
            </View>
          </View>

          <View style={styles.guardItem}>
            <Ionicons name="time-outline" size={16} color={colors.palette.forest} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.guardTitle, { color: colors.text }]}>60s Pump Cooldown</Text>
              <Text style={[styles.guardDesc, { color: colors.textMuted }]}>
                Protects the DC submersible pump motor against overheating.
              </Text>
            </View>
          </View>

          <View style={styles.guardItem}>
            <Ionicons name="leaf-outline" size={16} color={colors.palette.forest} />
            <View style={{ flex: 1 }}>
              <Text style={[styles.guardTitle, { color: colors.text }]}>
                Wet Soil Guard (Live: {telemetry.soilMoisture}%)
              </Text>
              <Text style={[styles.guardDesc, { color: colors.textMuted }]}>
                Prompts for confirmation before watering if soil is already wet (&gt;{config.thresholds.moistureMax}%).
              </Text>
            </View>
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
    paddingBottom: 100,
  },
  screenTitle: {
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  screenSubtitle: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  cooldownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 12,
  },
  cooldownText: {
    fontSize: 12,
    fontWeight: '700',
  },
  reservoirBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 12,
  },
  bannerTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  bannerSub: {
    fontSize: 11,
    marginTop: 1,
  },
  refillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  refillBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  card: {
    borderWidth: 1,
    marginBottom: 14,
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
    gap: 6,
    marginBottom: 4,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  cardDesc: {
    fontSize: 12,
    lineHeight: 16,
    marginBottom: 12,
  },
  toggleRow: {
    flexDirection: 'row',
    padding: 4,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
  },
  toggleText: {
    fontSize: 13,
    fontWeight: '700',
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  durationChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderWidth: 1.5,
  },
  durationValue: {
    fontSize: 18,
    fontWeight: '800',
  },
  durationUnit: {
    fontSize: 11,
    fontWeight: '600',
  },
  stepperBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    marginBottom: 14,
  },
  stepperBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperCenter: {
    alignItems: 'center',
  },
  stepperNumber: {
    fontSize: 20,
    fontWeight: '900',
  },
  stepperUnit: {
    fontSize: 10,
    fontWeight: '600',
  },
  waterNowBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginBottom: 12,
  },
  waterNowBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 12,
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  estimateRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  estimateItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  estimateLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  // Stepper styles
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginVertical: 12,
  },
  stepCol: {
    alignItems: 'center',
    gap: 4,
  },
  stepDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepLabel: {
    fontSize: 10,
  },
  stepperLine: {
    flex: 1,
    height: 2,
    marginBottom: 16,
  },
  streamRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  streamDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  streamStatus: {
    fontSize: 12,
    fontWeight: '600',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    marginTop: 10,
  },
  errorText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  retryBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
  },
  guardItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingVertical: 8,
  },
  guardTitle: {
    fontSize: 13,
    fontWeight: '700',
  },
  guardDesc: {
    fontSize: 11,
    marginTop: 2,
  },
});
