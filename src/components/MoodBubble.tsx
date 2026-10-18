/**
 * MoodBubble
 * Speech bubble that floats near the pot with a tail pointing at the plant.
 * The plant "speaks" its state: Healthy, Thirsty, Too Wet, Offline.
 * Gently bobs via a looped Reanimated spring animation.
 * uiLayout.md Section 3 – Layer 2
 */
import React, { useEffect } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { PlantHealthState } from '@/store/useLiveDevice';

interface MoodConfig {
  text: string;
  bg: string;
  textColor: string;
  borderColor: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const getMoodConfig = (
  health: PlantHealthState,
  palette: ReturnType<typeof useAppTheme>['colors']['palette'],
  lastSeenMinutes?: number
): MoodConfig => {
  switch (health) {
    case 'healthy':
      return {
        text: 'Feeling great',
        bg: palette.mint,
        textColor: palette.ink,
        borderColor: palette.sage,
        icon: 'leaf',
      };
    case 'thirsty':
      return {
        text: 'I need water',
        bg: palette.blush,
        textColor: palette.warningText,
        borderColor: palette.warningBorder,
        icon: 'water-outline',
      };
    case 'overwatered':
      return {
        text: 'Too wet',
        bg: palette.lime,
        textColor: palette.ink,
        borderColor: palette.sage,
        icon: 'warning-outline',
      };
    default:
      return {
        text: lastSeenMinutes !== undefined
          ? `Last seen ${lastSeenMinutes} min ago`
          : 'Offline',
        bg: '#B0BEC5',
        textColor: '#37474F',
        borderColor: '#90A4AE',
        icon: 'cloud-offline-outline',
      };
  }
};

interface MoodBubbleProps {
  health: PlantHealthState;
  lastSeen?: number; // epoch ms
}

export function MoodBubble({ health, lastSeen }: MoodBubbleProps) {
  const { colors, radii } = useAppTheme();
  const [now] = React.useState(() => Date.now());

  const lastSeenMinutes = lastSeen
    ? Math.round((now - lastSeen) / 60000)
    : undefined;

  const mood = getMoodConfig(health, colors.palette, lastSeenMinutes);

  // Gentle bob animation
  const translateY = useSharedValue(0);
  useEffect(() => {
    translateY.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1600 }),
        withTiming(0, { duration: 1600 })
      ),
      -1,
      false
    );
  }, [translateY]);

  const bubbleStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Animated.View style={[styles.wrapper, bubbleStyle]}>
      {/* Bubble body */}
      <View
        style={[
          styles.bubble,
          {
            backgroundColor: mood.bg,
            borderColor: mood.borderColor,
            borderRadius: radii.full,
          },
        ]}
        accessibilityLabel={`Plant mood: ${mood.text}`}
      >
        <Ionicons
          name={mood.icon}
          size={14}
          color={mood.textColor}
          style={styles.icon}
        />
        <Text style={[styles.text, { color: mood.textColor }]}>
          {mood.text}
        </Text>
      </View>

      {/* Bubble tail pointing downward toward the plant */}
      <View
        style={[
          styles.tail,
          { borderTopColor: mood.borderColor },
        ]}
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
  },
  bubble: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderWidth: 1.5,
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 6,
    gap: 6,
  },
  icon: {
    marginRight: 2,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.1,
  },
  tail: {
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
});
