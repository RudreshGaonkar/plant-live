/**
 * LiveChips
 * Three circular 52dp badges stacked on the right edge of the Stage screen.
 * - Location chip (balcony/terrace/indoor icon)
 * - Mode chip (Auto leaf / Manual hand) – tap toggles
 * - Pump state chip (droplet, pulses while pumpOn)
 * uiLayout.md Section 3 – Layer 4
 */
import React, { useEffect } from 'react';
import { View, TouchableOpacity, StyleSheet, Text } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withSpring,
} from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { PlantLocation, DeviceMode } from '@/store/useLiveDevice';

const LOCATION_ICONS: Record<PlantLocation, keyof typeof Ionicons.glyphMap> = {
  balcony: 'partly-sunny-outline',
  terrace: 'sunny-outline',
  indoor: 'home-outline',
};

const LOCATION_LABELS: Record<PlantLocation, string> = {
  balcony: 'Balcony',
  terrace: 'Terrace',
  indoor: 'Indoor',
};

interface LiveChipsProps {
  location: PlantLocation;
  mode: DeviceMode;
  pumpOn: boolean;
  onModeToggle: () => void;
}

export function LiveChips({
  location,
  mode,
  pumpOn,
  onModeToggle,
}: LiveChipsProps) {
  const { colors, radii } = useAppTheme();

  // Pump pulse animation
  const pumpScale = useSharedValue(1);
  useEffect(() => {
    if (pumpOn) {
      pumpScale.value = withRepeat(
        withSequence(
          withTiming(1.25, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1,
        false
      );
    } else {
      pumpScale.value = withSpring(1);
    }
  }, [pumpOn, pumpScale]);

  const pumpStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pumpScale.value }],
  }));

  const chips: {
    id: string;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    bg: string;
    iconColor: string;
    onPress?: () => void;
    animStyle?: object;
  }[] = [
    {
      id: 'location',
      icon: LOCATION_ICONS[location],
      label: LOCATION_LABELS[location],
      bg: `${colors.palette.lime}CC`,
      iconColor: colors.palette.forest,
    },
    {
      id: 'mode',
      icon: mode === 'auto' ? 'flash' : 'hand-left-outline',
      label: mode === 'auto' ? 'Auto' : 'Manual',
      bg:
        mode === 'auto'
          ? `${colors.palette.mint}CC`
          : `${colors.palette.blush}CC`,
      iconColor:
        mode === 'auto' ? colors.palette.forest : colors.palette.warningText,
      onPress: onModeToggle,
    },
    {
      id: 'pump',
      icon: pumpOn ? 'water' : 'water-outline',
      label: pumpOn ? 'Pump On' : 'Pump Off',
      bg: pumpOn
        ? `${colors.palette.forest}E0`
        : `${colors.palette.white}CC`,
      iconColor: pumpOn ? colors.palette.white : colors.palette.sage,
      animStyle: pumpStyle,
    },
  ];

  return (
    <View style={styles.stack}>
      {chips.map((chip) => {
        const inner = (
          <View
            style={[
              styles.chip,
              {
                backgroundColor: chip.bg,
                borderRadius: 26,
                shadowColor: colors.palette.ink,
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.1,
                shadowRadius: 10,
                elevation: 6,
              },
            ]}
          >
            <Ionicons
              name={chip.icon}
              size={20}
              color={chip.iconColor}
            />
            <Text
              style={[styles.chipLabel, { color: chip.iconColor }]}
              numberOfLines={1}
            >
              {chip.label}
            </Text>
          </View>
        );

        if (chip.animStyle) {
          return (
            <Animated.View key={chip.id} style={chip.animStyle}>
              {inner}
            </Animated.View>
          );
        }

        if (chip.onPress) {
          return (
            <TouchableOpacity
              key={chip.id}
              onPress={chip.onPress}
              accessibilityLabel={`Mode: ${chip.label}. Tap to toggle.`}
              accessibilityRole="button"
            >
              {inner}
            </TouchableOpacity>
          );
        }

        return (
          <View key={chip.id} accessibilityLabel={chip.label}>
            {inner}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: {
    gap: 10,
    alignItems: 'center',
  },
  chip: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.5)',
  },
  chipLabel: {
    fontSize: 8,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.1,
  },
});
