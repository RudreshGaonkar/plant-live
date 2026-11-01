import * as Location from 'expo-location';
import {
  mapWeatherCode,
  getDeviceLocation,
  fetchWeatherFromOpenMeteo,
  FALLBACK_COORDINATES,
} from '../src/services/weather';
import {
  evaluateAutoWaterDecision,
  CRITICAL_MIN,
} from '../src/services/calibration';

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  reverseGeocodeAsync: jest.fn(),
  Accuracy: {
    Balanced: 3,
  },
}));

describe('Unit Tests: Dynamic Weather & Device Location Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Device Location & Fallback to Goa', () => {
    test('fetches exact GPS coordinates when permission is granted', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
      });
      (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValueOnce({
        coords: {
          latitude: 19.076,
          longitude: 72.8777,
        },
      });
      (Location.reverseGeocodeAsync as jest.Mock).mockResolvedValueOnce([
        { city: 'Mumbai' },
      ]);

      const loc = await getDeviceLocation();
      expect(loc.latitude).toBeCloseTo(19.076);
      expect(loc.longitude).toBeCloseTo(72.8777);
      expect(loc.cityName).toBe('Mumbai');
      expect(loc.isFallback).toBe(false);
    });

    test('falls back to Goa coordinates (15.4989, 73.8278) when permission is denied', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'denied',
      });

      const loc = await getDeviceLocation();
      expect(loc.latitude).toBe(FALLBACK_COORDINATES.latitude);
      expect(loc.longitude).toBe(FALLBACK_COORDINATES.longitude);
      expect(loc.cityName).toBe('Goa');
      expect(loc.isFallback).toBe(true);
      expect(Location.getCurrentPositionAsync).not.toHaveBeenCalled();
    });

    test('falls back to Goa coordinates if GPS request throws error', async () => {
      (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValueOnce({
        status: 'granted',
      });
      (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValueOnce(
        new Error('GPS signal unavailable')
      );

      const loc = await getDeviceLocation();
      expect(loc.latitude).toBe(FALLBACK_COORDINATES.latitude);
      expect(loc.longitude).toBe(FALLBACK_COORDINATES.longitude);
      expect(loc.cityName).toBe('Goa');
      expect(loc.isFallback).toBe(true);
    });
  });

  describe('2. Open-Meteo Weather Code Parsing & Icons', () => {
    test('maps code 0 and 1 to ☀️ Clear with isRaining: false', () => {
      const clear0 = mapWeatherCode(0);
      expect(clear0.conditionText).toBe('Clear');
      expect(clear0.icon).toBe('☀️');
      expect(clear0.isRaining).toBe(false);

      const clear1 = mapWeatherCode(1);
      expect(clear1.conditionText).toBe('Clear');
      expect(clear1.icon).toBe('☀️');
      expect(clear1.isRaining).toBe(false);
    });

    test('maps cloudy and overcast codes (2, 3, 45, 48) to ⛅ Cloudy with isRaining: false', () => {
      const partlyCloudy = mapWeatherCode(2);
      expect(partlyCloudy.conditionText).toBe('Cloudy');
      expect(partlyCloudy.icon).toBe('⛅');
      expect(partlyCloudy.isRaining).toBe(false);

      const overcast = mapWeatherCode(3);
      expect(overcast.conditionText).toBe('Cloudy');
      expect(overcast.icon).toBe('⛅');
      expect(overcast.isRaining).toBe(false);

      const fog = mapWeatherCode(45);
      expect(fog.conditionText).toBe('Cloudy');
      expect(fog.icon).toBe('⛅');
      expect(fog.isRaining).toBe(false);
    });

    test('maps drizzle, rain, showers, and thunderstorms to 🌧️ Rain with isRaining: true', () => {
      // Drizzle
      const drizzle = mapWeatherCode(51);
      expect(drizzle.conditionText).toBe('Rain');
      expect(drizzle.icon).toBe('🌧️');
      expect(drizzle.isRaining).toBe(true);

      // Rain
      const rain = mapWeatherCode(61);
      expect(rain.conditionText).toBe('Rain');
      expect(rain.icon).toBe('🌧️');
      expect(rain.isRaining).toBe(true);

      // Showers
      const showers = mapWeatherCode(80);
      expect(showers.conditionText).toBe('Rain');
      expect(showers.icon).toBe('🌧️');
      expect(showers.isRaining).toBe(true);

      // Thunderstorm
      const thunderstorm = mapWeatherCode(95);
      expect(thunderstorm.conditionText).toBe('Rain');
      expect(thunderstorm.icon).toBe('🌧️');
      expect(thunderstorm.isRaining).toBe(true);
    });
  });

  describe('3. Dynamic Weather API Fetching & Response Parsing', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    test('parses temperature, weathercode, condition text, isRaining, and hourly rainProbability', async () => {
      const mockApiResponse = {
        current_weather: {
          temperature: 28.4,
          weathercode: 61,
          time: '2026-11-01T15:00',
        },
        hourly: {
          time: ['2026-11-01T14:00', '2026-11-01T15:00', '2026-11-01T16:00'],
          precipitation_probability: [20, 85, 90],
        },
      };

      global.fetch = jest.fn().mockResolvedValueOnce({
        ok: true,
        json: async () => mockApiResponse,
      }) as any;

      const report = await fetchWeatherFromOpenMeteo(15.4989, 73.8278, 'Panaji', false);

      expect(report.temperature).toBe(28.4);
      expect(report.weathercode).toBe(61);
      expect(report.conditionText).toBe('Rain');
      expect(report.icon).toBe('🌧️');
      expect(report.isRaining).toBe(true);
      expect(report.rainProbability).toBe(85);
      expect(report.cityName).toBe('Panaji');
      expect(report.isFallback).toBe(false);
    });
  });

  describe('4. Smart Terrace Rain Delay Logic', () => {
    const baseInput = {
      mode: 'auto' as const,
      remainingBottleMl: 400,
      minReserveMl: 20,
      soilMoisture: 20, // Below moistureMin (25)
      moistureMin: 25,
      humidity: 50,
      humidityMax: 85,
      temperature: 28,
      tempMax: 38,
      location: 'terrace',
      rainProbability: 75, // > 70%
    };

    test('applies rain delay ONLY when location is "terrace" and rain probability > 70%', () => {
      const decision = evaluateAutoWaterDecision(baseInput);
      expect(decision.action).toBe('delay');
      expect(decision.reason).toBe('terrace_rain_delay');
    });

    test('overrides rain delay if soil moisture drops below CRITICAL_MIN (15%)', () => {
      const criticalMoistureInput = {
        ...baseInput,
        soilMoisture: 14, // < 15% CRITICAL_MIN
      };

      const decision = evaluateAutoWaterDecision(criticalMoistureInput);
      // Even with 75% rain probability on terrace, critical dryness triggers watering
      expect(decision.action).toBe('water');
      expect(decision.reason).toBe('optimal_cycle');
    });

    test('does NOT delay watering for indoor plants even with high rain probability', () => {
      const indoorInput = {
        ...baseInput,
        location: 'indoor',
        soilMoisture: 22,
        moistureMin: 35,
        rainProbability: 95,
      };

      const decision = evaluateAutoWaterDecision(indoorInput);
      expect(decision.action).toBe('water');
      expect(decision.reason).not.toBe('terrace_rain_delay');
    });

    test('does NOT delay watering for balcony plants under rain probability', () => {
      const balconyInput = {
        ...baseInput,
        location: 'balcony',
        soilMoisture: 22,
        moistureMin: 30,
        rainProbability: 85,
      };

      const decision = evaluateAutoWaterDecision(balconyInput);
      expect(decision.action).toBe('water');
      expect(decision.reason).not.toBe('terrace_rain_delay');
    });

    test('does NOT delay when rain probability is 70% or below on terrace', () => {
      const lowRainInput = {
        ...baseInput,
        rainProbability: 70, // Not strictly > 70
      };

      const decision = evaluateAutoWaterDecision(lowRainInput);
      expect(decision.action).toBe('water');
    });

    test('does NOT affect manual watering mode', () => {
      const manualInput = {
        ...baseInput,
        mode: 'manual' as const,
      };

      const decision = evaluateAutoWaterDecision(manualInput);
      expect(decision.action).toBe('skip');
      expect(decision.reason).toBe('manual_mode');
    });
  });
});
