/**
 * Plant3DHero
 * The main hero card that sits at ~45% of the home screen.
 * Renders a ForestToLime linear gradient background, overlays the 3D plant
 * scene (or falls back to the illustrated placeholder on unsupported devices),
 * and drives the WateringOverlay & haptics on pump activation.
 *
 * Health state → visual feedback mapping (spec.md Section 8.2):
 *   HEALTHY     → vibrant greens, gentle sway, mint glow
 *   THIRSTY     → desaturated, drooping, blush chip "Needs water"
 *   OVERWATERED → yellowed, soggy chip "Too wet"
 *   UNKNOWN     → greyed, "Last seen X min ago"
 */
import React, { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
  FadeIn,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { PlantHealthState } from '@/store/useLiveDevice';
import { WateringOverlay } from './WateringOverlay';
import { PlantScene3D } from './PlantScene3D';

export interface Plant3DHeroProps {
  health: PlantHealthState;
  isWatering?: boolean;
  secondsLeft?: number;
  location?: string;
  mode?: string;
  plantName?: string;
  plantSpecies?: string;
  lastSeen?: number;
  onLocationPress?: () => void;
}

// Background gradient pairs per health state
const gradientColors: Record<
  PlantHealthState,
  [string, string, string]
> = {
  healthy: ['#5A8A5C', '#AEE09A', '#CEEA9F'],
  thirsty: ['#F8D7DA', '#E0A8AD', '#C0505E'],
  overwatered: ['#4A7A5C', '#6BAF7A', '#A8D5B5'],
  unknown: ['#78909C', '#90A4AE', '#B0BEC5'],
};

// Spec 5.1 accent chip colours per state
const stateChips: Record<PlantHealthState, { label: string; bg: string; text: string; icon: keyof typeof Ionicons.glyphMap }> =
  {
    healthy: { label: 'Healthy', bg: '#AEE09A', text: '#1F2A21', icon: 'checkmark-circle' },
    thirsty: { label: 'Needs Water', bg: '#F8D7DA', text: '#C0505E', icon: 'water-outline' },
    overwatered: { label: 'Too Wet', bg: '#F8D7DA', text: '#C0505E', icon: 'warning-outline' },
    unknown: { label: 'Offline', bg: '#B0BEC5', text: '#37474F', icon: 'cloud-offline-outline' },
  };

export function Plant3DHero({
  health,
  isWatering = false,
  secondsLeft = 0,
  location = 'balcony',
  mode = 'auto',
  plantName = 'Monstera Deliciosa',
  plantSpecies = 'Swiss Cheese Plant',
  lastSeen,
  onLocationPress,
}: Plant3DHeroProps) {
  const { colors, radii } = useAppTheme();
  const [now, setNow] = useState(() => (lastSeen ?? 0));

  // Periodic ticker to refresh relative elapsed time
  useEffect(() => {
    const timer = setInterval(() => {
      setNow(Date.now());
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  const lastSeenMinutesAgo = lastSeen
    ? Math.max(0, Math.floor((now - lastSeen) / 60000))
    : 0;

  const hasFiredHaptic = useRef(false);

  // Haptic feedback on watering start
  useEffect(() => {
    if (isWatering && !hasFiredHaptic.current) {
      hasFiredHaptic.current = true;
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
    }
    if (!isWatering) {
      hasFiredHaptic.current = false;
    }
  }, [isWatering]);

  const gradient = gradientColors[health];
  const chip = stateChips[health];

  // Pulsating border highlight for watering
  const borderOpacity = useSharedValue(0.6);
  useEffect(() => {
    if (isWatering) {
      borderOpacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 400 }),
          withTiming(0.3, { duration: 400 })
        ),
        -1,
        false
      );
    } else {
      borderOpacity.value = withTiming(0.6);
    }
  }, [isWatering, borderOpacity]);

  const borderStyle = useAnimatedStyle(() => ({
    borderColor: isWatering
      ? `rgba(174, 224, 154, ${borderOpacity.value})`
      : 'transparent',
  }));

  const locationLabel = {
    balcony: 'Balcony',
    terrace: 'Terrace',
    indoor: 'Indoor',
  }[location] ?? location;

  const modeLabel = mode === 'auto' ? 'Auto' : 'Manual';

  return (
    <Animated.View
      entering={FadeIn.duration(400)}
      style={[styles.heroWrapper, borderStyle, { borderRadius: radii.hero }]}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradientContainer, { borderRadius: radii.hero }]}
      >
        {/* Overlay chips top row */}
        <View style={styles.topChipRow}>
          <TouchableOpacity
            onPress={onLocationPress}
            style={[
              styles.locationChip,
              {
                backgroundColor: 'rgba(255,255,255,0.85)',
                borderRadius: radii.full,
              },
            ]}
          >
            <Ionicons name="location-outline" size={12} color={colors.palette.forest} />
            <Text style={[styles.chipText, { color: colors.palette.forest }]}>
              {locationLabel.toUpperCase()}
            </Text>
          </TouchableOpacity>

          <View style={styles.topChipRight}>
            <View
              style={[
                styles.modeChip,
                {
                  backgroundColor:
                    mode === 'auto'
                      ? 'rgba(90,138,92,0.85)'
                      : 'rgba(255,255,255,0.75)',
                  borderRadius: radii.full,
                },
              ]}
            >
              <Ionicons
                name={mode === 'auto' ? 'sync-outline' : 'hand-left-outline'}
                size={12}
                color={mode === 'auto' ? '#FFFFFF' : colors.palette.ink}
              />
              <Text
                style={[
                  styles.chipText,
                  {
                    color: mode === 'auto' ? '#FFFFFF' : colors.palette.ink,
                  },
                ]}
              >
                {modeLabel}
              </Text>
            </View>
          </View>
        </View>

        {/* 3D / Fallback Stage */}
        <View style={styles.sceneStage}>
          <React.Suspense fallback={<FallbackIllustration health={health} />}>
            <PlantScene3D
              health={health}
              isWatering={isWatering}
            />
          </React.Suspense>

          {/* Watering overlay on top of the 3D scene */}
          <WateringOverlay isActive={isWatering} secondsLeft={secondsLeft} />
        </View>

        {/* Plant name block */}
        <View style={styles.plantInfoRow}>
          <View style={styles.plantNameWrap}>
            <Text style={styles.plantName}>{plantName}</Text>
            <Text style={styles.plantSpecies}>{plantSpecies}</Text>
          </View>

          {/* Health state chip */}
          <View
            style={[
              styles.healthChip,
              { backgroundColor: chip.bg, borderRadius: radii.full },
            ]}
          >
            <Ionicons name={chip.icon} size={13} color={chip.text} />
            <Text style={[styles.healthChipText, { color: chip.text }]}>
              {health === 'unknown' && lastSeenMinutesAgo > 0
                ? `Offline ${lastSeenMinutesAgo}m ago`
                : chip.label}
            </Text>
          </View>
        </View>
      </LinearGradient>
    </Animated.View>
  );
}

