import { computePlantHealthState, DeviceRecord } from '../src/store/useLiveDevice';
import {
  rawToMoisturePercent,
  evaluateAutoWaterDecision,
  DEFAULT_CALIBRATION,
} from '../src/services/calibration';

describe('Unit Tests: Plant Health State Mapping', () => {
  const baseDevice: DeviceRecord = {
    id: 'test-device-1',
    config: {
      name: 'Test Plant',
      plantName: 'Monstera Deliciosa',
      plantSpecies: 'Swiss Cheese Plant',
      location: 'balcony',
      mode: 'auto',
      thresholds: {
        moistureMin: 30,
        moistureMax: 60,
        tempMax: 35,
        humidityMax: 80,
        pumpDurationSec: 5,
      },
      sensors: { lightMode: 'digital' },
      calibration: { soilDryRaw: 1024, soilWetRaw: 400 },
      bottle: { capacityMl: 500, flowMlPerSec: 15, remainingMl: 400 },
      pairedAt: 1700000000000,
    },
    telemetry: {
      soilRaw: 700,
      soilMoisture: 45,
      temperature: 26,
      humidity: 60,
      light: 1,
      pumpOn: false,
      rssi: -60,
      ts: Date.now(),
    },
    status: {
      online: true,
      lastSeen: Date.now(),
      firmware: 'v1.0.0',
    },
  };

  test('returns "unknown" if device is undefined or offline', () => {
    expect(computePlantHealthState(undefined)).toBe('unknown');

    const offlineDevice: DeviceRecord = {
      ...baseDevice,
      status: { ...baseDevice.status, online: false },
    };
    expect(computePlantHealthState(offlineDevice)).toBe('unknown');
  });

  test('returns "thirsty" when soilMoisture is strictly below moistureMin', () => {
    const thirstyDevice: DeviceRecord = {
      ...baseDevice,
      telemetry: { ...baseDevice.telemetry, soilMoisture: 24 },
    };
    expect(computePlantHealthState(thirstyDevice)).toBe('thirsty');
  });

  test('returns "overwatered" when soilMoisture exceeds moistureMax', () => {
    const overwateredDevice: DeviceRecord = {
      ...baseDevice,
      telemetry: { ...baseDevice.telemetry, soilMoisture: 75 },
    };
    expect(computePlantHealthState(overwateredDevice)).toBe('overwatered');
  });

  test('returns "healthy" when soilMoisture is within min and max thresholds', () => {
    const healthyDevice: DeviceRecord = {
      ...baseDevice,
      telemetry: { ...baseDevice.telemetry, soilMoisture: 45 },
    };
    expect(computePlantHealthState(healthyDevice)).toBe('healthy');

    // Boundary condition: exactly at moistureMin
    const boundaryMin: DeviceRecord = {
      ...baseDevice,
      telemetry: { ...baseDevice.telemetry, soilMoisture: 30 },
    };
    expect(computePlantHealthState(boundaryMin)).toBe('healthy');

    // Boundary condition: exactly at moistureMax
    const boundaryMax: DeviceRecord = {
      ...baseDevice,
      telemetry: { ...baseDevice.telemetry, soilMoisture: 60 },
    };
    expect(computePlantHealthState(boundaryMax)).toBe('healthy');
  });
});

describe('Unit Tests: Location Threshold Defaults', () => {
  const getLocationDefaults = (location: 'balcony' | 'terrace' | 'indoor') => {
    const moistureMin = location === 'terrace' ? 25 : location === 'balcony' ? 30 : 35;
    const moistureMax = location === 'terrace' ? 55 : location === 'balcony' ? 60 : 65;
    const tempMax = location === 'terrace' ? 32 : 35;
    return { moistureMin, moistureMax, tempMax };
  };

  test('verifies balcony defaults', () => {
    const { moistureMin, moistureMax, tempMax } = getLocationDefaults('balcony');
    expect(moistureMin).toBe(30);
    expect(moistureMax).toBe(60);
    expect(tempMax).toBe(35);
  });

  test('verifies terrace defaults', () => {
    const { moistureMin, moistureMax, tempMax } = getLocationDefaults('terrace');
    expect(moistureMin).toBe(25);
    expect(moistureMax).toBe(55);
    expect(tempMax).toBe(32);
  });

  test('verifies indoor defaults', () => {
    const { moistureMin, moistureMax, tempMax } = getLocationDefaults('indoor');
    expect(moistureMin).toBe(35);
    expect(moistureMax).toBe(65);
    expect(tempMax).toBe(35);
  });
});

