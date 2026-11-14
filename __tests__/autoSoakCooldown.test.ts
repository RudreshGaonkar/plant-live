import { computeAutoSoakCooldown } from '../src/hooks/useAutoSoakCooldown';
import { createDefaultDeviceRecord, DeviceTelemetry } from '../src/store/useLiveDevice';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  AppState: {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

jest.mock('expo-device', () => ({}));

const createTelemetryFixture = (overrides?: Partial<DeviceTelemetry>): DeviceTelemetry => ({
  soilMoisture: 45,
  soilRaw: 600,
  temperature: 24,
  humidity: 60,
  light: 50,
  pumpOn: false,
  isPumpActive: false,
  rssi: -65,
  ts: Date.now(),
  ...overrides,
});

describe('useAutoSoakCooldown & computeAutoSoakCooldown Suite', () => {
  it('returns inactive state when telemetry is null (unhydrated device)', () => {
    const dev = createDefaultDeviceRecord('dev-unhydrated');
    dev.status.online = true;
    dev.config.mode = 'auto';
    expect(dev.telemetry).toBeNull();

    const result = computeAutoSoakCooldown(dev);
    expect(result.isCoolingDown).toBe(false);
    expect(result.remainingSec).toBe(0);
    expect(result.formattedText).toBe('');
  });

  it('returns inactive state when device has no cooldown or is offline', () => {
    const dev = createDefaultDeviceRecord('dev-1');
    dev.status.online = false;
    dev.telemetry = createTelemetryFixture();

    const result = computeAutoSoakCooldown(dev);
    expect(result.isCoolingDown).toBe(false);
    expect(result.remainingSec).toBe(0);
    expect(result.formattedText).toBe('');
  });

  it('returns inactive state when device is in manual mode', () => {
    const dev = createDefaultDeviceRecord('dev-1');
    dev.status.online = true;
    dev.config.mode = 'manual';
    dev.telemetry = createTelemetryFixture({
      ts: Date.now(),
      autoCooldownRemainingSec: 600,
    });

    const result = computeAutoSoakCooldown(dev);
    expect(result.isCoolingDown).toBe(false);
    expect(result.remainingSec).toBe(0);
    expect(result.formattedText).toBe('');
  });

  it('computes live countdown and rounded-up minutes when cooldown is active', () => {
    const now = 1700000000000;
    const dev = createDefaultDeviceRecord('dev-1');
    dev.status.online = true;
    dev.config.mode = 'auto';
    dev.telemetry = createTelemetryFixture({
      ts: now - 10000, // 10s elapsed
      autoCooldownRemainingSec: 1800, // 30m total
    });

    const result = computeAutoSoakCooldown(dev, now);
    expect(result.isCoolingDown).toBe(true);
    // 1800 - 10 = 1790s -> 30m left
    expect(result.remainingSec).toBe(1790);
    expect(result.remainingMinutes).toBe(30);
    expect(result.formattedText).toBe('Soaking cooldown (30m left)');
  });

  it('hides countdown when telemetry sample is stale (> 3 minutes)', () => {
    const now = 1700000000000;
    const dev = createDefaultDeviceRecord('dev-1');
    dev.status.online = true;
    dev.config.mode = 'auto';
    dev.telemetry = createTelemetryFixture({
      ts: now - (4 * 60 * 1000), // 4m ago (stale)
      autoCooldownRemainingSec: 1000,
    });

    const result = computeAutoSoakCooldown(dev, now);
    expect(result.isCoolingDown).toBe(false);
    expect(result.remainingSec).toBe(0);
    expect(result.formattedText).toBe('');
  });

  it('evaluates different device records correctly upon device switch', () => {
    const now = 1700000000000;
    const dev1 = createDefaultDeviceRecord('dev-1');
    dev1.status.online = true;
    dev1.config.mode = 'auto';
    dev1.telemetry = createTelemetryFixture({
      ts: now,
      autoCooldownRemainingSec: 600,
    });

    const dev2 = createDefaultDeviceRecord('dev-2');
    dev2.status.online = true;
    dev2.config.mode = 'auto';
    dev2.telemetry = createTelemetryFixture({
      ts: now,
      autoCooldownRemainingSec: 0,
    });

    const result1 = computeAutoSoakCooldown(dev1, now);
    expect(result1.isCoolingDown).toBe(true);
    expect(result1.formattedText).toBe('Soaking cooldown (10m left)');

    const result2 = computeAutoSoakCooldown(dev2, now);
    expect(result2.isCoolingDown).toBe(false);
    expect(result2.formattedText).toBe('');
  });
});
