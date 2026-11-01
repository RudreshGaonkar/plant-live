import * as Location from 'expo-location';
import { useLiveDevice, WeatherData } from '@/store/useLiveDevice';

/** Default fallback coordinates (Goa, India) as per system specification */
export const FALLBACK_COORDINATES = {
  latitude: 15.4989,
  longitude: 73.8278,
  cityName: 'Goa',
};

export interface DeviceLocationResult {
  latitude: number;
  longitude: number;
  cityName?: string;
  isFallback: boolean;
}

export interface WeatherCondition {
  conditionText: string;
  icon: string;
  isRaining: boolean;
}

/**
 * Maps Open-Meteo WMO weather codes to condition text, icon, and isRaining flag.
 *
 * Requirements:
 * - ☀️ Clear
 * - ⛅ Cloudy
 * - 🌧️ Rainy
 */
export function mapWeatherCode(weathercode: number): WeatherCondition {
  // 0: Clear sky, 1: Mainly clear
  if (weathercode === 0 || weathercode === 1) {
    return { conditionText: 'Clear', icon: '☀️', isRaining: false };
  }

  // 2: Partly cloudy, 3: Overcast, 45, 48: Fog
  if (
    weathercode === 2 ||
    weathercode === 3 ||
    weathercode === 45 ||
    weathercode === 48
  ) {
    return { conditionText: 'Cloudy', icon: '⛅', isRaining: false };
  }

  // 51, 53, 55: Drizzle
  // 56, 57: Freezing Drizzle
  // 61, 63, 65: Rain
  // 66, 67: Freezing Rain
  // 80, 81, 82: Rain showers
  // 95, 96, 99: Thunderstorm
  if (
    (weathercode >= 51 && weathercode <= 67) ||
    (weathercode >= 80 && weathercode <= 82) ||
    (weathercode >= 95 && weathercode <= 99)
  ) {
    return { conditionText: 'Rain', icon: '🌧️', isRaining: true };
  }

  // 71..77, 85..86: Snowfall & Snow showers
  if (
    (weathercode >= 71 && weathercode <= 77) ||
    (weathercode >= 85 && weathercode <= 86)
  ) {
    return { conditionText: 'Snow', icon: '🌧️', isRaining: true };
  }

  return { conditionText: 'Cloudy', icon: '⛅', isRaining: false };
}

/**
 * Requests device foreground location permissions and fetches current GPS coordinates.
 * Falls back to Goa coordinates (15.4989, 73.8278) only if permissions are denied
 * or GPS is unavailable/timed out.
 */
export async function getDeviceLocation(): Promise<DeviceLocationResult> {
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      console.log('[WeatherService] Foreground location permission denied, using Goa fallback coordinates');
      return {
        latitude: FALLBACK_COORDINATES.latitude,
        longitude: FALLBACK_COORDINATES.longitude,
        cityName: FALLBACK_COORDINATES.cityName,
        isFallback: true,
      };
    }

    // Set a safety timeout of 8s for GPS positioning
    let timeoutId: any;
    const locationPromise = Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('GPS location request timed out')), 8000);
    });

    let position;
    try {
      position = await Promise.race([locationPromise, timeoutPromise]);
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }

    if (!position || !position.coords) {
      throw new Error('No GPS coordinates returned');
    }

    const { latitude, longitude } = position.coords;

    // Optional reverse geocoding to retrieve friendly city name
    let cityName: string | undefined;
    try {
      const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geocode && geocode.length > 0) {
        const place = geocode[0];
        cityName = place.city || place.subregion || place.region || place.name || undefined;
      }
    } catch {
      // Reverse geocoding error ignored
    }

    return {
      latitude,
      longitude,
      cityName,
      isFallback: false,
    };
  } catch (err) {
    console.warn('[WeatherService] Location fetch failed or unavailable, falling back to Goa:', err);
    return {
      latitude: FALLBACK_COORDINATES.latitude,
      longitude: FALLBACK_COORDINATES.longitude,
      cityName: FALLBACK_COORDINATES.cityName,
      isFallback: true,
    };
  }
}

/**
 * Calls Open-Meteo API using exact dynamic GPS coordinates and extracts:
 * temperature, weathercode, condition text, weather icon, isRaining, and rainProbability.
 */
export async function fetchWeatherFromOpenMeteo(
  latitude: number,
  longitude: number,
  cityName?: string,
  isFallback: boolean = false
): Promise<WeatherData> {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true&hourly=precipitation_probability`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Open-Meteo HTTP error: ${response.status}`);
  }

  const data = await response.json();
  const current = data.current_weather || {};

  const temperature =
    typeof current.temperature === 'number'
      ? Math.round(current.temperature * 10) / 10
      : 28;
  const weathercode =
    typeof current.weathercode === 'number' ? current.weathercode : 0;

  const { conditionText, icon, isRaining } = mapWeatherCode(weathercode);

  // Parse hourly precipitation probability corresponding to current hour
  let rainProbability = 0;
  if (
    data.hourly &&
    Array.isArray(data.hourly.precipitation_probability) &&
    data.hourly.precipitation_probability.length > 0
  ) {
    const currentTime = current.time as string | undefined;
    let targetIndex = -1;

    if (currentTime && Array.isArray(data.hourly.time)) {
      // Match current hour prefix: e.g. "2026-11-01T17"
      const hourPrefix = currentTime.slice(0, 13);
      targetIndex = data.hourly.time.findIndex(
        (t: string) => typeof t === 'string' && t.startsWith(hourPrefix)
      );
    }

    if (
      targetIndex >= 0 &&
      typeof data.hourly.precipitation_probability[targetIndex] === 'number'
    ) {
      rainProbability = data.hourly.precipitation_probability[targetIndex];
    } else if (
      typeof data.hourly.precipitation_probability[0] === 'number'
    ) {
      rainProbability = data.hourly.precipitation_probability[0];
    }
  }

  return {
    temperature,
    weathercode,
    conditionText,
    icon,
    isRaining,
    rainProbability,
    latitude,
    longitude,
    cityName: cityName || (isFallback ? 'Goa' : undefined),
    isFallback,
    lastUpdated: Date.now(),
  };
}

/**
 * High-level orchestration function to fetch device GPS location and update
 * global weather state in useLiveDevice store. Caches for 10 minutes unless forced.
 */
export async function refreshWeatherData(force = false): Promise<WeatherData> {
  const store = useLiveDevice.getState();
  const current = store.weather;
  const tenMinutesMs = 10 * 60 * 1000;

  if (!force && current && Date.now() - current.lastUpdated < tenMinutesMs) {
    return current;
  }

  store.setWeatherLoading(true);
  try {
    const loc = await getDeviceLocation();
    const weatherData = await fetchWeatherFromOpenMeteo(
      loc.latitude,
      loc.longitude,
      loc.cityName,
      loc.isFallback
    );
    store.setWeather(weatherData);
    return weatherData;
  } catch (error) {
    console.warn('[WeatherService] Error refreshing weather data:', error);
    // If request failed, fall back to Goa if we have no prior weather
    if (!current) {
      const fallbackWeather = await fetchWeatherFromOpenMeteo(
        FALLBACK_COORDINATES.latitude,
        FALLBACK_COORDINATES.longitude,
        FALLBACK_COORDINATES.cityName,
        true
      );
      store.setWeather(fallbackWeather);
      return fallbackWeather;
    }
    return current;
  } finally {
    store.setWeatherLoading(false);
  }
}