describe('Unit Tests: Soil Moisture Raw-to-Percentage Calibration Math', () => {
  const cal = { soilDryRaw: 1024, soilWetRaw: 400 };

  test('calibrates dry air raw value to 0%', () => {
    expect(rawToMoisturePercent(1024, cal)).toBe(0);
    expect(rawToMoisturePercent(1100, cal)).toBe(0); // Over dry clamped to 0
  });

  test('calibrates full water raw value to 100%', () => {
    expect(rawToMoisturePercent(400, cal)).toBe(100);
    expect(rawToMoisturePercent(350, cal)).toBe(100); // Beyond wet clamped to 100
  });

  test('calculates mid-range moisture values linearly', () => {
    // Midpoint: (1024 + 400) / 2 = 712
    const midPercent = rawToMoisturePercent(712, cal);
    expect(midPercent).toBeCloseTo(50, 0);
  });

  test('uses default calibration values when none provided', () => {
    expect(rawToMoisturePercent(DEFAULT_CALIBRATION.soilDryRaw)).toBe(0);
    expect(rawToMoisturePercent(DEFAULT_CALIBRATION.soilWetRaw)).toBe(100);
  });
});

describe('Unit Tests: Auto-Watering & Coastal Humidity Guard Logic', () => {
  const baseInput = {
    mode: 'auto' as const,
    remainingBottleMl: 350,
    minReserveMl: 20,
    soilMoisture: 22, // Below 30% min
    moistureMin: 30,
    humidity: 65,
    humidityMax: 80,
    temperature: 27,
    tempMax: 35,
    light: 1,
  };

  test('triggers watering when conditions are optimal', () => {
    const decision = evaluateAutoWaterDecision(baseInput);
    expect(decision.action).toBe('water');
    expect(decision.reason).toBe('optimal_cycle');
  });

  test('skips watering when in manual mode', () => {
    const decision = evaluateAutoWaterDecision({ ...baseInput, mode: 'manual' });
    expect(decision.action).toBe('skip');
    expect(decision.reason).toBe('manual_mode');
  });

  test('skips watering when bottle reserve is empty or <= minReserve', () => {
    const decision = evaluateAutoWaterDecision({ ...baseInput, remainingBottleMl: 15 });
    expect(decision.action).toBe('skip');
    expect(decision.reason).toBe('bottle_reserve_low');
  });

  test('skips watering when soil moisture is already adequate', () => {
    const decision = evaluateAutoWaterDecision({ ...baseInput, soilMoisture: 38 });
    expect(decision.action).toBe('skip');
    expect(decision.reason).toBe('moisture_adequate');
  });

  test('activates coastal humidity guard when ambient humidity is high and moisture within 10% of min', () => {
    // moistureMin = 30; soilMoisture = 24 (> 30 - 10 = 20) and humidity = 85 (> 80)
    const decision = evaluateAutoWaterDecision({
      ...baseInput,
      soilMoisture: 24,
      humidity: 85,
    });
    expect(decision.action).toBe('delay');
    expect(decision.reason).toBe('coastal_humidity_guard');
  });

  test('bypasses coastal guard if soil is severely dry (below moistureMin - 10)', () => {
    // moistureMin = 30; soilMoisture = 15 (<= 20) even if humidity is high
    const decision = evaluateAutoWaterDecision({
      ...baseInput,
      soilMoisture: 15,
      humidity: 88,
    });
    expect(decision.action).toBe('water');
  });

  test('delays watering during extreme midday heat with direct sunlight', () => {
    const decision = evaluateAutoWaterDecision({
      ...baseInput,
      temperature: 38,
      tempMax: 35,
      light: 1, // bright sunlight
    });
    expect(decision.action).toBe('delay');
    expect(decision.reason).toBe('midday_heat_sun_guard');
  });
});
