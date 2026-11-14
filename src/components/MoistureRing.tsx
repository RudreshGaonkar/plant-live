/**
 * MoistureRing
 * Large circular SVG moisture indicator with:
 * - Normalized 130 × 130 viewBox, center (65, 65), radius 51, and stroke 14
 * - Shared 150° to 390° (240° sweep) SVG arc path for track and progress
 * - Progress dash animation with suppression at 0 or missing values (no stray round cap dot)
 * - Radial threshold ticks inside stroke at (r - 4) to (r + 4)
 * - Numeric readout and % on single clean baseline without negative margins
 * - Em dash (—) when missing
 * uiLayout.md Section 3 – Layer 5 Peek content
 */
import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import Svg, { Path, Line } from 'react-native-svg';
import { useAppTheme } from '@/theme';

const AnimatedPath = Animated.createAnimatedComponent(Path);

export interface MoistureRingProps {
  soilMoisture: number | null; // 0–100
  moistureMin: number;
  moistureMax: number;
  size?: number;
}

// Normalized gauge constants
// center = (65, 65), r = 51, stroke = 14
// Angle: 150° to 390° (240° sweep arc)
// (x1, y1) = (65 + 51*cos(150°), 65 + 51*sin(150°)) = (20.8327, 90.5)
// (x2, y2) = (65 + 51*cos(390°), 65 + 51*sin(390°)) = (109.1673, 90.5)
const ARC_PATH = 'M 20.8327 90.5 A 51 51 0 1 1 109.1673 90.5';
const ARC_LENGTH = 51 * (240 * (Math.PI / 180)); // 68*PI ≈ 213.6283

export function MoistureRing({
  soilMoisture,
  moistureMin,
  moistureMax,
  size = 130,
}: MoistureRingProps) {
  const { colors } = useAppTheme();

  // Clamp finite values so label and arc stay perfectly aligned
  const clampedMoisture = useMemo(() => {
    if (typeof soilMoisture === 'number' && Number.isFinite(soilMoisture)) {
      return Math.max(0, Math.min(100, Math.round(soilMoisture)));
    }
    return null;
  }, [soilMoisture]);

  // Animated fill progress (0 to 100)
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(clampedMoisture ?? 0, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [clampedMoisture, progress]);

  // StrokeDashoffset: maps 0%–100% across the visible 240° sweep arc
  const fillAnimProps = useAnimatedProps(() => {
    const p = Math.max(0, Math.min(100, progress.value));
    const strokeDashoffset = ARC_LENGTH * (1 - p / 100);
    return {
      strokeDashoffset,
    };
  });

  // Determine fill color based on thresholds
  const isBelowMin = clampedMoisture !== null && clampedMoisture < moistureMin;
  const isAboveMax = clampedMoisture !== null && clampedMoisture > moistureMax;
  const fillColor = isBelowMin
    ? colors.palette.warningBorder
    : isAboveMax
    ? colors.palette.sage
    : colors.palette.mint;

  // Compute radial min/max threshold ticks along (r - 4) to (r + 4) inside the 14-width stroke
  const getTickCoords = (threshold: number) => {
    const clampedThreshold = Math.max(0, Math.min(100, threshold));
    const deg = 150 + (clampedThreshold / 100) * 240;
    const rad = (deg * Math.PI) / 180;
    const rInner = 51 - 4; // 47
    const rOuter = 51 + 4; // 55
    return {
      x1: 65 + rInner * Math.cos(rad),
      y1: 65 + rInner * Math.sin(rad),
      x2: 65 + rOuter * Math.cos(rad),
      y2: 65 + rOuter * Math.sin(rad),
    };
  };

  const minTick = useMemo(() => getTickCoords(moistureMin), [moistureMin]);
  const maxTick = useMemo(() => getTickCoords(moistureMax), [moistureMax]);

  return (
    <View style={{ width: size, height: size, position: 'relative' }}>
      <Svg width={size} height={size} viewBox="0 0 130 130">
        {/* Background track: 240° arc stroke */}
        <Path
          d={ARC_PATH}
          stroke={`${colors.palette.sage}40`}
          strokeWidth={14}
          strokeLinecap="round"
          fill="none"
        />

        {/* Animated progress arc: suppress stroke at 0 or missing values so no stray round cap dot renders */}
        {clampedMoisture !== null && clampedMoisture > 0 && (
          <AnimatedPath
            d={ARC_PATH}
            stroke={fillColor}
            strokeWidth={14}
            strokeLinecap="round"
            fill="none"
            strokeDasharray={`${ARC_LENGTH} ${ARC_LENGTH}`}
            animatedProps={fillAnimProps}
          />
        )}

        {/* Radial Min threshold tick inside stroke */}
        <Line
          x1={minTick.x1}
          y1={minTick.y1}
          x2={minTick.x2}
          y2={minTick.y2}
          stroke={colors.palette.forest}
          strokeWidth={2.5}
          strokeLinecap="round"
        />

        {/* Radial Max threshold tick inside stroke */}
        <Line
          x1={maxTick.x1}
          y1={maxTick.y1}
          x2={maxTick.x2}
          y2={maxTick.y2}
          stroke={colors.palette.forest}
          strokeWidth={2.5}
          strokeLinecap="round"
        />
      </Svg>

      {/* Center value: single clean baseline without negative margins */}
      <View style={[styles.centerLabel, { width: size, height: size }]}>
        <View style={styles.valueRow}>
          <Text style={[styles.mainValue, { color: colors.palette.ink }]}>
            {clampedMoisture !== null ? clampedMoisture : '—'}
          </Text>
          {clampedMoisture !== null && (
            <Text style={[styles.unit, { color: colors.palette.sage }]}>%</Text>
          )}
        </View>
        <Text style={[styles.subLabel, { color: colors.palette.sage }]}>
          moisture
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  centerLabel: {
    position: 'absolute',
    top: 0,
    left: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
  },
  mainValue: {
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -1,
  },
  unit: {
    fontSize: 15,
    fontWeight: '700',
    marginLeft: 2,
  },
  subLabel: {
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 0.5,
    marginTop: 2,
    textTransform: 'uppercase',
  },
});
