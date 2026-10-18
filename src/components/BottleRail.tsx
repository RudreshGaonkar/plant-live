/**
 * BottleRail
 * Slim vertical pill on the left edge showing estimated water bottle level.
 * - Animated SVG fill from sage to mint; turns blush/critical under 20%
 * - Tap expands to a small popover with capacity, remaining ml, and "I refilled" button
 * uiLayout.md Section 3 – Layer 3
 */
import React, { useState } from 'react';
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
} from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect, ClipPath } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';

interface BottleRailProps {
  remainingMl: number;
  capacityMl: number;
  flowMlPerSec: number;
  onRefill: () => void;
}

export function BottleRail({
  remainingMl,
  capacityMl,
  flowMlPerSec,
  onRefill,
}: BottleRailProps) {
  const { colors, radii } = useAppTheme();
  const [popoverOpen, setPopoverOpen] = useState(false);

  const fillRatio = Math.max(0, Math.min(1, remainingMl / capacityMl));
  const fillPercent = Math.round(fillRatio * 100);
  const isCritical = fillPercent < 20;
  const estimatedWaterings = Math.floor(remainingMl / (flowMlPerSec * 5)); // 5s default

  const RAIL_HEIGHT = 180;
  const RAIL_WIDTH = 44;

  // Determine colors based on level
  const fillColor = isCritical ? colors.palette.warningBorder : colors.palette.sage;
  const fillColorEnd = isCritical ? colors.palette.critical : colors.palette.mint;

  const popoverScale = useSharedValue(0);
  const popoverStyle = useAnimatedStyle(() => ({
    transform: [{ scale: popoverScale.value }],
    opacity: popoverScale.value,
  }));

  const openPopover = () => {
    setPopoverOpen(true);
    popoverScale.value = withSpring(1, { damping: 14 });
  };

  const closePopover = () => {
    popoverScale.value = withTiming(0, { duration: 180 });
    setTimeout(() => setPopoverOpen(false), 200);
  };

  const handleRefill = () => {
    onRefill();
    closePopover();
  };

  const fillHeight = fillRatio * RAIL_HEIGHT;

  return (
    <>
      <TouchableOpacity
        onPress={openPopover}
        style={[
          styles.rail,
          {
            width: RAIL_WIDTH,
            height: RAIL_HEIGHT,
            backgroundColor: `${colors.palette.white}CC`,
            borderRadius: RAIL_WIDTH / 2,
            borderColor: isCritical
              ? colors.palette.warningBorder
              : colors.border,
            shadowColor: colors.palette.ink,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.1,
            shadowRadius: 12,
            elevation: 8,
          },
        ]}
        accessibilityLabel={`Water bottle ${fillPercent}% full. Tap for details.`}
      >
        {/* Animated fill using SVG */}
        <Svg
          width={RAIL_WIDTH}
          height={RAIL_HEIGHT}
          style={StyleSheet.absoluteFill}
        >
          <Defs>
            <LinearGradient id="bottleFill" x1="0" y1="1" x2="0" y2="0">
              <Stop offset="0" stopColor={fillColor} stopOpacity="0.9" />
              <Stop offset="1" stopColor={fillColorEnd} stopOpacity="0.85" />
            </LinearGradient>
            <ClipPath id="railClip">
              <Rect
                x={0}
                y={RAIL_HEIGHT - fillHeight}
                width={RAIL_WIDTH}
                height={fillHeight}
                rx={RAIL_WIDTH / 2}
              />
            </ClipPath>
          </Defs>
          <Rect
            x={0}
            y={0}
            width={RAIL_WIDTH}
            height={RAIL_HEIGHT}
            fill="url(#bottleFill)"
            clipPath="url(#railClip)"
            rx={RAIL_WIDTH / 2}
          />
        </Svg>

        {/* Percent label */}
        <View style={styles.railLabel}>
          <Ionicons
            name={isCritical ? 'alert-circle' : 'water'}
            size={12}
            color={isCritical ? colors.palette.critical : colors.palette.forest}
          />
          <Text
            style={[
              styles.railPercent,
              {
                color: isCritical
                  ? colors.palette.critical
                  : colors.palette.forest,
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
          style={[styles.captionText, { color: `${colors.palette.ink}70` }]}
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
                  size={18}
                  color={colors.palette.forest}
                />
                <Text
                  style={[styles.popoverTitle, { color: colors.palette.ink }]}
                >
                  Water Bottle
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
                      color: isCritical
                        ? colors.palette.critical
                        : colors.palette.ink,
                      fontWeight: '800',
                    },
                  ]}
                >
                  {remainingMl} ml
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
                  ~{estimatedWaterings}
                </Text>
              </View>

              {isCritical && (
                <View
                  style={[
                    styles.lowWarning,
                    { backgroundColor: colors.palette.blush },
                  ]}
                >
                  <Ionicons
                    name="alert-circle-outline"
                    size={14}
                    color={colors.palette.critical}
                  />
                  <Text
                    style={[
                      styles.lowWarningText,
                      { color: colors.palette.critical },
                    ]}
                  >
                    Bottle nearly empty — pump disabled
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
                accessibilityLabel="I refilled the bottle"
              >
                <Ionicons
                  name="refresh"
                  size={16}
                  color={colors.palette.white}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.refillBtnText}>I Refilled</Text>
              </TouchableOpacity>
            </Animated.View>
          </Pressable>
        </Modal>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  rail: {
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  railLabel: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
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
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  popover: {
    padding: 20,
    gap: 10,
  },
  popoverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 4,
  },
  popoverTitle: {
    fontSize: 17,
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
  lowWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  lowWarningText: {
    fontSize: 12,
    fontWeight: '600',
    flex: 1,
  },
  refillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    marginTop: 6,
  },
  refillBtnText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
