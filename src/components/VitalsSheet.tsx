/**
 * VitalsSheet
 * Draggable bottom sheet with 3 snap points (Peek ~28%, Half ~55%, Full ~90%).
 * - Uses react-native-gesture-handler PanGestureHandler
 * - Large top-left rounded corner (48dp), 28dp general top corner
 * - Peek: MoistureRing + status headline + last watered
 * - Half: Peek + BentoGrid
 * - Full: Half + water log list
 * uiLayout.md Section 3 – Layer 5
 */
import React, { useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
} from 'react-native';
import {
  Gesture,
  GestureDetector,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedReaction,
  withSpring,
  runOnJS,
  SharedValue,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { DeviceRecord, PlantHealthState, WaterLog } from '@/store/useLiveDevice';
import { MoistureRing } from './MoistureRing';
import { BentoGrid } from './BentoGrid';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

// Snap points as % from bottom of screen
const SNAP_PEEK = 0.28;
const SNAP_HALF = 0.55;
const SNAP_FULL = 0.90;

const snapPoints = [
  SCREEN_HEIGHT * (1 - SNAP_FULL),   // y at Full
  SCREEN_HEIGHT * (1 - SNAP_HALF),   // y at Half
  SCREEN_HEIGHT * (1 - SNAP_PEEK),   // y at Peek
];

export type SheetSnap = 'peek' | 'half' | 'full';

interface VitalsSheetProps {
  device: DeviceRecord;
  health: PlantHealthState;
  waterLogs: WaterLog[];
  onSnapChange?: (snap: SheetSnap) => void;
  onTranslateY?: (y: number) => void;
  animatedTranslateY?: SharedValue<number>;
  // Force snap to peek (e.g. when watering starts)
  forceSnap?: SheetSnap;
}

function formatLastWatered(log?: WaterLog): string {
  if (!log) return 'No watering logged yet';
  const diffMs = Date.now() - log.ts;
  const diffH = Math.floor(diffMs / 3600000);
  const diffMin = Math.floor((diffMs % 3600000) / 60000);
  const timeStr =
    diffH > 0
      ? `${diffH}h ${diffMin}m ago`
      : diffMin > 0
      ? `${diffMin}m ago`
      : 'just now';
  return `Last watered ${timeStr}, ${log.trigger}, ${log.moistureBefore}% → ${log.moistureAfter}%`;
}

const STATUS_HEADLINES: Record<PlantHealthState, string> = {
  healthy: 'Healthy',
  thirsty: 'Needs Water',
  overwatered: 'Too Wet',
  unknown: 'Offline',
};

const STATUS_COLORS: Record<PlantHealthState, string> = {
  healthy: '#5A8A5C',
  thirsty: '#C0505E',
  overwatered: '#5A8A5C',
  unknown: '#90A4AE',
};

export function VitalsSheet({
  device,
  health,
  waterLogs,
  onSnapChange,
  onTranslateY,
  animatedTranslateY,
  forceSnap,
}: VitalsSheetProps) {
  const { colors, radii } = useAppTheme();

  const { config, telemetry } = device;
  const lastLog = waterLogs[0];

  // Initial position at peek - share the SharedValue if provided by parent
  const internalTranslateY = useSharedValue(snapPoints[2]);
  const translateY = animatedTranslateY ?? internalTranslateY;
  const currentSnap = useSharedValue<SheetSnap>('peek');

  const snapTo = (snap: SheetSnap) => {
    'worklet';
    const yMap: Record<SheetSnap, number> = {
      full: snapPoints[0],
      half: snapPoints[1],
      peek: snapPoints[2],
    };
    translateY.value = withSpring(yMap[snap], {
      damping: 16,
      stiffness: 160,
    });
    currentSnap.value = snap;
  };

  // Force external snap (e.g. watering started → collapse to peek)
  useEffect(() => {
    if (forceSnap) {
      snapTo(forceSnap);
    }
  }, [forceSnap]);

  // Safely notify onTranslateY if passed via JS callback
  useAnimatedReaction(
    () => translateY.value,
    (currentY, previousY) => {
      if (onTranslateY && currentY !== previousY) {
        runOnJS(onTranslateY)(currentY);
      }
    }
  );

  const panStartY = useSharedValue(0);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      'worklet';
      panStartY.value = translateY.value;
    })
    .onUpdate((event) => {
      'worklet';
      const nextY = panStartY.value + event.translationY;
      translateY.value = Math.max(snapPoints[0], Math.min(snapPoints[2], nextY));
    })
    .onEnd((event) => {
      'worklet';
      const velocity = event.velocityY;
      const currentY = translateY.value;

      let targetSnap: SheetSnap = 'peek';
      const distFull = Math.abs(currentY - snapPoints[0]);
      const distHalf = Math.abs(currentY - snapPoints[1]);
      const distPeek = Math.abs(currentY - snapPoints[2]);

      if (velocity < -500) {
        if (currentSnap.value === 'peek') targetSnap = 'half';
        else if (currentSnap.value === 'half') targetSnap = 'full';
        else targetSnap = 'full';
      } else if (velocity > 500) {
        if (currentSnap.value === 'full') targetSnap = 'half';
        else if (currentSnap.value === 'half') targetSnap = 'peek';
        else targetSnap = 'peek';
      } else {
        if (distFull <= distHalf && distFull <= distPeek) targetSnap = 'full';
        else if (distHalf <= distFull && distHalf <= distPeek) targetSnap = 'half';
        else targetSnap = 'peek';
      }

      snapTo(targetSnap);
      if (onSnapChange) {
        runOnJS(onSnapChange)(targetSnap);
      }
    });

  const sheetAnimStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value }],
    };
  });

  // Derived visible height
  const sheetHeight = SCREEN_HEIGHT * SNAP_FULL + 40;

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: sheetHeight,
          backgroundColor: colors.palette.white,
          shadowColor: colors.palette.ink,
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.12,
          shadowRadius: 24,
          elevation: 24,
          borderTopLeftRadius: radii.heroCorner,
          borderTopRightRadius: radii.hero,
          zIndex: 20,
        },
        sheetAnimStyle,
      ]}
    >
      {/* Drag handle */}
      <GestureDetector gesture={panGesture}>
        <Animated.View style={styles.handleArea}>
          <View
            style={[
              styles.handle,
              { backgroundColor: `${colors.palette.sage}60` },
            ]}
          />
        </Animated.View>
      </GestureDetector>

      {/* Sheet content */}
      <ScrollView
        scrollEnabled={true}
        showsVerticalScrollIndicator={false}
        style={[styles.scrollArea, { backgroundColor: colors.palette.white }]}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 120 }]}
      >
        {/* ── PEEK CONTENT ─────────────────────────────── */}
        <View style={styles.peekRow}>
          {/* Left: Moisture ring */}
          <MoistureRing
            soilMoisture={telemetry.soilMoisture}
            moistureMin={config.thresholds.moistureMin}
            moistureMax={config.thresholds.moistureMax}
            size={130}
          />

          {/* Right: status stack */}
          <View style={styles.peekRight}>
            <Text
              style={[
                styles.statusHeadline,
                { color: STATUS_COLORS[health] },
              ]}
            >
              {STATUS_HEADLINES[health]}
            </Text>
            <Text
              style={[styles.plantNameText, { color: colors.palette.ink }]}
              numberOfLines={1}
            >
              {config.plantName}
            </Text>
            <Text
              style={[styles.lastWateredText, { color: colors.palette.sage }]}
              numberOfLines={2}
            >
              {formatLastWatered(lastLog)}
            </Text>

            {/* Min/Max range label */}
            <View style={styles.rangeRow}>
              <Ionicons
                name="analytics-outline"
                size={12}
                color={colors.palette.forest}
              />
              <Text
                style={[styles.rangeText, { color: colors.palette.forest }]}
              >
                Target: {config.thresholds.moistureMin}%–{config.thresholds.moistureMax}%
              </Text>
            </View>
          </View>
        </View>

        {/* Divider */}
        <View
          style={[
            styles.divider,
            { backgroundColor: `${colors.palette.sage}25` },
          ]}
        />

        {/* ── HALF CONTENT: Bento Grid ──────────────────── */}
        <View style={styles.bentoSection}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="grid-outline" size={14} color={colors.palette.forest} />
            <Text style={[styles.sectionTitle, { color: colors.palette.ink }]}>
              Live Metrics
            </Text>
          </View>
          <BentoGrid
            telemetry={telemetry}
            config={config}
            waterLogs={waterLogs}
          />
        </View>

        {/* ── FULL CONTENT: Water log list ─────────────── */}
        <View style={styles.logSection}>
          <View style={styles.sectionTitleRow}>
            <Ionicons name="time-outline" size={14} color={colors.palette.forest} />
            <Text style={[styles.sectionTitle, { color: colors.palette.ink }]}>
              Watering History
            </Text>
          </View>

          {waterLogs.length === 0 ? (
            <Text
              style={[styles.emptyLogText, { color: colors.palette.sage }]}
            >
              No watering events recorded yet.
            </Text>
          ) : (
            waterLogs.map((log) => (
              <WaterLogRow key={log.id} log={log} colors={colors} radii={radii} />
            ))
          )}
        </View>

        {/* Bottom padding for dock */}
        <View style={{ height: 120 }} />
      </ScrollView>
    </Animated.View>
  );
}

