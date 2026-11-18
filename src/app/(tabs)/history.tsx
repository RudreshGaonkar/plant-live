import { SkeletonLoader } from '@/components/SkeletonLoader';
import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useAppTheme } from '@/theme';
import { useLiveDevice, WaterLog, DeviceRecord } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import { listenToDeviceHistory, listenToWaterLogs, DeviceHistoryRecord } from '@/services/devices';
import { DayRibbon, TimeWindow } from '@/components/DayRibbon';
import {
  TelemetryChart,
  ChartMetricKey,
  ChartDataPoint,
  CHART_WIDTH,
  CHART_HEIGHT,
} from '@/components/TelemetryChart';
import { InsightCardCarousel, InsightCardData } from '@/components/InsightCardCarousel';
import { EventTimeline } from '@/components/EventTimeline';
import { convertTemperature, formatTemperature, getTemperatureUnitLabel } from '@/utils/temperature';

const toDisplayTemp = (tempC: number, unit: 'C' | 'F') => {
  return convertTemperature(tempC, unit);
};

const EMPTY_HISTORY: DeviceHistoryRecord[] = [];
const EMPTY_LOGS: WaterLog[] = [];

/**
 * Builds continuous historical telemetry data points strictly from real RTDB samples.
 * Returns empty arrays when no real samples exist.
 */
function generateHistoricalSeries(
  device: DeviceRecord,
  waterLogs: WaterLog[],
  realHistory: DeviceHistoryRecord[],
  timeWindow: TimeWindow,
  chartWidth: number,
  chartHeight: number,
  tempUnit: 'C' | 'F' = 'C'
): Record<ChartMetricKey, ChartDataPoint[]> {
  const now = Date.now();
  const windowHours = timeWindow === '24h' ? 24 : 168; // 24h or 7 days
  const windowMs = windowHours * 3600000;
  const startTime = now - windowMs;

  const { sensors } = device.config;

  // Filter realHistory to those within the window and sort ascending by ts
  const recordsInWindow = realHistory
    .filter((r) => r.ts >= startTime && r.ts <= now)
    .sort((a, b) => a.ts - b.ts);

  if (recordsInWindow.length === 0) {
    return {
      moisture: [],
      temp: [],
      humidity: [],
      light: [],
    };
  }

  // Filter relevant water logs in this window
  const logsInWindow = waterLogs.filter((l) => l.ts >= startTime && l.ts <= now);

  const moisturePoints: ChartDataPoint[] = [];
  const tempPoints: ChartDataPoint[] = [];
  const humidityPoints: ChartDataPoint[] = [];
  const lightPoints: ChartDataPoint[] = [];

  const minTs = recordsInWindow[0].ts;
  const maxTs = recordsInWindow[recordsInWindow.length - 1].ts;
  const spanTs = maxTs - minTs;

  recordsInWindow.forEach((rec) => {
    const x = recordsInWindow.length === 1 || spanTs === 0
      ? chartWidth / 2
      : ((rec.ts - minTs) / spanTs) * chartWidth;

    const nearLog = logsInWindow.find((l) => Math.abs(l.ts - rec.ts) < 15 * 60 * 1000);

    // 1. Soil Moisture Calculation
    if (typeof rec.soilMoisture === 'number') {
      const moistureVal = rec.soilMoisture;
      const moistureY = chartHeight - (Math.max(0, Math.min(100, moistureVal)) / 100) * chartHeight;
      moisturePoints.push({
        x,
        y: moistureY,
        ts: rec.ts,
        val: moistureVal,
        isWater: Boolean(nearLog),
        waterLog: nearLog,
      });
    }

    // 2. Temperature Calculation
    if (typeof rec.temperature === 'number') {
      const displayTempVal = toDisplayTemp(rec.temperature, tempUnit);
      const minT = tempUnit === 'F' ? 32 : 0;
      const maxT = tempUnit === 'F' ? 122 : 50;
      const tempY = chartHeight - (Math.max(0, Math.min(maxT - minT, displayTempVal - minT)) / (maxT - minT)) * chartHeight;
      tempPoints.push({
        x,
        y: tempY,
        ts: rec.ts,
        val: displayTempVal,
      });
    }

    // 3. Humidity Calculation
    if (typeof rec.humidity === 'number') {
      const humidityVal = rec.humidity;
      const humidityY = chartHeight - (Math.max(0, Math.min(100, humidityVal)) / 100) * chartHeight;
      humidityPoints.push({
        x,
        y: humidityY,
        ts: rec.ts,
        val: humidityVal,
      });
    }

    // 4. Sunlight Calculation
    if (typeof rec.light === 'number') {
      const lightVal = rec.light;
      const lightMax = sensors.lightMode === 'digital' ? 1 : 100;
      const lightY = chartHeight - (Math.max(0, Math.min(lightMax, lightVal)) / (lightMax || 1)) * chartHeight;
      lightPoints.push({
        x,
        y: lightY,
        ts: rec.ts,
        val: lightVal,
      });
    }
  });

  return {
    moisture: moisturePoints,
    temp: tempPoints,
    humidity: humidityPoints,
    light: lightPoints,
  };
}

