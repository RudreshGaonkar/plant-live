import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Svg, {
  Path,
  Line,
  Circle as SvgCircle,
  Defs,
  LinearGradient,
  Stop,
} from 'react-native-svg';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { WaterLog } from '@/store/useLiveDevice';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_PADDING = 16;
export const CHART_WIDTH = SCREEN_WIDTH - CHART_PADDING * 2 - 32;
export const CHART_HEIGHT = 170;

export type ChartMetricKey = 'moisture' | 'temp' | 'humidity' | 'light';

export interface ChartDataPoint {
  x: number;
  y: number;
  ts: number;
  val: number;
  isWater?: boolean;
  waterLog?: WaterLog;
}

interface TelemetryChartProps {
  points: ChartDataPoint[];
  activeMetric: ChartMetricKey;
  onMetricChange: (metric: ChartMetricKey) => void;
  availableMetrics: ChartMetricKey[];
  unit: string;
  minThreshold?: number;
  maxThreshold?: number;
  scrubIndex: number | null;
  onScrubIndexChange: (index: number | null) => void;
  tempUnitLabel?: string;
}

const METRIC_METADATA: Record<
  ChartMetricKey,
  { label: string; color: string; fillGradient: [string, string]; icon: keyof typeof Ionicons.glyphMap; max: number }
> = {
  moisture: {
    label: 'Soil Moisture',
    color: '#5A8A5C',
    fillGradient: ['#5A8A5C', '#AEE09A'],
    icon: 'leaf-outline',
    max: 100,
  },
  temp: {
    label: 'Temperature',
    color: '#E28743',
    fillGradient: ['#E28743', '#F8D7DA'],
    icon: 'thermometer-outline',
    max: 50,
  },
  humidity: {
    label: 'Air Humidity',
    color: '#4A90E2',
    fillGradient: ['#4A90E2', '#AEE09A'],
    icon: 'water-outline',
    max: 100,
  },
  light: {
    label: 'Sunlight',
    color: '#E5A93C',
    fillGradient: ['#E5A93C', '#CEEA9F'],
    icon: 'sunny-outline',
    max: 100,
  },
};

/**
 * Builds SVG smooth curve path and closed area path.
 */
function generateSvgPaths(points: ChartDataPoint[], height: number): { linePath: string; areaPath: string } {
  if (points.length < 2) {
    return { linePath: '', areaPath: '' };
  }

  let linePath = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const cx = (prev.x + curr.x) / 2;
    linePath += ` C ${cx} ${prev.y}, ${cx} ${curr.y}, ${curr.x} ${curr.y}`;
  }

  const last = points[points.length - 1];
  const first = points[0];
  const areaPath = `${linePath} L ${last.x} ${height} L ${first.x} ${height} Z`;

  return { linePath, areaPath };
}