/** Fallback for when expo-gl / R3F is loading or unavailable */
function FallbackIllustration({ health }: { health: PlantHealthState }) {
  const { colors } = useAppTheme();

  const pulseAnim = useSharedValue(1);
  useEffect(() => {
    if (health === 'healthy') {
      pulseAnim.value = withRepeat(
        withSequence(
          withSpring(1.07, { damping: 10 }),
          withSpring(1.0, { damping: 10 })
        ),
        -1,
        false
      );
    }
  }, [health, pulseAnim]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseAnim.value }],
  }));

  const iconMap: Record<PlantHealthState, keyof typeof Ionicons.glyphMap> = {
    healthy: 'leaf',
    thirsty: 'leaf-outline',
    overwatered: 'water',
    unknown: 'leaf-outline',
  };

  const colorMap: Record<PlantHealthState, string> = {
    healthy: colors.palette.mint,
    thirsty: colors.palette.warningText,
    overwatered: colors.palette.blush,
    unknown: colors.palette.sage,
  };

  return (
    <Animated.View style={[styles.fallbackContainer, animStyle]}>
      {/* Outer glow ring */}
      <View
        style={[
          styles.fallbackGlow,
          {
            backgroundColor: `${colorMap[health]}33`,
          },
        ]}
      />
      <View
        style={[
          styles.fallbackIconCircle,
          { backgroundColor: `${colorMap[health]}55` },
        ]}
      >
        <Ionicons name={iconMap[health]} size={72} color={colorMap[health]} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  heroWrapper: {
    height: 340,
    marginVertical: 10,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 20,
    elevation: 8,
  },
  gradientContainer: {
    flex: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  topChipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 5,
  },
  locationChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  chipText: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  topChipRight: {
    flexDirection: 'row',
    gap: 6,
  },
  modeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  sceneStage: {
    flex: 1,
    position: 'relative',
    marginVertical: 4,
  },
  plantInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    zIndex: 5,
  },
  plantNameWrap: {},
  plantName: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.25)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  plantSpecies: {
    fontSize: 12,
    fontWeight: '500',
    color: 'rgba(255,255,255,0.82)',
    marginTop: 2,
  },
  healthChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  healthChipText: {
    fontSize: 12,
    fontWeight: '700',
  },
  // Fallback Illustration
  fallbackContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fallbackGlow: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
  },
  fallbackIconCircle: {
    width: 140,
    height: 140,
    borderRadius: 70,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
