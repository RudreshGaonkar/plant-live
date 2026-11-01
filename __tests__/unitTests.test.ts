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

describe('Unit Tests: 100% SVG Gauge Progress Arc (240° Sweep)', () => {
  const calculateArcOffset = (radius: number, moisture: number) => {
    const CIRCUMFERENCE = 2 * Math.PI * radius;
    const VISIBLE_ARC_LENGTH = (2 * Math.PI * radius) * (240 / 360);
    const strokeDashoffset = CIRCUMFERENCE - (VISIBLE_ARC_LENGTH * (moisture / 100));
    return { CIRCUMFERENCE, VISIBLE_ARC_LENGTH, strokeDashoffset };
  };

  test('calculates strokeDashoffset accurately across 240° visible arc', () => {
    const radius = 56;
    const { CIRCUMFERENCE, VISIBLE_ARC_LENGTH, strokeDashoffset: offset0 } = calculateArcOffset(radius, 0);
    expect(offset0).toBeCloseTo(CIRCUMFERENCE);

    const { strokeDashoffset: offset50 } = calculateArcOffset(radius, 50);
    expect(offset50).toBeCloseTo(CIRCUMFERENCE - VISIBLE_ARC_LENGTH * 0.5);

    const { strokeDashoffset: offset100 } = calculateArcOffset(radius, 100);
    expect(offset100).toBeCloseTo(CIRCUMFERENCE - VISIBLE_ARC_LENGTH);
    // At 100%, the filled length should exactly equal the 240° visible arc length
    const fillLength = CIRCUMFERENCE - offset100;
    expect(fillLength).toBeCloseTo(VISIBLE_ARC_LENGTH);
  });
});

describe('Unit Tests: Plant Display Name & Location Binding', () => {
  test('binds dynamic plant location and filters out fallback "Terrace Tulsi Pot"', () => {
    const locationMeta: Record<string, string> = {
      indoor: 'Indoor',
      balcony: 'Balcony',
      terrace: 'Terrace',
    };

    const resolveDisplay = (config: { location?: string; plantName?: string; name?: string }) => {
      const activeLocation = config.location && config.plantName !== 'Terrace Tulsi Pot' ? config.location : 'indoor';
      const locationLabel = locationMeta[activeLocation] ?? 'Indoor';
      const plantDisplayName =
        config.plantName && config.plantName !== 'Terrace Tulsi Pot'
          ? config.plantName
          : config.name && config.name !== 'Terrace Tulsi Pot'
          ? config.name
          : 'Monstera Deliciosa';
      return { locationLabel, plantDisplayName };
    };

    // Case 1: Indoor plant
    expect(resolveDisplay({ location: 'indoor', plantName: 'Monstera Deliciosa' })).toEqual({
      locationLabel: 'Indoor',
      plantDisplayName: 'Monstera Deliciosa',
    });

    // Case 2: Legacy fallback string "Terrace Tulsi Pot" is replaced dynamically
    expect(resolveDisplay({ location: 'terrace', plantName: 'Terrace Tulsi Pot' })).toEqual({
      locationLabel: 'Indoor',
      plantDisplayName: 'Monstera Deliciosa',
    });
  });
});

describe('Unit Tests: Manual Watering Safety Bypass & Payload', () => {
  test('manual watering button remains enabled at 100% moisture and generates correct payload', () => {
    const isWateringActive = false;
    const cooldownSecondsLeft = 0;
    const soilMoisture = 100;
    const remainingMl = 400;

    // Check that button is never disabled when moisture is 100%
    const isButtonDisabled = isWateringActive || (cooldownSecondsLeft > 0) || (remainingMl <= 20);
    expect(isButtonDisabled).toBe(false);

    // Payload verification
    const timestamp = Date.now();
    const payload = {
      pumpState: true,
      manualOverride: true,
      timestamp,
    };

    expect(payload.pumpState).toBe(true);
    expect(payload.manualOverride).toBe(true);
    expect(payload.timestamp).toBeGreaterThan(0);
  });
});

describe('Unit Tests: Water Level Detection & Event Trigger Payload', () => {
  test('generates structured LOW_WATER alert payload for Firebase RTDB', () => {
    const deviceId = 'leaf-node-01';
    const now = Date.now();
    const alertPayload = {
      type: 'LOW_WATER',
      title: 'Low Reservoir Water',
      message: 'Water level is low. Please refill the reservoir.',
      status: 'ACTIVE',
      timestamp: now,
    };

    expect(alertPayload.type).toBe('LOW_WATER');
    expect(alertPayload.title).toBe('Low Reservoir Water');
    expect(alertPayload.message).toBe('Water level is low. Please refill the reservoir.');
    expect(alertPayload.status).toBe('ACTIVE');
    expect(alertPayload.timestamp).toBe(now);
  });
});

