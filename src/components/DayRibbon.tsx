import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  runOnJS,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const RIBBON_PADDING = 16;
const RIBBON_WIDTH = SCREEN_WIDTH - RIBBON_PADDING * 2 - 32;

export type TimeWindow = '24h' | '7d';

interface DayRibbonProps {
  timeWindow: TimeWindow;
  onTimeWindowChange: (window: TimeWindow) => void;
  scrubFraction: number; // 0 (oldest) to 1 (now)
  onScrub: (fraction: number) => void;
  cursorLabel: string;
}

export function DayRibbon({
  timeWindow,
  onTimeWindowChange,
  scrubFraction,
  onScrub,
  cursorLabel,
}: DayRibbonProps) {
  const { colors, radii } = useAppTheme();

  const ribbonPos = useSharedValue(scrubFraction);
  const startPos = useSharedValue(scrubFraction);

  // Keep shared value in sync when props change
  React.useEffect(() => {
    ribbonPos.value = scrubFraction;
  }, [scrubFraction, ribbonPos]);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      startPos.value = ribbonPos.value;
    })
    .onUpdate((event) => {
      const delta = event.translationX / RIBBON_WIDTH;
      const nextPos = Math.max(0, Math.min(1, startPos.value + delta));
      // eslint-disable-next-line react-hooks/immutability
      ribbonPos.value = nextPos;
      runOnJS(onScrub)(nextPos);
    })
    .onEnd(() => {
      runOnJS(onScrub)(ribbonPos.value);
    });

  const cursorAnimStyle = useAnimatedStyle(() => ({
    left: Math.max(0, Math.min(RIBBON_WIDTH - 24, ribbonPos.value * (RIBBON_WIDTH - 24))),
  }));

  const numTicks = timeWindow === '24h' ? 8 : 7;

  return (
    <View style={styles.container}>
      {/* ── Time Window Toggle Chips ────────────────────────── */}
      <View
        style={[
          styles.toggleRow,
          {
            backgroundColor: `${colors.palette.sage}15`,
            borderRadius: radii.full,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => onTimeWindowChange('24h')}
          style={[
            styles.toggleBtn,
            {
              backgroundColor:
                timeWindow === '24h' ? colors.palette.forest : 'transparent',
              borderRadius: radii.full,
            },
          ]}
          activeOpacity={0.8}
        >
          <Ionicons
            name="time-outline"
            size={14}
            color={timeWindow === '24h' ? colors.palette.white : colors.palette.sage}
          />
          <Text
            style={[
              styles.toggleBtnText,
              {
                color:
                  timeWindow === '24h'
                    ? colors.palette.white
                    : colors.palette.sage,
              },
            ]}
          >
            Past 24 Hours
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => onTimeWindowChange('7d')}
          style={[
            styles.toggleBtn,
            {
              backgroundColor:
                timeWindow === '7d' ? colors.palette.forest : 'transparent',
              borderRadius: radii.full,
            },
          ]}
          activeOpacity={0.8}
        >
          <Ionicons
            name="calendar-outline"
            size={14}
            color={timeWindow === '7d' ? colors.palette.white : colors.palette.sage}
          />
          <Text
            style={[
              styles.toggleBtnText,
              {
                color:
                  timeWindow === '7d'
                    ? colors.palette.white
                    : colors.palette.sage,
              },
            ]}
          >
            7-Day History
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── Day Ribbon Scrub Track ──────────────────────────── */}
      <View
        style={[
          styles.ribbonCard,
          {
            backgroundColor: colors.palette.white,
            borderRadius: radii.card,
            borderColor: colors.border,
          },
        ]}
      >
        <View style={styles.trackContainer}>
          {/* Background Track Line */}
          <View
            style={[
              styles.trackBg,
              { backgroundColor: `${colors.palette.sage}20` },
            ]}
          />

          {/* Active Filled Track */}
          <View
            style={[
              styles.trackActive,
              {
                width: `${Math.round(scrubFraction * 100)}%`,
                backgroundColor: `${colors.palette.forest}40`,
              },
            ]}
          />

          {/* Evenly Spaced Time Ticks */}
          <View style={styles.ticksContainer}>
            {Array.from({ length: numTicks }).map((_, i) => (
              <View
                key={i}
                style={[
                  styles.tick,
                  {
                    backgroundColor:
                      i / (numTicks - 1) <= scrubFraction
                        ? colors.palette.forest
                        : `${colors.palette.sage}40`,
                  },
                ]}
              />
            ))}
          </View>

          {/* Draggable Scrubber Cursor */}
          <GestureDetector gesture={panGesture}>
            <Animated.View
              style={[
                styles.cursor,
                {
                  backgroundColor: colors.palette.forest,
                  borderColor: colors.palette.white,
                },
                cursorAnimStyle,
              ]}
            >
              <View
                style={[
                  styles.cursorInner,
                  { backgroundColor: colors.palette.mint },
                ]}
              />
            </Animated.View>
          </GestureDetector>
        </View>

        {/* Labels below ribbon */}
        <View style={styles.labelsRow}>
          <Text style={[styles.labelSide, { color: colors.textMuted }]}>
            {timeWindow === '24h' ? '24h ago' : '7d ago'}
          </Text>

          <View
            style={[
              styles.currentBadge,
              {
                backgroundColor: `${colors.palette.forest}15`,
                borderRadius: radii.full,
              },
            ]}
          >
            <Ionicons
              name="navigate"
              size={10}
              color={colors.palette.forest}
              style={{ transform: [{ rotate: '45deg' }] }}
            />
            <Text
              style={[
                styles.currentBadgeText,
                { color: colors.palette.forest },
              ]}
            >
              {cursorLabel}
            </Text>
          </View>

          <Text style={[styles.labelSide, { color: colors.textMuted }]}>
            Live
          </Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    padding: 4,
    marginBottom: 12,
  },
  toggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    gap: 6,
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
  },
  ribbonCard: {
    padding: 14,
    borderWidth: 1,
  },
  trackContainer: {
    height: 32,
    justifyContent: 'center',
    position: 'relative',
    marginBottom: 6,
  },
  trackBg: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 6,
    borderRadius: 3,
  },
  trackActive: {
    position: 'absolute',
    left: 0,
    height: 6,
    borderRadius: 3,
  },
  ticksContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 4,
  },
  tick: {
    width: 2,
    height: 12,
    borderRadius: 1,
  },
  cursor: {
    position: 'absolute',
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  cursorInner: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  labelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  labelSide: {
    fontSize: 11,
    fontWeight: '600',
  },
  currentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 3,
  },
  currentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
  },
});
