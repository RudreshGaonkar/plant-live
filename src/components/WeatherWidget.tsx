import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  StyleProp,
  ViewStyle,
} from 'react-native';
import Animated, { FadeInDown, FadeOutUp } from 'react-native-reanimated';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useAppTheme } from '@/theme';
import { WeatherData } from '@/store/useLiveDevice';

export interface WeatherWidgetProps {
  weather: WeatherData | null;
  loading?: boolean;
  isRainDelayActive?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * WeatherWidget
 * Floating compact weather chip situated centrally below the plant name / location bar
 * and floating at the top center of the plant illustration.
 *
 * Design:
 * - Semi-transparent pill background with subtle shadow.
 * - Layout: [Weather Icon] [Temperature °C] • [Condition Text (e.g. 28°C Rain)].
 * - Smooth entrance animation via Reanimated FadeInDown.
 */
export function WeatherWidget({
  weather,
  loading = false,
  isRainDelayActive = false,
  onPress,
  style,
}: WeatherWidgetProps) {
  const { colors, radii } = useAppTheme();

  // If no weather loaded and not loading, keep hidden
  if (!weather && !loading) {
    return null;
  }

  const handlePress = () => {
    if (onPress) {
      onPress();
      return;
    }

    if (!weather) return;

    const locationSource = weather.isFallback
      ? 'Goa (Default fallback)'
      : weather.cityName
      ? `${weather.cityName} (Device GPS)`
      : `GPS (${weather.latitude.toFixed(2)}, ${weather.longitude.toFixed(2)})`;

    Alert.alert(
      `${weather.icon} Outdoor Weather`,
      `Condition: ${weather.conditionText}\n` +
        `Temperature: ${Math.round(weather.temperature)}°C\n` +
        `Rain Probability: ${weather.rainProbability}%\n` +
        `Location: ${locationSource}\n\n` +
        (isRainDelayActive
          ? `🌧️ Smart Rain Delay: Active on Terrace. Auto-watering delayed since rain probability exceeds 70%.`
          : `Watering Logic: Standard operation.`),
      [{ text: 'OK', style: 'default' }]
    );
  };

  // If loading without previous weather data, render a subtle shimmering placeholder
  if (!weather && loading) {
    return (
      <Animated.View
        entering={FadeInDown.duration(300)}
        exiting={FadeOutUp.duration(200)}
        style={[styles.container, style]}
      >
        <View
          style={[
            styles.pill,
            {
              backgroundColor: 'rgba(255, 255, 255, 0.72)',
              borderColor: `${colors.palette.forest}20`,
              borderRadius: radii.full,
            },
          ]}
        >
          <Text style={[styles.loadingText, { color: colors.palette.sage }]}>
            ⛅ Updating weather...
          </Text>
        </View>
      </Animated.View>
    );
  }

  if (!weather) return null;

  return (
    <Animated.View
      entering={FadeInDown.duration(400).springify().damping(14)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.container, style]}
    >
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={handlePress}
        style={[
          styles.pill,
          {
            backgroundColor: isRainDelayActive
              ? 'rgba(255, 245, 245, 0.88)'
              : 'rgba(255, 255, 255, 0.82)',
            borderColor: isRainDelayActive
              ? `${colors.palette.critical}40`
              : `${colors.palette.forest}25`,
            borderRadius: radii.full,
          },
        ]}
        accessibilityRole="button"
        accessibilityLabel={`Weather: ${weather.temperature}°C ${weather.conditionText}`}
        testID="floating-weather-widget"
      >
        {/* Weather Icon (☀️, ⛅, 🌧️) */}
        <Text style={styles.weatherIcon}>{weather.icon}</Text>

        {/* Temperature & Condition Text: e.g. "28°C • Rain" */}
        <Text style={[styles.weatherText, { color: colors.palette.ink }]}>
          {Math.round(weather.temperature)}°C • {weather.conditionText}
        </Text>

        {/* Smart Terrace Rain Delay Tag if active */}
        {isRainDelayActive && (
          <View
            style={[
              styles.rainDelayTag,
              { backgroundColor: `${colors.palette.critical}18` },
            ]}
          >
            <Ionicons name="rainy" size={10} color={colors.palette.critical} />
            <Text
              style={[styles.rainDelayText, { color: colors.palette.critical }]}
            >
              Rain Delay
            </Text>
          </View>
        )}
      </TouchableOpacity>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 5.5,
    borderWidth: 1,
    gap: 6,
    // Subtle blur/shadow styling
    shadowColor: '#1F2A21',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  weatherIcon: {
    fontSize: 14,
    lineHeight: 18,
  },
  weatherText: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: -0.2,
  },
  loadingText: {
    fontSize: 11,
    fontWeight: '600',
  },
  rainDelayTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: 2,
  },
  rainDelayText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
});
