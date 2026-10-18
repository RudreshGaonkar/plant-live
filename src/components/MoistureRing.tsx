/**
 * MoistureRing
 * Large circular SVG moisture indicator with:
 * - Animated arc fill from 0% to soilMoisture%
 * - Min/max threshold tick marks on the ring
 * - Count-up number animation in the center
 * - Color: sage track → mint fill; blush if below min, lime if above max
 * uiLayout.md Section 3 – Layer 5 Peek content
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedProps,
  useAnimatedStyle,
  withTiming,
  Easing,
  useDerivedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  G,
  Line,
  Text as SvgText,
} from 'react-native-svg';
import { useAppTheme } from '@/theme';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

interface MoistureRingProps {
  soilMoisture: number; // 0–100
  moistureMin: number;
  moistureMax: number;
  size?: number;
}

const STROKE_WIDTH = 14;
const GAP_DEGREES = 50; // degrees of gap at the bottom

export function MoistureRing({
  soilMoisture,
  moistureMin,
  moistureMax,
  size = 140,
}: MoistureRingProps) {
  const { colors } = useAppTheme();

  const radius = (size - STROKE_WIDTH * 2) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  // Arc spans (360 - GAP) degrees
  const arcRatio = (360 - GAP_DEGREES) / 360;
  const arcLength = circumference * arcRatio;

  // Rotation offset so the gap sits at the bottom
  const rotationDeg = 90 + GAP_DEGREES / 2;

  // Animated fill progress
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.value = withTiming(soilMoisture / 100, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [soilMoisture, progress]);

  // StrokeDashoffset: 0 = fully filled, arcLength = empty
  const fillAnimProps = useAnimatedProps(() => {
    const fillOffset = arcLength * (1 - progress.value * arcRatio);
    return {
      strokeDashoffset: fillOffset,
    };
  });

  // Determine fill color based on thresholds
  const isBelowMin = soilMoisture < moistureMin;
  const isAboveMax = soilMoisture > moistureMax;
  const fillColor = isBelowMin
    ? colors.palette.warningBorder
    : isAboveMax
    ? colors.palette.sage
    : colors.palette.mint;

  // Tick mark positions (min and max threshold marks)
  const degreesToXY = (percent: number) => {
    const pct = percent / 100;
    const clampedArc = arcRatio;
    const angleRad =
      ((rotationDeg + pct * (360 - GAP_DEGREES)) * Math.PI) / 180;
    return {
      x: cx + radius * Math.cos(angleRad),
      y: cy + radius * Math.sin(angleRad),
    };
  };

  const minTick = degreesToXY(moistureMin);
  const maxTick = degreesToXY(moistureMax);

  // Animated count-up label
  const displayValue = useDerivedValue(() =>
    Math.round(progress.value * 100)
  );

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        {/* Background track */}
        <Circle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={`${colors.palette.sage}40`}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeDasharray={`${arcLength} ${circumference}`}
          strokeDashoffset={0}
          strokeLinecap="round"
          rotation={rotationDeg}
          origin={`${cx}, ${cy}`}
        />

        {/* Animated fill arc */}
        <AnimatedCircle
          cx={cx}
          cy={cy}
          r={radius}
          stroke={fillColor}
          strokeWidth={STROKE_WIDTH}
          fill="none"
          strokeDasharray={`${arcLength} ${circumference}`}
          animatedProps={fillAnimProps}
          strokeLinecap="round"
          rotation={rotationDeg}
          origin={`${cx}, ${cy}`}
        />

        {/* Min threshold tick */}
        <G>
          <Line
            x1={minTick.x - 4}
            y1={minTick.y - 4}
            x2={minTick.x + 4}
            y2={minTick.y + 4}
            stroke={colors.palette.forest}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </G>

        {/* Max threshold tick */}
        <G>
          <Line
            x1={maxTick.x - 4}
            y1={maxTick.y - 4}
            x2={maxTick.x + 4}
            y2={maxTick.y + 4}
            stroke={colors.palette.forest}
            strokeWidth={2.5}
            strokeLinecap="round"
          />
        </G>
      </Svg>

      {/* Center value */}
      <View style={[styles.centerLabel, { width: size, height: size }]}>
        <Text style={[styles.mainValue, { color: colors.palette.ink }]}>
          {soilMoisture}
        </Text>
        <Text style={[styles.unit, { color: colors.palette.sage }]}>%</Text>
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
  mainValue: {
    fontSize: 40,
    fontWeight: '800',
    letterSpacing: -1,
    lineHeight: 44,
  },
  unit: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: -6,
  },
  subLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 0.5,
    marginTop: 2,
  },
});
