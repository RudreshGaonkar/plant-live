import { runTransaction, update } from 'firebase/database';
import {
  updateDeviceLocationAndPreset,
  updateDevicePumpDuration,
  updateDeviceThreshold,
} from '../src/services/devices';
import { createDefaultDeviceRecord, useLiveDevice } from '../src/store/useLiveDevice';
import { DEFAULT_USER_PREFS, useSession } from '../src/store/useSession';
import { createDeviceSettingsQueue } from '../src/utils/deviceSettingsWrites';

jest.mock('../src/services/firebase', () => ({ auth: { currentUser: { uid: 'grower' } }, db: {} }));
jest.mock('firebase/database', () => ({
  ref: jest.fn((_db, path) => path),
  update: jest.fn().mockResolvedValue(undefined),
  runTransaction: jest.fn(),
}));
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn().mockResolvedValue(undefined),
  removeItem: jest.fn().mockResolvedValue(undefined),
}));

function deferredWrite() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}

describe('Device settings synchronization', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLiveDevice.getState().clearDeviceState();
    useLiveDevice.setState({
      devices: { balcony: createDefaultDeviceRecord('balcony'), patio: createDefaultDeviceRecord('patio') },
      activeDeviceId: 'balcony',
    });
    useSession.setState({
      user: { uid: 'grower', email: 'grower@example.com', displayName: 'Grower' },
      prefs: DEFAULT_USER_PREFS,
    });
  });

  it('serializes settings that overlap on a device and keeps another device independent', async () => {
    const enqueue = createDeviceSettingsQueue();
    const result = deferredWrite();
    const first = jest.fn(() => result.promise);
    const sameField = jest.fn();
    const preset = jest.fn().mockResolvedValue(undefined);
    const other = jest.fn().mockResolvedValue(undefined);

    const slow = enqueue('grower/balcony', 'moistureMin', first);
    expect(enqueue('grower/balcony', 'moistureMin', sameField)).toBeUndefined();
    const queued = enqueue('grower/balcony', 'location', preset);
    await enqueue('grower/patio', 'moistureMin', other);
    expect(first).toHaveBeenCalledTimes(1);
    expect(other).toHaveBeenCalledTimes(1);
    expect(preset).not.toHaveBeenCalled();

    useLiveDevice.getState().setActiveDeviceId('patio');
    result.resolve();
    await Promise.all([slow, queued]);
    expect(preset).toHaveBeenCalledTimes(1);
    expect(sameField).not.toHaveBeenCalled();
    expect(useLiveDevice.getState().devices.patio.config.thresholds.moistureMin).toBe(35);
  });

  it('validates moisture pairs against stored counterparts in a thresholds transaction', async () => {
    let stored = { moistureMin: 40, moistureMax: 65, pumpDurationSec: 7 };
    (runTransaction as jest.Mock).mockImplementation(async (_path, mutate) => {
      const next = mutate(stored);
      if (next === undefined) return { committed: false };
      stored = next;
      return { committed: true };
    });

    const results = await Promise.allSettled([
      updateDeviceThreshold('balcony', 'moistureMin', 50),
      updateDeviceThreshold('balcony', 'moistureMax', 50),
    ]);
    expect(results.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(runTransaction).toHaveBeenCalledWith(
      'devices/balcony/config/thresholds', expect.any(Function), { applyLocally: false },
    );
    expect(stored).toEqual({ moistureMin: 50, moistureMax: 65, pumpDurationSec: 7 });
    expect(update).not.toHaveBeenCalled();
  });

  it('rejects invalid bounds and runtimes before making a write', async () => {
    await expect(updateDeviceThreshold('balcony', 'moistureMin', 9)).rejects.toThrow();
    await expect(updateDeviceThreshold('balcony', 'moistureMax', 91)).rejects.toThrow();
    await expect(updateDeviceThreshold('balcony', 'tempMax', Infinity)).rejects.toThrow();
    for (const seconds of [0, 15.1, 4.5, NaN]) {
      await expect(updateDevicePumpDuration('balcony', seconds)).rejects.toThrow();
    }
    expect(update).not.toHaveBeenCalled();
    expect(runTransaction).not.toHaveBeenCalled();
  });

  it('writes duration aliases atomically with a preset and leaves unrelated fields alone', async () => {
    await updateDeviceLocationAndPreset('balcony', 'terrace', {
      moistureMin: 25, moistureMax: 55, pumpDurationSec: 9,
    });
    expect(update).toHaveBeenCalledWith('devices/balcony/config', {
      location: 'terrace',
      'thresholds/moistureMin': 25,
      'thresholds/moistureMax': 55,
      'thresholds/tempMax': 35,
      'thresholds/humidityMax': 80,
      'thresholds/pumpDurationSec': 9,
      'thresholds/waterDurationSec': 9,
      pumpDurationSec: 9,
      waterDurationSec: 9,
    });
  });

  it('applies device-scoped config snapshots and reads legacy duration aliases', () => {
    useLiveDevice.getState().setActiveDeviceId('patio');
    useLiveDevice.getState().updateConfig({ waterDurationSec: 12, mode: 'manual' }, 'balcony');
    const { devices } = useLiveDevice.getState();
    expect(devices.balcony.config.thresholds.pumpDurationSec).toBe(12);
    expect(devices.balcony.configStatus).toBe('ready');
    expect(devices.balcony.config.mode).toBe('manual');
    expect(devices.patio.config.thresholds.pumpDurationSec).toBe(5);
    expect(devices.patio.config.mode).toBe('auto');
  });

  it('keeps a zero moisture reading distinct from an absent snapshot', () => {
    const store = useLiveDevice.getState();
    expect(store.devices.balcony.telemetry).toBeNull();
    store.updateTelemetry({ soilMoisture: 0, ts: Date.now() }, 'balcony');
    expect(useLiveDevice.getState().devices.balcony.telemetry?.soilMoisture).toBe(0);
    expect(useLiveDevice.getState().devices.balcony.telemetryStatus).toBe('ready');
    store.clearTelemetry('balcony');
    expect(useLiveDevice.getState().devices.balcony.telemetry).toBeNull();
    expect(useLiveDevice.getState().devices.balcony.telemetryStatus).toBe('empty');
  });

  it('rolls a failed mode change back on its original controller after a switch', async () => {
    const write = deferredWrite();
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    (update as jest.Mock).mockReturnValueOnce(write.promise);
    try {
      const first = useLiveDevice.getState().toggleMode();
      await useLiveDevice.getState().toggleMode();
      expect(update).toHaveBeenCalledTimes(1);
      useLiveDevice.getState().setActiveDeviceId('patio');
      await useLiveDevice.getState().toggleMode();
      write.reject(new Error('Permission denied'));
      await first;
      expect(useLiveDevice.getState().devices.balcony.config.mode).toBe('auto');
      expect(useLiveDevice.getState().devices.patio.config.mode).toBe('manual');
    } finally {
      warn.mockRestore();
    }
  });

  it('shares a 60-second cooldown across consumers and isolates other controllers', () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(10_000);
    try {
      useLiveDevice.getState().startManualCooldown('balcony');
      useLiveDevice.getState().setActiveDeviceId('patio');
      expect(useLiveDevice.getState().manualCooldownUntilByDevice.patio).toBeUndefined();
      useLiveDevice.getState().setActiveDeviceId('balcony');
      expect(useLiveDevice.getState().manualCooldownUntilByDevice.balcony).toBe(70_000);
    } finally {
      now.mockRestore();
    }
  });

  it('rolls back the failed preference and preserves other edits', async () => {
    const write = deferredWrite();
    (update as jest.Mock).mockReturnValueOnce(write.promise);
    const change = useSession.getState().updateAlertPref('dry', false);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(useSession.getState().prefs.alerts.dry).toBe(false);
    await useSession.getState().updateAlertPref('heat', false);
    write.reject(new Error('Offline'));
    await expect(change).rejects.toThrow('Offline');
    expect(useSession.getState().prefs.alerts).toMatchObject({ dry: true, heat: false });
  });
});
