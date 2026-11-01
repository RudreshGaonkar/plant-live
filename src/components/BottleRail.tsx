/**
 * BottleRail / WaterCapsule / ReservoirPill
 * Slim vertical reservoir pill component showing water bottle level.
 * - Smooth animated wave filling effect for water height level with dual-layer liquid undulation
 * - Dynamic Color Rules:
 *   - > 30%: Theme Green fill
 *   - 15% to 30%: Warning Yellow / Orange fill
 *   - < 15%: Danger Red fill
 * - Tap expands to a popover with capacity, remaining ml, flow rate, and "I refilled" button
 * uiLayout.md Section 3 – Layer 3
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  withRepeat,
  Easing,
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Path } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';

export interface BottleRailProps {
  remainingMl: number;
  capacityMl: number;
  flowMlPerSec?: number;
  onRefill: () => void;
}

export type WaterLevelState = 'normal' | 'warning' | 'danger';

export const getWaterLevelState = (percent: number): WaterLevelState => {
  if (percent > 30) return 'normal';
  if (percent >= 15) return 'warning';
  return 'danger';
};

const STATE_COLORS: Record<
  WaterLevelState,
  {
    gradientStart: string;
    gradientEnd: string;
    backWaveStart: string;
    backWaveEnd: string;
    border: string;
    accent: string;
    badgeBg: string;
    icon: keyof typeof Ionicons.glyphMap;
    statusLabel: string;
  }
> = {
  normal: {
    gradientStart: '#5A8A5C', // Theme Green (spec forest)
    gradientEnd: '#335E35',   // Deep Forest Green
    backWaveStart: '#AEE09A', // Spec Mint
    backWaveEnd: '#5A8A5C',
    border: 'rgba(90, 138, 92, 0.40)',
    accent: '#264E29',
    badgeBg: 'rgba(255, 255, 255, 0.90)',
    icon: 'water',
    statusLabel: 'Adequate',
  },
  warning: {
    gradientStart: '#F59E0B', // Warning Yellow/Orange (amber-500)
    gradientEnd: '#D97706',   // Warning Orange (amber-600)
    backWaveStart: '#FDE68A', // Soft Amber (amber-200)
    backWaveEnd: '#F59E0B',
    border: 'rgba(245, 158, 11, 0.60)',
    accent: '#B45309',
    badgeBg: 'rgba(255, 255, 255, 0.92)',
    icon: 'warning-outline',
    statusLabel: 'Low (15% - 30%)',
  },
  danger: {
    gradientStart: '#EF4444', // Danger Red (red-500)
    gradientEnd: '#B91C1C',   // Deep Danger Red (red-700)
    backWaveStart: '#FCA5A5', // Soft Red (red-300)
    backWaveEnd: '#DC2626',
    border: 'rgba(220, 38, 38, 0.65)',
    accent: '#DC2626',
    badgeBg: 'rgba(255, 255, 255, 0.92)',
    icon: 'alert-circle',
    statusLabel: 'Critically Low (<15%)',
  },
};

export function BottleRail({
  remainingMl,
  capacityMl,
  flowMlPerSec = 15,
  onRefill,
}: BottleRailProps) {
  const { colors, radii } = useAppTheme();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const fillRatio = Math.max(0, Math.min(1, capacityMl > 0 ? remainingMl / capacityMl : 0));
  const fillPercent = Math.round(fillRatio * 100);
  const levelState = getWaterLevelState(fillPercent);
  const stateConfig = STATE_COLORS[levelState];

  const estimatedWaterings = Math.floor(remainingMl / (flowMlPerSec * 5)); // 5s default run

  const RAIL_HEIGHT = 180;
  const RAIL_WIDTH = 44;
  const targetHeight = fillRatio * RAIL_HEIGHT;

  // Reanimated shared values
  const waterHeightAnim = useSharedValue(0);
  const waveAnim1 = useSharedValue(0);
  const waveAnim2 = useSharedValue(0);
  const popoverScale = useSharedValue(0);

  // Smooth wave filling effect for water height changes
  useEffect(() => {
    waterHeightAnim.value = withTiming(targetHeight, {
      duration: 850,
      easing: Easing.out(Easing.cubic),
    });
  }, [targetHeight, waterHeightAnim]);

  // Continuous horizontal wave ripple animation
  useEffect(() => {
    waveAnim1.value = withRepeat(
      withTiming(-44, { duration: 2400, easing: Easing.linear }),
      -1,
      false
    );
    waveAnim2.value = withRepeat(
      withTiming(-44, { duration: 3800, easing: Easing.linear }),
      -1,
      false
    );
  }, [waveAnim1, waveAnim2]);

  const waterContainerStyle = useAnimatedStyle(() => ({
    height: waterHeightAnim.value,
  }));

  const waveStyle1 = useAnimatedStyle(() => ({
    transform: [{ translateX: waveAnim1.value }],
  }));

  const waveStyle2 = useAnimatedStyle(() => ({
    transform: [{ translateX: waveAnim2.value }],
  }));

  const popoverStyle = useAnimatedStyle(() => ({
    transform: [{ scale: popoverScale.value }],
    opacity: popoverScale.value,
  }));

  const openPopover = () => {
    setPopoverOpen(true);
    // eslint-disable-next-line react-hooks/immutability
    popoverScale.value = withSpring(1, { damping: 14 });
  };

  const closePopover = () => {
    // eslint-disable-next-line react-hooks/immutability
    popoverScale.value = withTiming(0, { duration: 180 });
    setTimeout(() => setPopoverOpen(false), 200);
  };

  const handleRefill = () => {
    onRefill();
    closePopover();
  };

  return (
    <>
      <TouchableOpacity
        onPress={openPopover}
        activeOpacity={0.85}
        style={[
          styles.rail,
          {
            width: RAIL_WIDTH,
            height: RAIL_HEIGHT,
            backgroundColor: `${colors.palette.white}D5`,
            borderRadius: RAIL_WIDTH / 2,
            borderColor: stateConfig.border,
            shadowColor: colors.palette.ink,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 12,
            elevation: 8,
          },
        ]}
        accessibilityLabel={`Water reservoir capsule ${fillPercent}% full (${levelState} state). Tap for refill options.`}
      >
        {/* Animated Liquid Reservoir Container */}
        <Animated.View style={[styles.waterContainer, waterContainerStyle]}>
          {/* Secondary / Back Wave Layer for fluid depth */}
          <Animated.View style={[styles.waveLayer, waveStyle2, { opacity: 0.45 }]}>
            <Svg width={132} height={200} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="backWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={stateConfig.backWaveStart} stopOpacity="0.95" />
                  <Stop offset="1" stopColor={stateConfig.backWaveEnd} stopOpacity="0.75" />
                </LinearGradient>
              </Defs>
              <Path
                d="M 0 5 Q 11 8.5, 22 5 Q 33 1.5, 44 5 Q 55 8.5, 66 5 Q 77 1.5, 88 5 Q 99 8.5, 110 5 Q 121 1.5, 132 5 L 132 200 L 0 200 Z"
                fill="url(#backWaveGrad)"
              />
            </Svg>
          </Animated.View>

          {/* Primary / Front Animated Wave Layer */}
          <Animated.View style={[styles.waveLayer, waveStyle1, { opacity: 0.92 }]}>
            <Svg width={132} height={200} style={StyleSheet.absoluteFill}>
              <Defs>
                <LinearGradient id="frontWaveGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0" stopColor={stateConfig.gradientStart} stopOpacity="1" />
                  <Stop offset="1" stopColor={stateConfig.gradientEnd} stopOpacity="0.95" />
                </LinearGradient>
              </Defs>
              <Path
                d="M 0 5 Q 11 1.5, 22 5 Q 33 8.5, 44 5 Q 55 1.5, 66 5 Q 77 8.5, 88 5 Q 99 1.5, 110 5 Q 121 8.5, 132 5 L 132 200 L 0 200 Z"
                fill="url(#frontWaveGrad)"
              />
            </Svg>
          </Animated.View>
        </Animated.View>

        {/* Centered Frosted Badge (Readable over any wave level) */}
        <View
          style={[
            styles.railLabelBadge,
            {
              backgroundColor: stateConfig.badgeBg,
              borderColor: stateConfig.border,
            },
          ]}
        >
          <Ionicons
            name={stateConfig.icon}
            size={11}
            color={stateConfig.accent}
          />
          <Text
            style={[
              styles.railPercent,
              {
                color: stateConfig.accent,
              },
            ]}
          >
            {fillPercent}%
          </Text>
        </View>
      </TouchableOpacity>

      {/* "Est. waterings" caption below rail */}
      <View style={styles.railCaption}>
        <Text
          style={[styles.captionText, { color: `${colors.palette.ink}80` }]}
        >
          ~{estimatedWaterings}
        </Text>
        <Text
          style={[styles.captionSub, { color: `${colors.palette.ink}50` }]}
        >
          Est.
        </Text>
      </View>

      {/* Popover modal */}
      {popoverOpen && (
        <Modal transparent animationType="none" onRequestClose={closePopover}>
          <Pressable style={styles.modalBackdrop} onPress={closePopover}>
            <Animated.View
              style={[
                styles.popover,
                {
                  backgroundColor: colors.palette.white,
                  borderRadius: radii.card,
                  shadowColor: colors.palette.ink,
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.14,
                  shadowRadius: 24,
                  elevation: 16,
                },
                popoverStyle,
              ]}
            >
              <View style={styles.popoverHeader}>
                <Ionicons
                  name="water"
                  size={20}
                  color={stateConfig.accent}
                />
                <Text
                  style={[styles.popoverTitle, { color: colors.palette.ink }]}
                >
                  Water Reservoir
                </Text>
              </View>

              <View style={styles.popoverRow}>
                <Text style={[styles.popoverKey, { color: colors.palette.sage }]}>
                  Capacity
                </Text>
                <Text style={[styles.popoverVal, { color: colors.palette.ink }]}>
                  {capacityMl} ml
                </Text>
              </View>

              <View style={styles.popoverRow}>
                <Text style={[styles.popoverKey, { color: colors.palette.sage }]}>
                  Remaining
                </Text>
                <Text
                  style={[
                    styles.popoverVal,
                    {
                      color: stateConfig.accent,
                      fontWeight: '800',
                    },
                  ]}
                >
                  {remainingMl} ml ({fillPercent}%)
                </Text>
              </View>

              <View style={styles.popoverRow}>
                <Text style={[styles.popoverKey, { color: colors.palette.sage }]}>
                  Flow rate
                </Text>
                <Text style={[styles.popoverVal, { color: colors.palette.ink }]}>
                  {flowMlPerSec} ml/s
                </Text>
              </View>

              <View style={styles.popoverRow}>
                <Text style={[styles.popoverKey, { color: colors.palette.sage }]}>
                  Est. waterings
                </Text>
                <Text style={[styles.popoverVal, { color: colors.palette.ink }]}>
                  ~{estimatedWaterings} cycles
                </Text>
              </View>

              {/* Responsive status banner */}
              {levelState === 'danger' && (
                <View
                  style={[
                    styles.statusAlertBanner,
                    { backgroundColor: `${colors.palette.blush}CC`, borderColor: colors.palette.critical },
                  ]}
                >
                  <Ionicons
                    name="alert-circle"
                    size={15}
                    color={colors.palette.critical}
                  />
                  <Text
                    style={[
                      styles.statusAlertText,
                      { color: colors.palette.critical },
                    ]}
                  >
                    Danger: Reservoir critically low (&lt;15%). Auto-watering paused.
                  </Text>
                </View>
              )}

              {levelState === 'warning' && (
                <View
                  style={[
                    styles.statusAlertBanner,
                    { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' },
                  ]}
                >
                  <Ionicons
                    name="warning-outline"
                    size={15}
                    color="#D97706"
                  />
                  <Text
                    style={[
                      styles.statusAlertText,
                      { color: '#B45309' },
                    ]}
                  >
                    Warning: Reservoir level is between 15% and 30%. Refill soon.
                  </Text>
                </View>
              )}

              {levelState === 'normal' && (
                <View
                  style={[
                    styles.statusAlertBanner,
                    { backgroundColor: '#ECFDF5', borderColor: '#10B981' },
                  ]}
                >
                  <Ionicons
                    name="checkmark-circle-outline"
                    size={15}
                    color="#059669"
                  />
                  <Text
                    style={[
                      styles.statusAlertText,
                      { color: '#047857' },
                    ]}
                  >
                    Reservoir level is optimal (&gt;30%).
                  </Text>
                </View>
              )}

              <TouchableOpacity
                onPress={handleRefill}
                style={[
                  styles.refillBtn,
                  {
                    backgroundColor: colors.palette.forest,
                    borderRadius: radii.xl,
                  },
                ]}
                accessibilityLabel="I refilled the reservoir"
              >
                <Ionicons
                  name="refresh"
                  size={16}
                  color={colors.palette.white}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.refillBtnText}>I Refilled Reservoir</Text>
              </TouchableOpacity>
            </Animated.View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

// Aliases for vertical water reservoir pill component
export const WaterCapsule = BottleRail;
export const ReservoirPill = BottleRail;

const styles = StyleSheet.create({
  rail: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    position: 'relative',
  },
  waterContainer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  waveLayer: {
    position: 'absolute',
    top: -5,
    left: 0,
    width: 132,
    height: 200,
  },
  railLabelBadge: {
    zIndex: 10,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
    paddingHorizontal: 5,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  railPercent: {
    fontSize: 10,
    fontWeight: '800',
  },
  railCaption: {
    alignItems: 'center',
    marginTop: 6,
  },
  captionText: {
    fontSize: 11,
    fontWeight: '700',
  },
  captionSub: {
    fontSize: 9,
    fontWeight: '500',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.38)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  popover: {
    padding: 22,
    gap: 12,
  },
  popoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 2,
  },
  popoverTitle: {
    fontSize: 18,
    fontWeight: '800',
  },
  popoverRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  popoverKey: {
    fontSize: 13,
    fontWeight: '500',
  },
  popoverVal: {
    fontSize: 13,
    fontWeight: '600',
  },
  statusAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
  },
  statusAlertText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  refillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    marginTop: 6,
  },
  refillBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