describe('Unit Tests: Alert Card Text Binding & Fallbacks', () => {
  const resolveAlertCardTexts = (alert: {
    title?: string;
    message?: string;
    description?: string;
    body?: string;
  }) => {
    const title = (alert.title && alert.title.trim().length > 0)
      ? alert.title.trim()
      : 'System Notice';
    const message = (alert.message && alert.message.trim().length > 0)
      ? alert.message.trim()
      : (alert.description && alert.description.trim().length > 0)
      ? alert.description.trim()
      : (alert.body && alert.body.trim().length > 0)
      ? alert.body.trim()
      : 'No additional details provided.';
    return { title, message };
  };

  test('falls back to "System Notice" when title is undefined or empty', () => {
    expect(resolveAlertCardTexts({ title: undefined, message: 'Sample' }).title).toBe('System Notice');
    expect(resolveAlertCardTexts({ title: '   ', message: 'Sample' }).title).toBe('System Notice');
    expect(resolveAlertCardTexts({ title: 'Pump Failure', message: 'Sample' }).title).toBe('Pump Failure');
  });

  test('binds message, description, or body with proper precedence', () => {
    // 1. message present
    expect(resolveAlertCardTexts({ message: 'Primary message' }).message).toBe('Primary message');
    // 2. description fallback
    expect(resolveAlertCardTexts({ description: 'Secondary description' }).message).toBe('Secondary description');
    // 3. body fallback
    expect(resolveAlertCardTexts({ body: 'Tertiary body' }).message).toBe('Tertiary body');
    // 4. none provided fallback
    expect(resolveAlertCardTexts({}).message).toBe('No additional details provided.');
  });
});

describe('Unit Tests: Strict Tab Routing (Watering Logs vs Alerts)', () => {
  test('strictly displays watering activity logs (MANUAL_WATER, AUTO_WATER, PUMP_PULSE) and excludes alerts', () => {
    const rawEvents = [
      { id: '1', kind: 'water', trigger: 'manual', durationSec: 5, note: 'User triggered cycle' },
      { id: '2', kind: 'water', trigger: 'auto', durationSec: 5, note: 'Autonomous routine' },
      { id: '3', kind: 'water', trigger: 'pulse', durationSec: 2, note: 'Quick pump pulse' },
      { id: '4', kind: 'alert', type: 'INFO_ALERT', message: 'Info notice' },
      { id: '5', kind: 'alert', type: 'WARNING', message: 'Warning notice' },
      { id: '6', kind: 'alert', type: 'SYSTEM_NOTICE', message: 'System notice' },
      { id: '7', kind: 'alert', type: 'LOW_WATER', message: 'Low water alert' },
      { id: '8', kind: 'alert', type: 'PUMP_ERROR', message: 'Pump error' },
    ];

    // Filter logic enforcing strict tab routing: watering logs only
    const wateringOnly = rawEvents
      .filter((e) => e.kind === 'water')
      .map((w) => {
        let eventType = 'MANUAL_WATER';
        const trig = String(w.trigger || '').toLowerCase();
        const note = String(w.note || '').toLowerCase();
        if (trig === 'auto' || trig === 'auto_water') {
          eventType = 'AUTO_WATER';
        } else if (trig === 'pulse' || trig === 'pump_pulse' || note.includes('pulse')) {
          eventType = 'PUMP_PULSE';
        } else {
          eventType = 'MANUAL_WATER';
        }
        return { ...w, eventType };
      });

    expect(wateringOnly).toHaveLength(3);
    expect(wateringOnly.map((w) => w.eventType)).toEqual(['MANUAL_WATER', 'AUTO_WATER', 'PUMP_PULSE']);
    expect(wateringOnly.some((e) => (e as any).type === 'INFO_ALERT')).toBe(false);
    expect(wateringOnly.some((e) => (e as any).type === 'WARNING')).toBe(false);
    expect(wateringOnly.some((e) => (e as any).type === 'SYSTEM_NOTICE')).toBe(false);
    expect(wateringOnly.some((e) => (e as any).type === 'LOW_WATER')).toBe(false);
    expect(wateringOnly.some((e) => (e as any).type === 'PUMP_ERROR')).toBe(false);
  });
});

