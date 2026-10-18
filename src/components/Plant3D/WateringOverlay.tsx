/**
 * WateringOverlay
 * Animated overlay shown during active watering.
 * Uses react-native-reanimated for spring animations.
 * Renders an animated moisture ring and a watering countdown label.
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  withSequence,
  Easing,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';

export interface WateringOverlayProps {
  isActive: boolean;
  secondsLeft: number;
}

export function WateringOverlay({ isActive, secondsLeft }: WateringOverlayProps) {
  const { colors, radii } = useAppTheme();

  // Pulse scale animation for water ring
  const ringScale = useSharedValue(1);
  const ringOpacity = useSharedValue(0.4);

  useEffect(() => {
    if (isActive) {
      ringScale.value = withRepeat(
        withSequence(
          withTiming(1.25, { duration: 600, easing: Easing.out(Easing.ease) }),
          withTiming(1.0, { duration: 600, easing: Easing.in(Easing.ease) })
        ),
        -1,
        false
      );
      ringOpacity.value = withRepeat(
        withSequence(
          withTiming(0.8, { duration: 600 }),
          withTiming(0.3, { duration: 600 })
        ),
        -1,
        false
      );
    } else {
      ringScale.value = withTiming(1);
      ringOpacity.value = withTiming(0);
    }
  }, [isActive, ringOpacity, ringScale]);

  const ringStyle = useAnimatedStyle(() => ({
    transform: [{ scale: ringScale.value }],
    opacity: ringOpacity.value,
  }));

  if (!isActive) return null;

  return (
    <Animated.View
      entering={FadeIn.duration(300)}
      exiting={FadeOut.duration(300)}
      style={styles.container}
      pointerEvents="none"
    >
      {/* Moisture ring pulse */}
      <Animated.View
        style={[
          styles.moistureRing,
          {
            borderColor: colors.palette.mint,
          },
          ringStyle,
        ]}
      />

      {/* Watering countdown badge */}
      <View
        style={[
          styles.countdownBadge,
          {
            backgroundColor: colors.palette.forest,
            borderRadius: radii.full,
          },
        ]}
      >
        <Ionicons name="water" size={14} color={colors.palette.white} />
        <Text style={[styles.countdownText, { color: colors.palette.white }]}>
          Watering... {secondsLeft}s
        </Text>
      </View>

      {/* Water drop icons falling */}
      {[0, 1, 2].map((i) => (
        <FallingDrop key={i} index={i} color={colors.palette.mint} />
      ))}
    </Animated.View>
  );
}

interface FallingDropProps {
  index: number;
  color: string;
}

function FallingDrop({ index, color }: FallingDropProps) {
  const translateY = useSharedValue(-20);
  const opacity = useSharedValue(0);

  useEffect(() => {
    const delay = index * 250;
    setTimeout(() => {
      translateY.value = withRepeat(
        withTiming(80, { duration: 700, easing: Easing.in(Easing.ease) }),
        -1,
        false
      );
      opacity.value = withRepeat(
        withSequence(
          withTiming(1, { duration: 200 }),
          withTiming(0, { duration: 500 })
        ),
        -1,
        false
      );
    }, delay);
    return () => {
      translateY.value = -20;
      opacity.value = 0;
    };
  }, [index, opacity, translateY]);

  const dropStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const xPos = [30, 55, 75][index];

  return (
    <Animated.View
      style={[
        styles.fallingDrop,
        { left: `${xPos}%` as any },
        dropStyle,
      ]}
    >
      <Ionicons name="water" size={12} color={color} />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  moistureRing: {
    position: 'absolute',
    width: 130,
    height: 130,
    borderRadius: 65,
    borderWidth: 3,
  },
  countdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
    position: 'absolute',
    bottom: 20,
  },
  countdownText: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  fallingDrop: {
    position: 'absolute',
    top: '25%',
  },
});
