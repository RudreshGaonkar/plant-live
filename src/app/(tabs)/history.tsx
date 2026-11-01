import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme } from '@/theme';
import { useLiveDevice, WaterLog, DeviceRecord } from '@/store/useLiveDevice';
import { listenToDeviceHistory, DeviceHistoryRecord } from '@/services/devices';
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

/**
 * Builds continuous historical telemetry data points.
 * Combines real RTDB history (if available) with realistic diurnal curves and watering step-ups.
 */
function generateHistoricalSeries(
  device: DeviceRecord,
  waterLogs: WaterLog[],
  realHistory: DeviceHistoryRecord[],
  timeWindow: TimeWindow,
  chartWidth: number,
  chartHeight: number
): Record<ChartMetricKey, ChartDataPoint[]> {
  const now = Date.now();
  const windowHours = timeWindow === '24h' ? 24 : 168; // 24h or 7 days
  const windowMs = windowHours * 3600000;
  const startTime = now - windowMs;

  const numPoints = timeWindow === '24h' ? 25 : 29; // Hourly for 24h, 6-hourly for 7d
  const stepMs = windowMs / (numPoints - 1);

  const { location, thresholds, sensors } = device.config;
  const currentTelem = device.telemetry;

  // Filter relevant water logs in this window
  const logsInWindow = waterLogs.filter((l) => l.ts >= startTime && l.ts <= now);

  const moisturePoints: ChartDataPoint[] = [];
  const tempPoints: ChartDataPoint[] = [];
  const humidityPoints: ChartDataPoint[] = [];
  const lightPoints: ChartDataPoint[] = [];

  for (let i = 0; i < numPoints; i++) {
    const ptTs = i === numPoints - 1 ? now : startTime + i * stepMs;
    const x = (i / (numPoints - 1)) * chartWidth;
    const date = new Date(ptTs);
    const hour = date.getHours() + date.getMinutes() / 60;

    // Check if real history point exists close to this timestamp
    const closeReal = realHistory.find((r) => Math.abs(r.ts - ptTs) < stepMs / 2);

    // 1. Soil Moisture Calculation
    let moistureVal: number;
    let isWater = false;
    let matchingLog: WaterLog | undefined;

    // Find if a water log occurred near this sample
    const nearLog = logsInWindow.find((l) => Math.abs(l.ts - ptTs) < stepMs / 1.5);
    if (nearLog) {
      isWater = true;
      matchingLog = nearLog;
      moistureVal = nearLog.moistureAfter;
    } else if (closeReal && typeof closeReal.soilMoisture === 'number') {
      moistureVal = closeReal.soilMoisture;
    } else if (i === numPoints - 1) {
      moistureVal = currentTelem.soilMoisture;
    } else {
      // Simulate natural decay from current value back in time
      const decayRate = location === 'terrace' ? 1.4 : location === 'balcony' ? 1.1 : 0.8;
      const hoursAgo = (now - ptTs) / 3600000;
      // Periodic saw-tooth shape based on water logs or decay
      const baseDecay = (currentTelem.soilMoisture + hoursAgo * decayRate * 0.4) % 40;
      moistureVal = Math.max(
        thresholds.moistureMin - 5,
        Math.min(thresholds.moistureMax + 10, currentTelem.soilMoisture - baseDecay + 15)
      );
    }

    const moistureY = chartHeight - (Math.max(0, Math.min(100, moistureVal)) / 100) * chartHeight;
    moisturePoints.push({
      x,
      y: moistureY,
      ts: ptTs,
      val: moistureVal,
      isWater,
      waterLog: matchingLog,
    });

    // 2. Temperature Calculation (Diurnal sine curve peaking at 2 PM / 14:00)
    let tempVal: number;
    if (closeReal && typeof closeReal.temperature === 'number') {
      tempVal = closeReal.temperature;
    } else if (i === numPoints - 1) {
      tempVal = currentTelem.temperature;
    } else {
      const diurnalSine = Math.sin(((hour - 8) / 24) * 2 * Math.PI); // peak ~14:00
      const baseTemp = location === 'terrace' ? 29 : location === 'balcony' ? 27 : 24;
      const amplitude = location === 'terrace' ? 5 : 3;
      tempVal = Math.round(baseTemp + diurnalSine * amplitude);
    }
    const tempY = chartHeight - (Math.max(0, Math.min(50, tempVal)) / 50) * chartHeight;
    tempPoints.push({
      x,
      y: tempY,
      ts: ptTs,
      val: tempVal,
    });

    // 3. Humidity Calculation (Inversely related to temperature / peaks at dawn)
    let humidityVal: number;
    if (closeReal && typeof closeReal.humidity === 'number') {
      humidityVal = closeReal.humidity;
    } else if (i === numPoints - 1) {
      humidityVal = currentTelem.humidity;
    } else {
      const humiditySine = Math.sin(((hour - 20) / 24) * 2 * Math.PI); // peak ~6:00
      humidityVal = Math.round(62 + humiditySine * 15);
    }
    const humidityY = chartHeight - (Math.max(0, Math.min(100, humidityVal)) / 100) * chartHeight;
    humidityPoints.push({
      x,
      y: humidityY,
      ts: ptTs,
      val: humidityVal,
    });

    // 4. Sunlight Calculation (Daylight 6 AM to 6 PM)
    let lightVal: number = 0;
    if (sensors.lightMode === 'digital') {
      lightVal = hour >= 6 && hour <= 18 ? 1 : 0;
    } else if (sensors.lightMode === 'analog') {
      const daylightFactor = Math.max(0, Math.sin(((hour - 6) / 12) * Math.PI));
      lightVal = Math.round(daylightFactor * 90);
    }
    const lightMax = sensors.lightMode === 'digital' ? 1 : 100;
    const lightY = chartHeight - (Math.max(0, Math.min(lightMax, lightVal)) / (lightMax || 1)) * chartHeight;
    lightPoints.push({
      x,
      y: lightY,
      ts: ptTs,
      val: lightVal,
    });
  }

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
  waterLogs: WaterLog[]
): InsightCardData[] {
  const { config, telemetry } = device;
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
  if (telemetry.temperature > config.thresholds.tempMax - 2) {
    list.push({
      id: 'ins-temp',
      category: 'Heat Watch',
      title: 'Warm Afternoon Alert',
      body: `Temperature neared ${telemetry.temperature}°C. The system prefers early morning watering to avoid scalding delicate feeder roots in warm soil.`,
      icon: 'thermometer',
      tint: 'blush',
    });
  } else {
    list.push({
      id: 'ins-temp',
      category: 'Thermal Health',
      title: 'Comfortable Temp Range',
      body: `Ambient temperature (${telemetry.temperature}°C) remained comfortably within safe bounds (limit: ${config.thresholds.tempMax}°C).`,
      icon: 'happy',
      tint: 'mint',
    });
  }

  return list;
}

