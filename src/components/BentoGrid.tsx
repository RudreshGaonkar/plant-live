/**
 * BentoGrid & BentoTile
 * Asymmetric 2-column metric layout for Vitals Sheet Half snap.
 * Layout:
 *   [Soil Trend (tall, 2 rows)] [Temp  ]
 *                               [Hum   ]
 *   [Sunlight/no-sensor       ] [Insight]
 * uiLayout.md Section 3 – Layer 5, Half content
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import Svg, { Polyline } from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { DeviceConfig, DeviceTelemetry, WaterLog } from '@/store/useLiveDevice';

// ─── BentoTile ───────────────────────────────────────────────────────────────

interface BentoTileProps {
  label: string;
  value: string | number;
  unit?: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  bg: string;
  delta?: number; // vs 1 hour ago
  children?: React.ReactNode;
  style?: object;
}

export function BentoTile({
  label,
  value,
  unit,
  icon,
  iconColor,
  bg,
  delta,
  children,
  style,
}: BentoTileProps) {
  const { colors, radii } = useAppTheme();

  const scale = useSharedValue(0.94);
  useEffect(() => {
    scale.value = withSpring(1, { damping: 15, stiffness: 180 });
  }, [value, scale]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Animated.View
      style={[
        styles.tile,
        {
          backgroundColor: bg,
          borderRadius: radii.tile,
        },
        animStyle,
        style,
      ]}
    >
      <View style={styles.tileHeader}>
        <Ionicons name={icon} size={15} color={iconColor} />
        <Text style={[styles.tileLabel, { color: `${iconColor}BB` }]}>
          {label}
        </Text>
      </View>
      {children ? (
        children
      ) : (
        <View style={styles.tileValueRow}>
          <Text style={[styles.tileValue, { color: colors.palette.ink }]}>
            {value}
          </Text>
          {unit && (
            <Text style={[styles.tileUnit, { color: colors.palette.sage }]}>
              {unit}
            </Text>
          )}
          {delta !== undefined && (
            <View style={styles.deltaRow}>
              <Ionicons
                name={delta >= 0 ? 'arrow-up-outline' : 'arrow-down-outline'}
                size={10}
                color={delta >= 0 ? colors.palette.forest : colors.palette.warningText}
              />
              <Text
                style={[
                  styles.deltaText,
                  {
                    color:
                      delta >= 0
                        ? colors.palette.forest
                        : colors.palette.warningText,
                  },
                ]}
              >
                {Math.abs(delta)}
              </Text>
            </View>
          )}
        </View>
      )}
    </Animated.View>
  );
}

// ─── SoilTrendTile ───────────────────────────────────────────────────────────

interface SoilTrendTileProps {
  waterLogs: WaterLog[];
  currentMoisture: number;
  bg: string;
}

function SoilTrendTile({ waterLogs, currentMoisture, bg }: SoilTrendTileProps) {
  const { colors, radii } = useAppTheme();

  // Build sparkline data from last 8 water log moisture points + current
  const points: { x: number; y: number; isWater: boolean }[] = [];
  const recentLogs = waterLogs.slice(-7);
  const allPoints = [
    ...recentLogs.flatMap((l) => [
      { val: l.moistureBefore, isWater: false },
      { val: l.moistureAfter, isWater: true },
    ]),
    { val: currentMoisture, isWater: false },
  ];

  const W = 120;
  const H = 60;
  const step = allPoints.length > 1 ? W / (allPoints.length - 1) : W;
  allPoints.forEach((p, i) => {
    points.push({
      x: i * step,
      y: H - (p.val / 100) * H,
      isWater: p.isWater,
    });
  });

  const polylinePoints = points.map((p) => `${p.x},${p.y}`).join(' ');

  return (
    <View
      style={[
        styles.soilTrendTile,
        {
          backgroundColor: bg,
          borderRadius: radii.tile,
        },
      ]}
    >
      <View style={styles.tileHeader}>
        <Ionicons name="analytics-outline" size={15} color={colors.palette.forest} />
        <Text style={[styles.tileLabel, { color: `${colors.palette.forest}BB` }]}>
          Soil Trend
        </Text>
      </View>

      {/* Sparkline */}
      <View style={styles.sparklineWrapper}>
        <Svg width={120} height={60}>
          <Polyline
            points={polylinePoints}
            fill="none"
            stroke={colors.palette.sage}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      </View>

      <Text style={[styles.trendNote, { color: colors.palette.sage }]}>
        Last {recentLogs.length} waterings
      </Text>
    </View>
  );
}

// ─── BentoGrid ───────────────────────────────────────────────────────────────