export function TelemetryChart({
  points,
  activeMetric,
  onMetricChange,
  availableMetrics,
  unit,
  minThreshold,
  maxThreshold,
  scrubIndex,
  onScrubIndexChange,
}: TelemetryChartProps) {
  const { colors, radii } = useAppTheme();
  const meta = METRIC_METADATA[activeMetric];

  const { linePath, areaPath } = React.useMemo(
    () => generateSvgPaths(points, CHART_HEIGHT),
    [points]
  );

  const waterPoints = React.useMemo(
    () => points.filter((p) => p.isWater && p.waterLog),
    [points]
  );

  const activePoint =
    scrubIndex !== null && scrubIndex >= 0 && scrubIndex < points.length
      ? points[scrubIndex]
      : points[points.length - 1] ?? null;

  return (
    <View style={styles.container}>
      {/* ── Metric Switcher Row ────────────────────────────── */}
      <View style={styles.metricSwitcherRow}>
        {availableMetrics.map((key) => {
          const m = METRIC_METADATA[key];
          const isActive = activeMetric === key;
          return (
            <TouchableOpacity
              key={key}
              onPress={() => {
                onMetricChange(key);
                onScrubIndexChange(null);
              }}
              style={[
                styles.metricTab,
                {
                  backgroundColor: isActive ? m.color : colors.palette.white,
                  borderColor: isActive ? m.color : colors.border,
                  borderRadius: radii.full,
                },
              ]}
              activeOpacity={0.8}
            >
              <Ionicons
                name={m.icon}
                size={13}
                color={isActive ? colors.palette.white : colors.palette.sage}
              />
              <Text
                style={[
                  styles.metricTabText,
                  {
                    color: isActive ? colors.palette.white : colors.palette.sage,
                  },
                ]}
              >
                {m.label.split(' ')[0]}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── Main Chart Card ─────────────────────────────────── */}
      <View
        style={[
          styles.chartCard,
          {
            backgroundColor: colors.palette.white,
            borderRadius: radii.card,
            borderColor: colors.border,
          },
        ]}
      >
        {/* Metric Header & Live/Scrubbed readout */}
        <View style={styles.headerRow}>
          <View>
            <Text style={[styles.metricTitle, { color: colors.text }]}>
              {meta.label}
            </Text>
            <Text style={[styles.metricTime, { color: colors.textMuted }]}>
              {activePoint
                ? new Date(activePoint.ts).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: true,
                  })
                : 'Live'}
            </Text>
          </View>

          <View style={styles.valueRow}>
            <Text style={[styles.currentValueText, { color: meta.color }]}>
              {activePoint ? Math.round(activePoint.val) : '--'}
            </Text>
            <Text style={[styles.unitText, { color: meta.color }]}>{unit}</Text>
          </View>
        </View>

        {/* Droplet Event Callout if scrubbed point or nearby point was a watering event */}
        {activePoint?.waterLog && (
          <View
            style={[
              styles.waterEventPill,
              {
                backgroundColor: `${colors.palette.forest}15`,
                borderRadius: radii.md,
                borderColor: `${colors.palette.forest}30`,
              },
            ]}
          >
            <Ionicons name="water" size={14} color={colors.palette.forest} />
            <Text style={[styles.waterEventText, { color: colors.palette.forest }]}>
              Watered {activePoint.waterLog.durationSec}s ·{' '}
              {activePoint.waterLog.moistureBefore}% →{' '}
              {activePoint.waterLog.moistureAfter}% (+
              {activePoint.waterLog.moistureAfter - activePoint.waterLog.moistureBefore}
              %)
            </Text>
          </View>
        )}

        {/* ── SVG Chart Viewport ─────────────────────────────── */}
        <View style={styles.svgWrapper}>
          <Svg width={CHART_WIDTH} height={CHART_HEIGHT}>
            <Defs>
              <LinearGradient id="chartGradient" x1="0" y1="0" x2="0" y2="1">
                <Stop offset="0%" stopColor={meta.fillGradient[0]} stopOpacity="0.32" />
                <Stop offset="100%" stopColor={meta.fillGradient[1]} stopOpacity="0.02" />
              </LinearGradient>
            </Defs>

            {/* Background horizontal grid lines */}
            {[0.25, 0.5, 0.75].map((frac, idx) => (
              <Line
                key={idx}
                x1={0}
                y1={CHART_HEIGHT * frac}
                x2={CHART_WIDTH}
                y2={CHART_HEIGHT * frac}
                stroke={`${colors.palette.sage}20`}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ))}

            {/* Threshold Reference Lines (Moisture only) */}
            {activeMetric === 'moisture' && minThreshold !== undefined && (
              <Line
                x1={0}
                y1={CHART_HEIGHT - (minThreshold / 100) * CHART_HEIGHT}
                x2={CHART_WIDTH}
                y2={CHART_HEIGHT - (minThreshold / 100) * CHART_HEIGHT}
                stroke={colors.palette.warningBorder}
                strokeWidth={1.5}
                strokeDasharray="5 3"
              />
            )}
            {activeMetric === 'moisture' && maxThreshold !== undefined && (
              <Line
                x1={0}
                y1={CHART_HEIGHT - (maxThreshold / 100) * CHART_HEIGHT}
                x2={CHART_WIDTH}
                y2={CHART_HEIGHT - (maxThreshold / 100) * CHART_HEIGHT}
                stroke={colors.palette.forest}
                strokeWidth={1.5}
                strokeDasharray="5 3"
              />
            )}

            {/* Area fill beneath line */}
            {areaPath ? <Path d={areaPath} fill="url(#chartGradient)" /> : null}

            {/* Main curved line */}
            {linePath ? (
              <Path
                d={linePath}
                stroke={meta.color}
                strokeWidth={2.8}
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            ) : null}

            {/* Watering Droplet Event Markers */}
            {activeMetric === 'moisture' &&
              waterPoints.map((p, i) => (
                <React.Fragment key={`drop-${i}`}>
                  {/* Outer pulse aura */}
                  <SvgCircle
                    cx={p.x}
                    cy={p.y}
                    r={9}
                    fill={`${colors.palette.forest}25`}
                  />
                  {/* Inner droplet marker */}
                  <SvgCircle
                    cx={p.x}
                    cy={p.y}
                    r={5}
                    fill={colors.palette.forest}
                    stroke={colors.palette.white}
                    strokeWidth={1.5}
                  />
                </React.Fragment>
              ))}

            {/* Interactive Vertical Scrubber Crosshair Line */}
            {activePoint && (
              <>
                <Line
                  x1={activePoint.x}
                  y1={0}
                  x2={activePoint.x}
                  y2={CHART_HEIGHT}
                  stroke={colors.palette.forest}
                  strokeWidth={1.5}
                  strokeDasharray="3 3"
                />
                <SvgCircle
                  cx={activePoint.x}
                  cy={activePoint.y}
                  r={6}
                  fill={meta.color}
                  stroke={colors.palette.white}
                  strokeWidth={2}
                />
              </>
            )}
          </Svg>
        </View>

        {/* ── Chart Legend / Thresholds Footer ───────────────── */}
        <View style={styles.legendContainer}>
          {activeMetric === 'moisture' && (
            <>
              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendIndicator,
                    { backgroundColor: colors.palette.warningBorder },
                  ]}
                />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>
                  Min ({minThreshold ?? 30}%)
                </Text>
              </View>

              <View style={styles.legendItem}>
                <View
                  style={[
                    styles.legendIndicator,
                    { backgroundColor: colors.palette.forest },
                  ]}
                />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>
                  Max ({maxThreshold ?? 60}%)
                </Text>
              </View>

              <View style={styles.legendItem}>
                <Ionicons name="water" size={11} color={colors.palette.forest} />
                <Text style={[styles.legendText, { color: colors.palette.forest }]}>
                  Watering Event
                </Text>
              </View>
            </>
          )}

          {activeMetric !== 'moisture' && (
            <Text style={[styles.legendText, { color: colors.textMuted }]}>
              Scrub ribbon above to explore past data points
            </Text>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 20,
  },
  metricSwitcherRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  metricTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
  },
  metricTabText: {
    fontSize: 12,
    fontWeight: '700',
  },
  chartCard: {
    padding: 16,
    borderWidth: 1,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  metricTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  metricTime: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  valueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  currentValueText: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  unitText: {
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 2,
  },
  waterEventPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    marginBottom: 10,
  },
  waterEventText: {
    fontSize: 12,
    fontWeight: '600',
  },
  svgWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  legendContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0F4EC',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  legendIndicator: {
    width: 10,
    height: 3,
    borderRadius: 1.5,
  },
  legendText: {
    fontSize: 11,
    fontWeight: '600',
  },
});
