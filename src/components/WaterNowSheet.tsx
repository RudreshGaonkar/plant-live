/**
 * WaterNowSheet
 * Interactive modal sheet for manual watering:
 * - 1 to 15s duration selection with quick chips (3s, 5s, 10s, 15s)
 * - Estimated ml output & bottle reserve indicator
 * - Real-time command lifecycle progress: Sent -> Received -> Watering -> Done
 * - 60s cooldown indicator & empty reservoir guard
 * - Timeout handling with retry option
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice } from '@/store/useLiveDevice';
import { useCommand, CommandLifecycleStage } from '@/hooks/useCommand';

export interface WaterNowSheetProps {
  visible: boolean;
  onClose: () => void;
}

export function WaterNowSheet({ visible, onClose }: WaterNowSheetProps) {
  const { colors, radii } = useAppTheme();
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const [duration, setDuration] = useState<number>(5);

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

  const { config, telemetry } = device;
  const flowRate = config.bottle.flowMlPerSec || 15;
  const estimatedOutput = duration * flowRate;
  const isReservoirLow = config.bottle.remainingMl <= 20;

  const handleStartWatering = async () => {
    await executeWaterNow(duration);
  };

  const handleClose = () => {
    if (stage === 'done' || stage === 'timeout' || stage === 'rejected') {
      resetCommandState();
    }
    onClose();
  };

  const durationOptions = [3, 5, 10, 15];

  // Stage status helper
  const getStageIndex = (stg: CommandLifecycleStage): number => {
    switch (stg) {
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

  const activeStageIndex = getStageIndex(stage);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={handleClose}
    >
      <View style={styles.backdrop}>
        <View style={[styles.sheetContainer, { backgroundColor: colors.surface, borderTopLeftRadius: radii.hero, borderTopRightRadius: radii.hero }]}>
          {/* Header Row */}
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={[styles.iconWrap, { backgroundColor: colors.palette.mint }]}>
                <Ionicons name="water" size={18} color={colors.palette.forest} />
              </View>
              <View>
                <Text style={[styles.title, { color: colors.text }]}>Manual Water Dispenser</Text>
                <Text style={[styles.subtitle, { color: colors.textMuted }]}>
                  {config.name} • {telemetry.soilMoisture}% Moisture
                </Text>
              </View>
            </View>

            <TouchableOpacity onPress={handleClose} style={styles.closeBtn}>
              <Ionicons name="close" size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>

          {/* Cooldown Alert Banner */}
          {cooldownSecondsLeft > 0 && (
            <View style={[styles.cooldownBanner, { backgroundColor: colors.palette.lime, borderRadius: radii.md }]}>
              <Ionicons name="timer-outline" size={16} color={colors.palette.forest} />
              <Text style={[styles.cooldownText, { color: colors.palette.ink }]}>
                Pump Cooldown Active: {cooldownSecondsLeft}s remaining
              </Text>
            </View>
          )}

          {/* Low Reservoir Alert Banner */}
          {isReservoirLow && (
            <View style={[styles.reservoirBanner, { backgroundColor: colors.palette.blush, borderRadius: radii.md }]}>
              <Ionicons name="alert-circle-outline" size={18} color={colors.palette.warningText} />
              <View style={{ flex: 1, marginHorizontal: 8 }}>
                <Text style={[styles.bannerTitle, { color: colors.palette.warningText }]}>
                  Reservoir Empty ({config.bottle.remainingMl} ml)
                </Text>
                <Text style={[styles.bannerSub, { color: colors.textMuted }]}>
                  Refill your bottle to enable watering.
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

          {/* Active Command Lifecycle Stepper */}
          {stage !== 'idle' && (
            <View style={[styles.stepperCard, { backgroundColor: colors.palette.mist, borderRadius: radii.card }]}>
              <Text style={[styles.stepperHeader, { color: colors.text }]}>Command Lifecycle Stream</Text>

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

              {/* Active countdown or done banner */}
              {stage === 'running' && (
                <View style={[styles.activeWateringPill, { backgroundColor: colors.palette.forest, borderRadius: radii.full }]}>
                  <Ionicons name="water" size={14} color={colors.palette.white} />
                  <Text style={styles.activeWateringText}>
                    Dispensing... {secondsRemaining}s remaining
                  </Text>
                </View>
              )}

              {stage === 'done' && (
                <View style={[styles.donePill, { backgroundColor: colors.palette.lime, borderRadius: radii.full }]}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.palette.forest} />
                  <Text style={[styles.doneText, { color: colors.palette.forest }]}>
                    Cycle completed successfully!
                  </Text>
                </View>
              )}

              {/* Error or Timeout alert */}
              {(stage === 'timeout' || stage === 'rejected') && (
                <View style={[styles.errorBanner, { backgroundColor: colors.palette.blush, borderRadius: radii.md }]}>
                  <Ionicons name="warning" size={16} color={colors.palette.warningText} />
                  <Text style={[styles.errorText, { color: colors.palette.warningText }]}>
                    {errorMessage || "Device didn't respond. Check Wi-Fi."}
                  </Text>
                  <TouchableOpacity
                    style={[styles.retryBtn, { backgroundColor: colors.palette.forest, borderRadius: radii.sm }]}
                    onPress={handleStartWatering}
                  >
                    <Text style={styles.retryBtnText}>Retry</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* Duration Selector */}
          {stage === 'idle' && (
            <View>
              <Text style={[styles.sectionLabel, { color: colors.text }]}>Select Duration (1 – 15s)</Text>

              {/* Presets */}
              <View style={styles.presetRow}>
                {durationOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    onPress={() => setDuration(opt)}
                    style={[
                      styles.presetChip,
                      {
                        backgroundColor: duration === opt ? colors.palette.forest : colors.palette.mist,
                        borderRadius: radii.md,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetVal,
                        { color: duration === opt ? colors.palette.white : colors.text },
                      ]}
                    >
                      {opt}s
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Stepper buttons (- / +) */}
              <View style={[styles.stepperContainer, { backgroundColor: colors.palette.mist, borderRadius: radii.card }]}>
                <TouchableOpacity
                  onPress={() => setDuration(Math.max(1, duration - 1))}
                  style={[styles.stepBtn, { backgroundColor: colors.surface, borderRadius: radii.md }]}
                  disabled={duration <= 1}
                >
                  <Ionicons name="remove" size={18} color={duration <= 1 ? colors.textMuted : colors.palette.forest} />
                </TouchableOpacity>

                <View style={styles.durationDisplay}>
                  <Text style={[styles.durationNumber, { color: colors.palette.forest }]}>{duration}</Text>
                  <Text style={[styles.durationUnits, { color: colors.textMuted }]}>seconds</Text>
                </View>

                <TouchableOpacity
                  onPress={() => setDuration(Math.min(15, duration + 1))}
                  style={[styles.stepBtn, { backgroundColor: colors.surface, borderRadius: radii.md }]}
                  disabled={duration >= 15}
                >
                  <Ionicons name="add" size={18} color={duration >= 15 ? colors.textMuted : colors.palette.forest} />
                </TouchableOpacity>
              </View>

              {/* Volume & Bottle stats */}
              <View style={styles.statsRow}>
                <View style={styles.statItem}>
                  <Ionicons name="beaker-outline" size={14} color={colors.palette.forest} style={{ marginRight: 4 }} />
                  <Text style={[styles.statText, { color: colors.textMuted }]}>
                    Output: ~{estimatedOutput} ml
                  </Text>
                </View>
                <View style={styles.statItem}>
                  <Ionicons name="flask-outline" size={14} color={colors.palette.forest} style={{ marginRight: 4 }} />
                  <Text style={[styles.statText, { color: colors.textMuted }]}>
                    Reserve: {config.bottle.remainingMl} ml
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Primary Action Button */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={stage === 'done' ? handleClose : handleStartWatering}
            disabled={!canWater && stage === 'idle'}
            style={[
              styles.primaryBtn,
              {
                backgroundColor:
                  stage === 'running'
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
            {stage === 'running' ? (
              <>
                <ActivityIndicator color="#FFFFFF" size="small" style={{ marginRight: 8 }} />
                <Text style={styles.primaryBtnText}>Dispensing ({secondsRemaining}s)...</Text>
              </>
            ) : stage === 'done' ? (
              <>
                <Ionicons name="checkmark" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.primaryBtnText}>Done (Close)</Text>
              </>
            ) : (
              <>
                <Ionicons name="water" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.primaryBtnText}>
                  {cooldownSecondsLeft > 0
                    ? `Cooldown (${cooldownSecondsLeft}s)`
                    : isReservoirLow
                    ? 'Bottle Empty'
                    : `Water Now (${duration}s)`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    padding: 20,
    paddingBottom: 36,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '800',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 1,
  },
  closeBtn: {
    padding: 6,
  },
  cooldownBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
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
  stepperCard: {
    padding: 14,
    marginBottom: 16,
  },
  stepperHeader: {
    fontSize: 12,
    fontWeight: '800',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
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
  activeWateringPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 6,
  },
  activeWateringText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  donePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    marginTop: 6,
  },
  doneText: {
    fontSize: 12,
    fontWeight: '800',
  },
  errorBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    marginTop: 8,
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
  sectionLabel: {
    fontSize: 13,
    fontWeight: '700',
    marginBottom: 8,
  },
  presetRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  presetChip: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetVal: {
    fontSize: 13,
    fontWeight: '800',
  },
  stepperContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 8,
    marginBottom: 12,
  },
  stepBtn: {
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationDisplay: {
    alignItems: 'center',
  },
  durationNumber: {
    fontSize: 26,
    fontWeight: '900',
  },
  durationUnits: {
    fontSize: 11,
    fontWeight: '600',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statText: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
