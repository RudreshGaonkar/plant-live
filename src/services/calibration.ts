/**
 * Soil Moisture and Sensor Calibration Helpers
 * Spec Section 8.4:
 *   soilMoisture% = clamp(map(soilRaw, soilDryRaw, soilWetRaw, 0, 100))
 */

export interface CalibrationValues {
  soilDryRaw: number;
  soilWetRaw: number;
}

export const DEFAULT_CALIBRATION: CalibrationValues = {
  soilDryRaw: 1024,
  soilWetRaw: 400,
};

/**
 * Maps raw capacitive/resistive sensor ADC reading into calibrated percentage (0-100%).
 * Note: Lower raw ADC value typically corresponds to higher moisture in water.
 */
export function rawToMoisturePercent(
  soilRaw: number,
  calibration: CalibrationValues = DEFAULT_CALIBRATION
): number {
  const { soilDryRaw, soilWetRaw } = calibration;
  if (soilDryRaw === soilWetRaw) return 0;

  // Inverse mapping: dryRaw -> 0%, wetRaw -> 100%
  const percentage = ((soilDryRaw - soilRaw) / (soilDryRaw - soilWetRaw)) * 100;

  // Clamp within 0 - 100%
  return Math.max(0, Math.min(100, Math.round(percentage * 10) / 10));
}

/**
 * Evaluates whether auto-watering should trigger or be delayed.
 * Implements Spec Section 8.1 & coastal-humidity guard:
 * 
 * if mode == "auto" and estimatedBottleMl > minReserve:
 *     if soilMoisture < moistureMin:
 *         if humidity > humidityMax and soilMoisture > moistureMin - 10:
 *             skip, "delayed: high humidity"  // coastal-humidity guard
 *         elif temperature > tempMax and lightIsBright:
 *             delay until cooler
 *         else:
 *             trigger auto cycle
 */
export const CRITICAL_MIN = 15;

export interface AutoWaterEvaluationInput {
  mode: 'auto' | 'manual';
  remainingBottleMl: number;
  minReserveMl?: number;
  soilMoisture: number;
  moistureMin: number;
  humidity: number;
  humidityMax: number;
  temperature: number;
  tempMax: number;
  light?: number | null; // 1 = bright, 0 = dim/dark
  location?: 'indoor' | 'balcony' | 'terrace' | string;
  rainProbability?: number; // 0 - 100 percentage
}

export type AutoWaterDecision =
  | { action: 'water'; reason: string }
  | { action: 'skip'; reason: string }
  | { action: 'delay'; reason: string };

export function evaluateAutoWaterDecision(
  input: AutoWaterEvaluationInput
): AutoWaterDecision {
  const minReserve = input.minReserveMl ?? 20;

  if (input.mode !== 'auto') {
    return { action: 'skip', reason: 'manual_mode' };
  }

  if (input.remainingBottleMl <= minReserve) {
    return { action: 'skip', reason: 'bottle_reserve_low' };
  }

  if (input.soilMoisture >= input.moistureMin) {
    return { action: 'skip', reason: 'moisture_adequate' };
  }

  // Soil is below moistureMin: check guards

  // Smart Terrace Rain Delay Logic:
  // Apply rain-delay logic using this dynamic weather data ONLY when the active plant location is set to "Terrace" and rain probability exceeds 70%.
  // Override rain-delay if soil moisture drops below CRITICAL_MIN (15%) to avoid false alarms.
  // Do NOT affect manual watering or indoor plants.
  if (
    input.location === 'terrace' &&
    typeof input.rainProbability === 'number' &&
    input.rainProbability > 70 &&
    input.soilMoisture >= CRITICAL_MIN
  ) {
    return { action: 'delay', reason: 'terrace_rain_delay' };
  }

  // 1. Coastal high humidity guard
  if (
    input.humidity > input.humidityMax &&
    input.soilMoisture > input.moistureMin - 10
  ) {
    return { action: 'delay', reason: 'coastal_humidity_guard' };
  }

  // 2. Midday heat & direct bright light guard
  if (input.temperature > input.tempMax && input.light === 1) {
    return { action: 'delay', reason: 'midday_heat_sun_guard' };
  }

  return { action: 'water', reason: 'optimal_cycle' };
}
