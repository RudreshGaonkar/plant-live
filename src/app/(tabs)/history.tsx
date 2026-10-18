/**
 * Insights Screen – "Day Ribbon"
 * - Horizontal 24h/7d scrub ribbon with draggable time cursor
 * - One big chart area with Moisture/Temp/Humidity metric switcher
 * - "What happened" timeline with event cards
 * - Swipeable insight cards carousel
 * uiLayout.md Section 5
 */
import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Polyline, Line, Circle as SvgCircle, Text as SvgText } from 'react-native-svg';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { useLiveDevice, WaterLog } from '@/store/useLiveDevice';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CHART_PADDING = 16;
const CHART_W = SCREEN_WIDTH - CHART_PADDING * 2 - 32;
const CHART_H = 160;

type MetricKey = 'moisture' | 'temp' | 'humidity';
type TimeWindow = '24h' | '7d';

const METRIC_CONFIG: Record<MetricKey, {
  label: string;
  unit: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
  max: number;
}> = {
  moisture: { label: 'Moisture', unit: '%', color: '#5A8A5C', icon: 'leaf-outline', max: 100 },
  temp: { label: 'Temperature', unit: '°C', color: '#AEE09A', icon: 'thermometer-outline', max: 50 },
  humidity: { label: 'Humidity', unit: '%', color: '#80B07F', icon: 'water-outline', max: 100 },
};

// Generate synthetic sparkline data from water logs + current telemetry
function buildChartPoints(
  waterLogs: WaterLog[],
  currentValue: number,
  metric: MetricKey,
  windowHours: number
): { x: number; y: number; isWater: boolean }[] {
  const now = Date.now();
  const windowMs = windowHours * 3600000;
  const relevantLogs = waterLogs
    .filter((l) => now - l.ts < windowMs)
    .sort((a, b) => a.ts - b.ts);

  const points: { ts: number; val: number; isWater: boolean }[] = [];

  // Synthesize data from logs
  relevantLogs.forEach((log) => {
    if (metric === 'moisture') {
      points.push({ ts: log.ts - 60000, val: log.moistureBefore, isWater: false });
      points.push({ ts: log.ts, val: log.moistureAfter, isWater: true });
    }
  });

  // Add current value at now
  const currentVal =
    metric === 'moisture'
      ? currentValue
      : metric === 'temp'
      ? currentValue
      : currentValue;
  points.push({ ts: now, val: currentVal, isWater: false });

  if (points.length < 2) {
    // Add synthetic start point
    points.unshift({ ts: now - windowMs, val: currentVal * 0.85, isWater: false });
  }

  const oldest = now - windowMs;
  const span = windowMs;

  return points.map((p) => ({
    x: ((p.ts - oldest) / span) * CHART_W,
    y: CHART_H - (Math.min(p.val, METRIC_CONFIG[metric].max) / METRIC_CONFIG[metric].max) * CHART_H,
    isWater: p.isWater,
  }));
}