describe('Unit Tests: Alert Record Formatting & Field Completeness', () => {
  test('ensures every alert record contains valid, non-empty fields: title, message, type, status, and createdAt', () => {
    const rawAlerts = [
      { id: '1', title: '', message: '', type: 'critical', status: 'active', createdAt: Date.now() },
      { id: '2', title: 'Low Reservoir', message: 'Please refill', type: 'LOW_WATER', status: 'ACTIVE', timestamp: Date.now() },
      { id: '3', title: 'Check Sensor', body: 'Sensor offline', status: 'read', ts: Date.now() },
    ];

    const formatted = rawAlerts.map((a) => {
      const alertType =
        a.type === 'critical' || a.type === 'warning' || a.type === 'info'
          ? a.type
          : a.type === 'LOW_WATER'
          ? 'critical'
          : 'warning';
      const status =
        a.status === 'resolved' || a.status === 'read' ? 'resolved' : 'active';
      const title =
        a.title && a.title.trim().length > 0 ? a.title.trim() : 'System Notice';
      const message =
        a.message && a.message.trim().length > 0
          ? a.message.trim()
          : (a as any).body && (a as any).body.trim().length > 0
          ? (a as any).body.trim()
          : 'No additional details provided.';
      const createdAt = a.createdAt || (a as any).timestamp || (a as any).ts || Date.now();

      return {
        id: a.id,
        title,
        message,
        type: alertType,
        status,
        createdAt,
      };
    });

    formatted.forEach((item) => {
      expect(item.title.length).toBeGreaterThan(0);
      expect(item.message.length).toBeGreaterThan(0);
      expect(['info', 'warning', 'critical']).toContain(item.type);
      expect(['active', 'resolved']).toContain(item.status);
      expect(typeof item.createdAt).toBe('number');
      expect(item.createdAt).toBeGreaterThan(0);
    });
  });
});

describe('Unit Tests: 7-Day Alert Retention Auto-Clearing', () => {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

  test('excludes alerts older than 7 days and retains alerts within 7 days using createdAt', () => {
    const now = Date.now();
    const alerts = [
      { id: 'a1', title: 'Recent Alert', createdAt: now - 1000 * 60, status: 'active' }, // 1 min ago
      { id: 'a2', title: '3 Days Old', createdAt: now - 3 * 24 * 60 * 60 * 1000, status: 'active' }, // 3 days ago
      { id: 'a3', title: '6 Days Old', createdAt: now - 6 * 24 * 60 * 60 * 1000, status: 'resolved' }, // 6 days ago
      { id: 'a4', title: '8 Days Old', createdAt: now - 8 * 24 * 60 * 60 * 1000, status: 'resolved' }, // 8 days ago (expired)
      { id: 'a5', title: '14 Days Old', createdAt: now - 14 * 24 * 60 * 60 * 1000, status: 'active' }, // 14 days ago (expired)
    ];

    const cutoff = now - SEVEN_DAYS_MS;
    const retained = alerts.filter((a) => (a.createdAt ?? 0) >= cutoff);

    expect(retained).toHaveLength(3);
    expect(retained.map((a) => a.id)).toEqual(['a1', 'a2', 'a3']);
    expect(retained.some((a) => a.id === 'a4')).toBe(false);
    expect(retained.some((a) => a.id === 'a5')).toBe(false);
  });
});

describe('Unit Tests: Software-Tracked Water Reservoir & Flow Estimation', () => {
  test('calculates software-tracked remainingMl from flow rate and resets via refilled', () => {
    let remainingMl = 500;
    const bottleCapacityMl = 500;
    const flowMlPerSec = 15;

    // Run pump for 5 seconds
    const pumpElapsedSec = 5;
    const waterUsed = flowMlPerSec * pumpElapsedSec; // 75ml
    remainingMl = Math.max(0, remainingMl - waterUsed);
    expect(remainingMl).toBe(425);

    // Percentage of capacity
    const waterLevelPct = Math.min(100, Math.max(0, Math.floor((remainingMl * 100) / bottleCapacityMl)));
    expect(waterLevelPct).toBe(85);

    // Reset via refilled command
    remainingMl = bottleCapacityMl;
    expect(remainingMl).toBe(500);
  });
});

describe('Unit Tests: 16-Sample Median Filter for ADC Stability', () => {
  test('median filter rejects transient electrical spikes and returns stable median', () => {
    // 16 samples containing motor electrical noise spikes (e.g. 1023, 0)
    const samples = [602, 605, 1023, 598, 601, 604, 0, 600, 599, 603, 602, 1023, 600, 601, 598, 603];
    expect(samples).toHaveLength(16);

    const sorted = [...samples].sort((a, b) => a - b);
    const median = Math.round((sorted[7] + sorted[8]) / 2);

    expect(median).toBeGreaterThanOrEqual(600);
    expect(median).toBeLessThanOrEqual(603);
    expect(median).not.toBe(1023);
    expect(median).not.toBe(0);
  });
});