interface BentoGridProps {
  telemetry: DeviceTelemetry;
  config: DeviceConfig;
  waterLogs: WaterLog[];
}

export function BentoGrid({ telemetry, config, waterLogs }: BentoGridProps) {
  const { colors } = useAppTheme();
  const hasLight = config.sensors.lightMode !== 'none';
  const isDigitalLight = config.sensors.lightMode === 'digital';
  const lightValue = isDigitalLight
    ? telemetry.light === 1
      ? 'Bright'
      : 'Dim'
    : `${telemetry.light ?? 0}%`;
  const lightIcon: keyof typeof Ionicons.glyphMap =
    telemetry.light === 1 || (telemetry.light ?? 0) > 50
      ? 'sunny'
      : 'moon-outline';

  return (
    <View style={styles.bentoGrid}>
      {/* Row 1 */}
      <View style={styles.bentoRow}>
        {/* Soil Trend – tall (spans 2 rows visually via minHeight) */}
        <SoilTrendTile
          waterLogs={waterLogs}
          currentMoisture={telemetry.soilMoisture}
          bg={`${colors.palette.lime}80`}
        />

        {/* Right column: Temp + Humidity stacked */}
        <View style={styles.rightCol}>
          <BentoTile
            label="Temperature"
            value={telemetry.temperature}
            unit="°C"
            icon="thermometer-outline"
            iconColor={colors.palette.forest}
            bg={`${colors.palette.mint}70`}
            style={styles.halfTile}
          />
          <BentoTile
            label="Humidity"
            value={telemetry.humidity}
            unit="%"
            icon="water-outline"
            iconColor={colors.palette.sage}
            bg={`${colors.palette.lime}70`}
            style={styles.halfTile}
          />
        </View>
      </View>

      {/* Row 2 */}
      <View style={styles.bentoRow}>
        {/* Sunlight or No-sensor */}
        {hasLight ? (
          <BentoTile
            label="Sunlight"
            value={lightValue}
            icon={lightIcon}
            iconColor={colors.palette.forest}
            bg={`${colors.palette.lime}60`}
            style={styles.halfWidthTile}
          />
        ) : (
          <BentoTile
            label="Sunlight"
            value="No Sensor"
            icon="close-circle-outline"
            iconColor={colors.palette.sage}
            bg={`${colors.palette.white}80`}
            style={styles.halfWidthTile}
          />
        )}

        {/* Insight tile */}
        <BentoTile
          label="Insight"
          value=""
          icon="bulb-outline"
          iconColor={colors.palette.forest}
          bg={`${colors.palette.mint}50`}
          style={styles.halfWidthTile}
        >
          <Text
            style={[styles.insightText, { color: colors.palette.ink }]}
            numberOfLines={3}
          >
            {getInsight(telemetry, config)}
          </Text>
        </BentoTile>
      </View>
    </View>
  );
}

function getInsight(telemetry: DeviceTelemetry, config: DeviceConfig): string {
  if (telemetry.humidity > config.thresholds.humidityMax) {
    return 'Humidity is high — watering delayed to protect roots.';
  }
  if (telemetry.temperature > config.thresholds.tempMax) {
    return 'High temperature detected — check for direct sun exposure.';
  }
  if (telemetry.soilMoisture < config.thresholds.moistureMin + 5) {
    return 'Soil is getting dry — auto-watering will trigger soon.';
  }
  return 'All conditions are optimal for healthy growth.';
}

const styles = StyleSheet.create({
  bentoGrid: {
    gap: 12,
  },
  bentoRow: {
    flexDirection: 'row',
    gap: 12,
  },
  rightCol: {
    flex: 1,
    gap: 12,
  },
  tile: {
    padding: 14,
    flex: 1,
    gap: 6,
  },
  tileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tileLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 0.2,
  },
  tileValueRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
  },
  tileValue: {
    fontSize: 28,
    fontWeight: '800',
    lineHeight: 32,
  },
  tileUnit: {
    fontSize: 14,
    fontWeight: '600',
    paddingBottom: 3,
  },
  deltaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 4,
    marginLeft: 2,
  },
  deltaText: {
    fontSize: 10,
    fontWeight: '700',
  },
  halfTile: {
    flex: 1,
  },
  halfWidthTile: {
    flex: 1,
  },
  soilTrendTile: {
    flex: 1.4,
    padding: 14,
    gap: 8,
  },
  sparklineWrapper: {
    marginTop: 4,
  },
  trendNote: {
    fontSize: 10,
    fontWeight: '500',
  },
  insightText: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
  },
});