export default function HistoryScreen() {
  const { colors, radii, spacing } = useAppTheme();
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const waterLogs = useLiveDevice((s) => s.waterLogs);

  const [activeMetric, setActiveMetric] = useState<MetricKey>('moisture');
  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');

  // Ribbon cursor position (0 = oldest, 1 = newest)
  const ribbonPos = useSharedValue(1.0);
  const [cursorLabel, setCursorLabel] = useState('Now');
  const ribbonWidth = CHART_W;
  const ribbonStartPos = useSharedValue(1.0);

  const ribbonGesture = Gesture.Pan()
    .onStart(() => {
      ribbonStartPos.value = ribbonPos.value;
    })
    .onUpdate((event) => {
      const next = ribbonStartPos.value + event.translationX / ribbonWidth;
      ribbonPos.value = Math.max(0, Math.min(1, next));
      const hoursBack = (1 - ribbonPos.value) * (timeWindow === '24h' ? 24 : 168);
      const label = hoursBack < 1
        ? `${Math.round(hoursBack * 60)}m ago`
        : `${Math.round(hoursBack)}h ago`;
      runOnJS(setCursorLabel)(ribbonPos.value >= 0.99 ? 'Now' : label);
    });

  const cursorAnimStyle = useAnimatedStyle(() => ({
    left: ribbonPos.value * ribbonWidth - 10,
  }));

  if (!device) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <View style={styles.emptyWrapper}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No device connected.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  const { telemetry, config } = device;
  const windowHours = timeWindow === '24h' ? 24 : 168;

  const metricCurrentValue =
    activeMetric === 'moisture'
      ? telemetry.soilMoisture
      : activeMetric === 'temp'
      ? telemetry.temperature
      : telemetry.humidity;

  const chartPoints = buildChartPoints(waterLogs, metricCurrentValue, activeMetric, windowHours);
  const polylineStr = chartPoints.map((p) => `${p.x},${p.y}`).join(' ');
  const waterPoints = chartPoints.filter((p) => p.isWater);

  const metricCfg = METRIC_CONFIG[activeMetric];

  // Insight cards
  const insights = [
    {
      id: '1',
      icon: 'bulb-outline' as const,
      text:
        telemetry.humidity > config.thresholds.humidityMax
          ? 'High humidity is slowing soil drying — auto-watering has been cautious.'
          : 'Conditions have been optimal for growth over the past 24 hours.',
      bg: `${colors.palette.lime}60`,
    },
    {
      id: '2',
      icon: 'analytics-outline' as const,
      text: `${waterLogs.length} watering events logged. Average moisture rise: ${waterLogs.length > 0 ? Math.round(waterLogs.reduce((s, l) => s + (l.moistureAfter - l.moistureBefore), 0) / waterLogs.length) : 0}%.`,
      bg: `${colors.palette.mint}50`,
    },
    {
      id: '3',
      icon: 'thermometer-outline' as const,
      text: `Temperature has stayed within ${config.thresholds.tempMax}°C limit. Plant stress risk: Low.`,
      bg: `${colors.palette.blush}40`,
    },
  ];

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.container, { padding: spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        <Text style={[styles.title, { color: colors.text }]}>Insights</Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Moisture balance &amp; telemetry history
        </Text>

        {/* ── Time Window Toggle ──────────────────────────────── */}
        <View
          style={[
            styles.toggleRow,
            {
              backgroundColor: colors.palette.mist,
              borderRadius: radii.md,
            },
          ]}
        >
          {(['24h', '7d'] as TimeWindow[]).map((tw) => (
            <TouchableOpacity
              key={tw}
              onPress={() => setTimeWindow(tw)}
              style={[
                styles.toggleBtn,
                {
                  backgroundColor:
                    timeWindow === tw
                      ? colors.palette.forest
                      : 'transparent',
                  borderRadius: radii.md - 2,
                },
              ]}
              accessibilityLabel={`View ${tw} window`}
            >
              <Text
                style={[
                  styles.toggleBtnText,
                  {
                    color:
                      timeWindow === tw
                        ? colors.palette.white
                        : colors.palette.sage,
                  },
                ]}
              >
                {tw === '24h' ? 'Past 24 Hours' : '7-Day Trend'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* ── Day Ribbon scrub ────────────────────────────────── */}
        <View
          style={[
            styles.ribbonWrapper,
            {
              backgroundColor: colors.palette.white,
              borderRadius: radii.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.ribbonTrack}>
            {/* Hour tick marks */}
            {Array.from({ length: timeWindow === '24h' ? 7 : 8 }, (_, i) => (
              <View
                key={i}
                style={[
                  styles.ribbonTick,
                  { backgroundColor: `${colors.palette.sage}40` },
                ]}
              />
            ))}

            {/* Drag cursor */}
            <GestureDetector gesture={ribbonGesture}>
              <Animated.View
                style={[
                  styles.ribbonCursor,
                  {
                    backgroundColor: colors.palette.forest,
                    borderRadius: 10,
                  },
                  cursorAnimStyle,
                ]}
              />
            </GestureDetector>
          </View>

          <View style={styles.ribbonLabels}>
            <Text style={[styles.ribbonLabelEnd, { color: colors.textMuted }]}>
              {timeWindow === '24h' ? '24h ago' : '7 days ago'}
            </Text>
            <Text
              style={[styles.ribbonLabelCenter, { color: colors.palette.forest }]}
            >
              {cursorLabel}
            </Text>
            <Text style={[styles.ribbonLabelEnd, { color: colors.textMuted }]}>
              Now
            </Text>
          </View>
        </View>

        {/* ── Metric Switcher Chips ─────────────────────────── */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.metricChips}
          contentContainerStyle={{ gap: 8 }}
        >
          {(Object.keys(METRIC_CONFIG) as MetricKey[]).map((mk) => {
            const cfg = METRIC_CONFIG[mk];
            const isActive = activeMetric === mk;
            return (
              <TouchableOpacity
                key={mk}
                onPress={() => setActiveMetric(mk)}
                style={[
                  styles.metricChip,
                  {
                    backgroundColor: isActive
                      ? colors.palette.forest
                      : colors.palette.white,
                    borderRadius: radii.full,
                    borderColor: isActive
                      ? colors.palette.forest
                      : colors.border,
                  },
                ]}
                accessibilityLabel={`View ${cfg.label} chart`}
              >
                <Ionicons
                  name={cfg.icon}
                  size={14}
                  color={isActive ? colors.palette.white : colors.palette.sage}
                />
                <Text
                  style={[
                    styles.metricChipText,
                    {
                      color: isActive
                        ? colors.palette.white
                        : colors.palette.sage,
                    },
                  ]}
                >
                  {cfg.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* ── Chart area ──────────────────────────────────────── */}
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
          <View style={styles.chartHeader}>
            <Text style={[styles.chartMetricLabel, { color: colors.text }]}>
              {metricCfg.label}
            </Text>
            <Text style={[styles.chartCurrentValue, { color: metricCfg.color }]}>
              {metricCurrentValue}{metricCfg.unit}
            </Text>
          </View>

          <Svg width={CHART_W} height={CHART_H}>
            {/* Horizontal grid lines */}
            {[0.25, 0.5, 0.75].map((frac, i) => (
              <Line
                key={i}
                x1={0}
                y1={CHART_H * frac}
                x2={CHART_W}
                y2={CHART_H * frac}
                stroke={`${colors.palette.sage}25`}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
            ))}

            {/* Threshold lines (only for moisture) */}
            {activeMetric === 'moisture' && (
              <>
                <Line
                  x1={0}
                  y1={CHART_H - (config.thresholds.moistureMin / 100) * CHART_H}
                  x2={CHART_W}
                  y2={CHART_H - (config.thresholds.moistureMin / 100) * CHART_H}
                  stroke={colors.palette.warningBorder}
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                />
                <Line
                  x1={0}
                  y1={CHART_H - (config.thresholds.moistureMax / 100) * CHART_H}
                  x2={CHART_W}
                  y2={CHART_H - (config.thresholds.moistureMax / 100) * CHART_H}
                  stroke={colors.palette.forest}
                  strokeWidth={1.5}
                  strokeDasharray="6 3"
                />
              </>
            )}

            {/* Main line */}
            {chartPoints.length >= 2 && (
              <Polyline
                points={polylineStr}
                fill="none"
                stroke={metricCfg.color}
                strokeWidth={2.5}
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            )}

            {/* Water event droplet markers */}
            {waterPoints.map((p, i) => (
              <SvgCircle
                key={i}
                cx={p.x}
                cy={p.y}
                r={5}
                fill={colors.palette.forest}
                stroke={colors.palette.white}
                strokeWidth={1.5}
              />
            ))}
          </Svg>

          <View style={styles.chartFooter}>
            {activeMetric === 'moisture' && (
              <View style={styles.legendRow}>
                <View style={[styles.legendDot, { backgroundColor: colors.palette.forest }]} />
                <Text style={[styles.legendText, { color: colors.textMuted }]}>Watering events</Text>
              </View>
            )}
          </View>
        </View>

        {/* ── Insight Carousel ─────────────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          Plant Insights
        </Text>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.carouselContent}
        >
          {insights.map((ins) => (
            <View
              key={ins.id}
              style={[
                styles.insightCard,
                {
                  backgroundColor: ins.bg,
                  borderRadius: radii.card,
                  borderColor: colors.border,
                },
              ]}
            >
              <Ionicons
                name={ins.icon}
                size={22}
                color={colors.palette.forest}
              />
              <Text style={[styles.insightText, { color: colors.palette.ink }]}>
                {ins.text}
              </Text>
            </View>
          ))}
        </ScrollView>

        {/* ── What happened timeline ─────────────────────── */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>
          What Happened
        </Text>
        <View style={styles.timeline}>
          {waterLogs.map((log, i) => {
            const isManual = log.trigger === 'manual';
            const isLast = i === waterLogs.length - 1;
            return (
              <View key={log.id} style={styles.timelineItem}>
                {/* Line + dot */}
                <View style={styles.timelineLeft}>
                  <View
                    style={[
                      styles.timelineDot,
                      {
                        backgroundColor: isManual
                          ? colors.palette.sage
                          : colors.palette.forest,
                        borderColor: colors.palette.white,
                      },
                    ]}
                  />
                  {!isLast && (
                    <View
                      style={[
                        styles.timelineLine,
                        { backgroundColor: `${colors.palette.sage}30` },
                      ]}
                    />
                  )}
                </View>

                {/* Event card */}
                <View
                  style={[
                    styles.timelineCard,
                    {
                      backgroundColor: isManual
                        ? `${colors.palette.lime}60`
                        : `${colors.palette.mint}40`,
                      borderRadius: radii.md,
                    },
                  ]}
                >
                  <View style={styles.timelineCardHeader}>
                    <Text
                      style={[styles.timelineTitle, { color: colors.palette.ink }]}
                    >
                      {isManual ? 'Manual water' : 'Auto-water'}
                      {' · '}{log.durationSec}s
                    </Text>
                    <Text
                      style={[styles.timelineTime, { color: colors.palette.sage }]}
                    >
                      {formatTimeAgo(log.ts)}
                    </Text>
                  </View>
                  <Text
                    style={[styles.timelineBody, { color: colors.palette.sage }]}
                  >
                    {log.moistureBefore}% → {log.moistureAfter}%
                    {log.note ? ` · ${log.note}` : ''}
                  </Text>
                </View>
              </View>
            );
          })}

          {waterLogs.length === 0 && (
            <Text style={[styles.emptyText, { color: colors.textMuted }]}>
              No watering events in this window.
            </Text>
          )}
        </View>

        <View style={{ height: 120 }} />
      </ScrollView>
    </SafeAreaView>
  );
}

function formatTimeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const diffH = Math.floor(diffMs / 3600000);
  const diffMin = Math.floor((diffMs % 3600000) / 60000);
  if (diffH > 23) return `${Math.floor(diffH / 24)}d ago`;
  if (diffH > 0) return `${diffH}h ago`;
  if (diffMin > 0) return `${diffMin}m ago`;
  return 'just now';
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  container: { paddingBottom: 20 },
  title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 14, marginBottom: 16 },
  toggleRow: {
    flexDirection: 'row', padding: 4,
    marginBottom: 16,
  },
  toggleBtn: {
    flex: 1, flexDirection: 'row',
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 10, gap: 5,
  },
  toggleBtnText: { fontSize: 13, fontWeight: '700' },
  ribbonWrapper: {
    padding: 14, borderWidth: 1,
    marginBottom: 16,
  },
  ribbonTrack: {
    height: 20, flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    position: 'relative',
    marginBottom: 8,
  },
  ribbonTick: {
    width: 1.5, height: 10, borderRadius: 1,
  },
  ribbonCursor: {
    position: 'absolute', width: 20, height: 20,
    top: 0,
  },
  ribbonLabels: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  ribbonLabelEnd: { fontSize: 10, fontWeight: '500' },
  ribbonLabelCenter: { fontSize: 11, fontWeight: '700' },
  metricChips: { marginBottom: 14 },
  metricChip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 8, gap: 6,
    borderWidth: 1.5,
  },
  metricChipText: { fontSize: 13, fontWeight: '700' },
  chartCard: {
    padding: 16, borderWidth: 1, marginBottom: 20,
  },
  chartHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 14,
  },
  chartMetricLabel: { fontSize: 15, fontWeight: '700' },
  chartCurrentValue: { fontSize: 26, fontWeight: '800' },
  chartFooter: { marginTop: 10 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 11, fontWeight: '500' },
  sectionTitle: {
    fontSize: 18, fontWeight: '700', marginBottom: 12, marginTop: 8,
  },
  carouselContent: { gap: 12, paddingBottom: 4 },
  insightCard: {
    width: 200, padding: 16, gap: 10, borderWidth: 1,
  },
  insightText: { fontSize: 13, fontWeight: '400', lineHeight: 18 },
  timeline: { gap: 0 },
  timelineItem: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  timelineLeft: { alignItems: 'center', width: 16 },
  timelineDot: {
    width: 14, height: 14, borderRadius: 7,
    borderWidth: 2, zIndex: 1,
  },
  timelineLine: { flex: 1, width: 2, marginTop: 2 },
  timelineCard: { flex: 1, padding: 12 },
  timelineCardHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: 4,
  },
  timelineTitle: { fontSize: 13, fontWeight: '700' },
  timelineTime: { fontSize: 11, fontWeight: '500' },
  timelineBody: { fontSize: 12, fontWeight: '400', lineHeight: 16 },
  emptyWrapper: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontSize: 14 },
});