/**
 * Builds Plain-Language rule-based summary insights from telemetry and device configuration.
 */
function buildRuleBasedInsights(
  device: DeviceRecord,
  waterLogs: WaterLog[],
  tempUnit: 'C' | 'F' = 'C'
): InsightCardData[] {
  const { config, telemetry } = device;
  if (!telemetry) return [];
  const plantName = config.plantName || config.name || 'Your plant';
  const location = config.location;
  const list: InsightCardData[] = [];

  // Insight 1: Weather & Humidity Guard
  if (telemetry.humidity > config.thresholds.humidityMax || telemetry.humidity > 75) {
    list.push({
      id: 'ins-humidity',
      category: 'Weather Guard',
      title: 'High Humidity Protected',
      body: `Coastal air humidity (${telemetry.humidity}%) slowed natural evaporation. Auto-watering cycles pause accordingly to prevent soggy soil and fungal root rot.`,
      icon: 'shield-checkmark',
      tint: 'lime',
    });
  } else {
    list.push({
      id: 'ins-humidity-normal',
      category: 'Climate Balance',
      title: 'Favorable Transpiration',
      body: `Humidity at ${telemetry.humidity}% provides an ideal transpiration balance for ${plantName}, avoiding dry leaf tips.`,
      icon: 'leaf',
      tint: 'mint',
    });
  }

  // Insight 2: Location Micro-Climate
  if (location === 'terrace') {
    list.push({
      id: 'ins-location',
      category: 'Terrace Sun & Wind',
      title: 'Accelerated Evaporation',
      body: `Unobstructed terrace sun and wind exposure dries soil ~25% faster than indoors. Ensure water bottle is kept filled for timely morning cycles.`,
      icon: 'sunny',
      tint: 'lime',
    });
  } else if (location === 'balcony') {
    list.push({
      id: 'ins-location',
      category: 'Balcony Comfort',
      title: 'Filtered Sunlight Growth',
      body: `Balcony railing partial shade protects ${plantName} from peak midday scorch while providing ample indirect lumens.`,
      icon: 'partly-sunny',
      tint: 'mint',
    });
  } else {
    list.push({
      id: 'ins-location',
      category: 'Indoor Stability',
      title: 'Steady Indoor Microclimate',
      body: `Indoor placement shields ${plantName} from harsh outdoor temperature swings, keeping moisture retention exceptionally steady.`,
      icon: 'home',
      tint: 'forest',
    });
  }

  // Insight 3: Absorption & Watering Efficiency
  if (waterLogs.length > 0) {
    const totalGains = waterLogs.reduce(
      (acc, l) => acc + Math.max(0, l.moistureAfter - l.moistureBefore),
      0
    );
    const avgGain = Math.round(totalGains / waterLogs.length);
    list.push({
      id: 'ins-watering',
      category: 'Absorption Metrics',
      title: `+${avgGain}% Average Moisture Gain`,
      body: `${waterLogs.length} pump cycles logged. Soil responds effectively within 5 minutes, showing healthy pot drainage and root permeability.`,
      icon: 'water',
      tint: 'mint',
    });
  }

  // Insight 4: Temperature Safety Zone
  const displayCurrentTemp = formatTemperature(telemetry.temperature, tempUnit);
  const displayMaxTemp = formatTemperature(config.thresholds.tempMax, tempUnit);
  if (telemetry.temperature > config.thresholds.tempMax - 2) {
    list.push({
      id: 'ins-temp',
      category: 'Heat Watch',
      title: 'Warm Afternoon Alert',
      body: `Temperature neared ${displayCurrentTemp}. The system prefers early morning watering to avoid scalding delicate feeder roots in warm soil.`,
      icon: 'thermometer',
      tint: 'blush',
    });
  } else {
    list.push({
      id: 'ins-temp',
      category: 'Thermal Health',
      title: 'Comfortable Temp Range',
      body: `Ambient temperature (${displayCurrentTemp}) remained comfortably within safe bounds (limit: ${displayMaxTemp}).`,
      icon: 'happy',
      tint: 'mint',
    });
  }

  return list;
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, radii, spacing } = useAppTheme();
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const uid = useSession((state) => state.user?.uid);
  const deviceId = device?.id;
  const tempUnit = useSession((s) => s.prefs.units);

  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');
  const [activeMetric, setActiveMetric] = useState<ChartMetricKey>('moisture');
  const [scrubFraction, setScrubFraction] = useState<number>(1.0); // 1.0 = newest
  const scope = JSON.stringify([uid, deviceId]);
  const [historyByScope, setHistoryByScope] = useState<Record<string, {
    status: 'ready' | 'empty' | 'error';
    records: DeviceHistoryRecord[];
  }>>({});
  const [logsByScope, setLogsByScope] = useState<Record<string, WaterLog[]>>({});
  const history = historyByScope[scope];
  const realHistory = history?.records ?? EMPTY_HISTORY;
  const waterLogs = logsByScope[scope] ?? EMPTY_LOGS;

  useEffect(() => {
    if (!uid || !deviceId) return;
    let active = true;
    const isCurrent = () => active && useSession.getState().user?.uid === uid &&
      useLiveDevice.getState().activeDeviceId === deviceId;
    const markError = () => {
      if (isCurrent()) setHistoryByScope((previous) => ({
        ...previous, [scope]: { status: 'error', records: previous[scope]?.records ?? EMPTY_HISTORY },
      }));
    };
    const deadline = setTimeout(markError, 8000);
    const stopHistory = listenToDeviceHistory(deviceId, (records) => {
      if (!isCurrent()) return;
      clearTimeout(deadline);
      setHistoryByScope((previous) => ({
        ...previous, [scope]: { status: records.length ? 'ready' : 'empty', records },
      }));
    }, 50, () => {
      clearTimeout(deadline);
      markError();
    });
    const stopLogs = listenToWaterLogs(deviceId, (logs) => {
      if (isCurrent()) setLogsByScope((previous) => ({ ...previous, [scope]: logs }));
    });
    return () => {
      active = false;
      clearTimeout(deadline);
      stopHistory();
      stopLogs();
    };
  }, [uid, deviceId, scope]);

  // Available metrics based on sensors config — hoisted ABOVE early return to satisfy Rules of Hooks
  const availableMetrics: ChartMetricKey[] = useMemo(() => {
    if (!device) return ['moisture', 'temp', 'humidity'] as ChartMetricKey[];
    const list: ChartMetricKey[] = ['moisture', 'temp', 'humidity'];
    if (device.config.sensors.lightMode !== 'none') {
      list.push('light');
    }
    return list;
  }, [device]);

  // Generate series data points
  const seriesMap = useMemo(() => {
    if (!device) return { moisture: [], temp: [], humidity: [], light: [] } as Record<ChartMetricKey, ChartDataPoint[]>;
    return generateHistoricalSeries(
      device,
      waterLogs,
      realHistory,
      timeWindow,
      CHART_WIDTH,
      CHART_HEIGHT,
      tempUnit
    );
  }, [device, waterLogs, realHistory, timeWindow, tempUnit]);

  const currentPoints = seriesMap[activeMetric];

  // Derive scrub index
  const scrubIndex = useMemo(() => {
    if (currentPoints.length === 0) return null;
    const idx = Math.round(scrubFraction * (currentPoints.length - 1));
    return Math.max(0, Math.min(currentPoints.length - 1, idx));
  }, [scrubFraction, currentPoints.length]);

  // Formatted cursor label for DayRibbon
  const cursorLabel = useMemo(() => {
    if (scrubFraction >= 0.98) return 'Live (Now)';
    const hoursBack = (1 - scrubFraction) * (timeWindow === '24h' ? 24 : 168);
    if (hoursBack < 1) {
      return `${Math.max(1, Math.round(hoursBack * 60))}m ago`;
    }
    if (hoursBack < 24) {
      return `${Math.round(hoursBack)}h ago`;
    }
    const daysBack = Math.round(hoursBack / 24);
    return `${daysBack}d ago`;
  }, [scrubFraction, timeWindow]);

  // Rule-based insight cards — hoisted ABOVE early return
  const insights = useMemo(() => {
    if (!device) return [];
    return buildRuleBasedInsights(device, waterLogs, tempUnit);
  }, [device, waterLogs, tempUnit]);

  if (!device) {
    return (
      <View style={[styles.safeArea, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
        <View style={styles.emptyContainer}>
          <View style={[styles.emptyIconWrap, { backgroundColor: colors.palette.lime }]}>
            <Ionicons name="bar-chart-outline" size={56} color={colors.palette.forest} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>
            No Controller Paired
          </Text>
          <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>
            Connect a plant controller to view sensor history and telemetry trends.
          </Text>
          <TouchableOpacity
            style={[
              styles.emptyActionBtn,
              { backgroundColor: colors.palette.forest, borderRadius: radii.full },
            ]}
            onPress={() => router.push('/add-device')}
          >
            <Ionicons name="add-circle-outline" size={18} color="#FFFFFF" style={{ marginRight: 8 }} />
            <Text style={styles.emptyActionBtnText}>Pair Controller</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (!history || (device.configStatus === 'loading' && !device.isConfigHydrated)) {
    return <SkeletonLoader screen="history" />;
  }

  // Unit label
  const unit =
    activeMetric === 'moisture'
      ? '%'
      : activeMetric === 'temp'
      ? getTemperatureUnitLabel(tempUnit)
      : activeMetric === 'humidity'
      ? '%'
      : device.config.sensors.lightMode === 'digital'
      ? ''
      : '%';

  return (
    <View style={[styles.safeArea, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
      <ScrollView
        contentContainerStyle={[styles.contentContainer, { padding: spacing.md, paddingBottom: 120 }]}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Screen Header ────────────────────────────────────── */}
        <View style={styles.header}>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Insights</Text>
          <Text style={[styles.screenSubtitle, { color: colors.textMuted }]}>
            Continuous telemetry scrubbing &amp; event history
          </Text>
        </View>

        {/* ── Day Ribbon Scrubber ──────────────────────────────── */}
        <DayRibbon
          timeWindow={timeWindow}
          onTimeWindowChange={(tw) => {
            setTimeWindow(tw);
            setScrubFraction(1.0); // Reset to live
          }}
          scrubFraction={scrubFraction}
          onScrub={setScrubFraction}
          cursorLabel={cursorLabel}
        />

        {history.status === 'error' && (
          <Text style={{ color: colors.textMuted }}>History is temporarily unavailable.</Text>
        )}

        {/* ── Telemetry Chart Area ─────────────────────────────── */}
        <TelemetryChart
          points={currentPoints}
          activeMetric={activeMetric}
          onMetricChange={setActiveMetric}
          availableMetrics={availableMetrics}
          unit={unit}
          minThreshold={device.config.thresholds.moistureMin}
          maxThreshold={device.config.thresholds.moistureMax}
          scrubIndex={scrubIndex}
          onScrubIndexChange={(idx) => {
            if (idx !== null && currentPoints.length > 1) {
              setScrubFraction(idx / (currentPoints.length - 1));
            }
          }}
        />

        {/* ── Plain-Language Insights Carousel ─────────────────── */}
        <InsightCardCarousel insights={insights} />

        {/* ── Vertical Timeline (Watering & Telemetry Activity) ─────── */}
        <EventTimeline
          waterLogs={waterLogs.slice(0, 8)}
          telemetryHistory={realHistory.slice(0, 8)}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  contentContainer: {},
  header: {
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 28,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  screenSubtitle: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 2,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 96,
    height: 96,
    borderRadius: 48,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 24,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  emptyActionBtnText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
  },
});