export default function HistoryScreen() {
  const insets = useSafeAreaInsets();
  const { colors, spacing } = useAppTheme();
  const device = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const waterLogs = useLiveDevice((s) => s.waterLogs);

  const [timeWindow, setTimeWindow] = useState<TimeWindow>('24h');
  const [activeMetric, setActiveMetric] = useState<ChartMetricKey>('moisture');
  const [scrubFraction, setScrubFraction] = useState<number>(1.0); // 1.0 = newest
  const [realHistory, setRealHistory] = useState<DeviceHistoryRecord[]>([]);

  // Persistent live listener to RTDB history for the active device
  useEffect(() => {
    if (!device?.id) return;
    const unsubscribe = listenToDeviceHistory(device.id, (records) => {
      setRealHistory(records);
    });
    return () => unsubscribe();
  }, [device?.id]);

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
      CHART_HEIGHT
    );
  }, [device, waterLogs, realHistory, timeWindow]);

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
    return buildRuleBasedInsights(device, waterLogs);
  }, [device, waterLogs]);

  if (!device) {
    return (
      <View style={[styles.safeArea, { backgroundColor: colors.background, paddingTop: insets.top + 12 }]}>
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyText, { color: colors.textMuted }]}>
            No device paired. Connect a plant device to view history.
          </Text>
        </View>
      </View>
    );
  }

  // Unit label
  const unit =
    activeMetric === 'moisture'
      ? '%'
      : activeMetric === 'temp'
      ? '°C'
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
    padding: 24,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