// ─── WaterLogRow ─────────────────────────────────────────────────────────────

interface WaterLogRowProps {
  log: WaterLog;
  colors: ReturnType<typeof useAppTheme>['colors'];
  radii: ReturnType<typeof useAppTheme>['radii'];
}

function WaterLogRow({ log, colors, radii }: WaterLogRowProps) {
  const [now] = React.useState(() => Date.now());
  const diffMs = now - log.ts;
  const diffH = Math.floor(diffMs / 3600000);
  const diffMin = Math.floor((diffMs % 3600000) / 60000);
  const timeLabel =
    diffH > 0 ? `${diffH}h ago` : diffMin > 0 ? `${diffMin}m ago` : 'just now';

  const isManual = log.trigger === 'manual';

  return (
    <View
      style={[
        styles.logRow,
        {
          backgroundColor: isManual
            ? `${colors.palette.lime}60`
            : `${colors.palette.mint}40`,
          borderRadius: radii.md,
          borderLeftColor: isManual
            ? colors.palette.sage
            : colors.palette.forest,
        },
      ]}
    >
      <Ionicons
        name={isManual ? 'hand-left-outline' : 'flash'}
        size={16}
        color={isManual ? colors.palette.sage : colors.palette.forest}
      />
      <View style={{ flex: 1 }}>
        <View style={styles.logRowTop}>
          <Text style={[styles.logTrigger, { color: colors.palette.ink }]}>
            {isManual ? 'Manual' : 'Auto'} · {log.durationSec}s
          </Text>
          <Text style={[styles.logTime, { color: colors.palette.sage }]}>
            {timeLabel}
          </Text>
        </View>
        <Text style={[styles.logStats, { color: colors.palette.sage }]}>
          {log.moistureBefore}% → {log.moistureAfter}%
          {log.note ? ` · ${log.note}` : ''}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  handleArea: {
    paddingVertical: 10,
    alignItems: 'center',
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  peekRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 20,
    paddingVertical: 8,
  },
  peekRight: {
    flex: 1,
    gap: 4,
  },
  statusHeadline: {
    fontSize: 26,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  plantNameText: {
    fontSize: 14,
    fontWeight: '600',
  },
  lastWateredText: {
    fontSize: 12,
    fontWeight: '400',
    lineHeight: 17,
    marginTop: 2,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  rangeText: {
    fontSize: 11,
    fontWeight: '600',
  },
  divider: {
    height: 1,
    marginVertical: 16,
  },
  bentoSection: {
    gap: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  logSection: {
    marginTop: 24,
    gap: 10,
  },
  emptyLogText: {
    fontSize: 13,
    fontWeight: '400',
    marginTop: 8,
  },
  logRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 12,
    gap: 10,
    borderLeftWidth: 3,
  },
  logRowTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logTrigger: {
    fontSize: 13,
    fontWeight: '700',
  },
  logTime: {
    fontSize: 11,
    fontWeight: '500',
  },
  logStats: {
    fontSize: 12,
    fontWeight: '400',
    marginTop: 2,
  },
});
