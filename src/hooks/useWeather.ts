import { useEffect, useState, useCallback } from 'react';
import { useLiveDevice, WeatherData } from '@/store/useLiveDevice';
import { refreshWeatherData } from '@/services/weather';
import { CRITICAL_MIN } from '@/services/calibration';

export interface UseWeatherResult {
  weather: WeatherData | null;
  loading: boolean;
  error: string | null;
  refresh: (force?: boolean) => Promise<void>;
  isRainDelayActive: boolean;
  rainProbability: number;
}

/**
 * useWeather Hook
 * Automatically fetches and subscribes to dynamic device-location weather data.
 * Evaluates Smart Terrace Rain Delay logic according to active plant location and soil moisture.
 */
export function useWeather(
  plantLocation?: string,
  soilMoisture?: number
): UseWeatherResult {
  const weather = useLiveDevice((s) => s.weather);
  const loading = useLiveDevice((s) => s.weatherLoading);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (force = true) => {
    try {
      await refreshWeatherData(force);
      setError(null);
    } catch (err: any) {
      setError(err?.message || 'Failed to update weather');
    }
  }, []);

  useEffect(() => {
    let isMounted = true;
    if (!weather) {
      refreshWeatherData(false).catch((err: any) => {
        if (isMounted) {
          setError(err?.message || 'Failed to update weather');
        }
      });
    }
    return () => {
      isMounted = false;
    };
  }, [weather]);

  // Smart Terrace Rain Delay Evaluation:
  // Apply rain-delay logic using dynamic weather data ONLY when active plant location is "terrace"
  // and rain probability exceeds 70%.
  // Override rain-delay if soil moisture drops below CRITICAL_MIN (15%) to avoid false alarms.
  const isTerrace = (plantLocation || '').trim().toLowerCase() === 'terrace';
  const rainProbability = weather?.rainProbability ?? 0;
  const isCriticalMoisture =
    typeof soilMoisture === 'number' && soilMoisture < CRITICAL_MIN;

  const isRainDelayActive = Boolean(
    isTerrace && rainProbability > 70 && !isCriticalMoisture
  );

  return {
    weather,
    loading,
    error,
    refresh,
    isRainDelayActive,
    rainProbability,
  };
}
