import {
  updateDeviceLocationAndPreset,
  updateBottleCapacityWithTransaction,
  updateDevicePumpDuration,
  updateDeviceFlowRate,
  updateDeviceLightMode,
} from '../src/services/devices';
import { useSession, DEFAULT_USER_PREFS } from '../src/store/useSession';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { update, runTransaction } from 'firebase/database';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
  PanResponder: {
    create: (config: any) => ({
      panHandlers: config,
    }),
  },
}));

jest.mock('expo-device', () => ({}));

jest.mock('../src/services/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'user-456', email: 'gardener@leaf.io' },
  },
}));

jest.mock('firebase/database', () => {
  return {
    ref: jest.fn((database, path) => ({ path })),
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    onValue: jest.fn(() => jest.fn()),
    runTransaction: jest.fn(),
    get: jest.fn(),
    query: jest.fn(),
    limitToLast: jest.fn(),
    serverTimestamp: jest.fn(() => 'SERVER_TIMESTAMP_MOCK'),
  };
});

jest.mock('@react-native-async-storage/async-storage', () => {
  let store: Record<string, string> = {};
  return {
    getItem: jest.fn((key: string) => Promise.resolve(store[key] || null)),
    setItem: jest.fn((key: string, val: string) => {
      store[key] = val;
      return Promise.resolve();
    }),
    removeItem: jest.fn((key: string) => {
      delete store[key];
      return Promise.resolve();
    }),
    clear: jest.fn(() => {
      store = {};
      return Promise.resolve();
    }),
    _getStore: () => store,
  };
});

describe('Settings Reliability & Persistence Test Suite', () => {
  const deviceId = 'leaf-test-persist-01';

  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage as any).clear();
  });

  describe('1. Leaf-level RTDB Writers in devices.ts', () => {
    test('updateDeviceLocationAndPreset updates preset thresholds & location without modifying mode or sensors', async () => {
      await updateDeviceLocationAndPreset(
        deviceId,
        'terrace',
        {
          moistureMin: 35,
          moistureMax: 70,
          tempMax: 32,
          humidityMax: 80,
          pumpDurationSec: 6,
        }
      );

      expect(update).toHaveBeenCalledTimes(1);
      const call = (update as jest.Mock).mock.calls[0];
      const targetPath = call[0].path;
      const payload = call[1];

      expect(targetPath).toBe(`devices/${deviceId}/config`);
      expect(payload['location']).toBe('terrace');
      expect(payload['thresholds/moistureMin']).toBe(35);
      expect(payload['thresholds/moistureMax']).toBe(70);
      expect(payload['thresholds/tempMax']).toBe(32);
      expect(payload['thresholds/humidityMax']).toBe(80);
      expect(payload['thresholds/pumpDurationSec']).toBe(6);
      expect(payload['thresholds/waterDurationSec']).toBe(6);

      // Verify mode and sensors are not touched
      expect(payload['mode']).toBeUndefined();
      expect(payload['sensors']).toBeUndefined();
    });

    test('updateDevicePumpDuration preserves both pumpDurationSec and waterDurationSec aliases', async () => {
      await updateDevicePumpDuration(deviceId, 8);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ path: `devices/${deviceId}/config` }),
        {
          'thresholds/pumpDurationSec': 8,
          'thresholds/waterDurationSec': 8,
          pumpDurationSec: 8,
          waterDurationSec: 8,
        }
      );
    });

    test('updateDeviceFlowRate writes bottle/flowMlPerSec and flowMlPerSec independently', async () => {
      await updateDeviceFlowRate(deviceId, 45);

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ path: `devices/${deviceId}/config` }),
        {
          'bottle/flowMlPerSec': 45,
          flowMlPerSec: 45,
        }
      );
    });

    test('updateDeviceLightMode writes sensors/lightMode', async () => {
      await updateDeviceLightMode(deviceId, 'digital');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ path: `devices/${deviceId}/config` }),
        {
          'sensors/lightMode': 'digital',
        }
      );
    });
  });

  describe('2. Atomic Bottle Capacity Transaction', () => {
    test('clamps remainingMl if new capacity is smaller than current reserve', async () => {
      (runTransaction as jest.Mock).mockImplementation((refObj: any, cb: (data: any) => any) => {
        const currentData = {
          bottle: {
            capacityMl: 1000,
            remainingMl: 800,
            flowMlPerSec: 35,
          },
          bottleCapacityMl: 1000,
          bottleRemainingMl: 800,
        };
        const result = cb(currentData);
        return Promise.resolve({
          committed: true,
          snapshot: { val: () => result },
        });
      });

      const res = await updateBottleCapacityWithTransaction(deviceId, 500);

      expect(runTransaction).toHaveBeenCalledTimes(1);
      expect(res.capacityMl).toBe(500);
      expect(res.remainingMl).toBe(500);
    });

    test('preserves remainingMl if new capacity is larger than current reserve', async () => {
      (runTransaction as jest.Mock).mockImplementation((refObj: any, cb: (data: any) => any) => {
        const currentData = {
          bottle: {
            capacityMl: 500,
            remainingMl: 300,
          },
        };
        const result = cb(currentData);
        return Promise.resolve({
          committed: true,
          snapshot: { val: () => result },
        });
      });

      const res = await updateBottleCapacityWithTransaction(deviceId, 1200);

      expect(res.capacityMl).toBe(1200);
      expect(res.remainingMl).toBe(300);
    });
  });

  describe('3. User Preferences in useSession', () => {
    test('DEFAULT_USER_PREFS provides complete default fallback values', () => {
      expect(DEFAULT_USER_PREFS.units).toBe('C');
      expect(DEFAULT_USER_PREFS.alerts.bottle).toBe(true);
      expect(DEFAULT_USER_PREFS.quietHours.enabled).toBe(false);
      expect(DEFAULT_USER_PREFS.quietHours.start).toBe('22:00');
      expect(DEFAULT_USER_PREFS.quietHours.end).toBe('07:00');
    });

    test('toggleQuietHours retains existing start and end times when toggling enabled', async () => {
      useSession.setState({
        user: { uid: 'user-456', email: 'test@example.com' } as any,
        prefs: {
          ...DEFAULT_USER_PREFS,
          quietHours: {
            enabled: false,
            start: '23:30',
            end: '06:15',
          },
        },
      });

      await useSession.getState().toggleQuietHours(true);

      const updated = useSession.getState().prefs.quietHours;
      expect(updated.enabled).toBe(true);
      expect(updated.start).toBe('23:30');
      expect(updated.end).toBe('06:15');

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'users/user-456/prefs/quietHours' }),
        {
          enabled: true,
          start: '23:30',
          end: '06:15',
        }
      );
    });

    test('updateTempUnit persists units to RTDB and updates state', async () => {
      useSession.setState({
        user: { uid: 'user-456', email: 'test@example.com' } as any,
        prefs: { ...DEFAULT_USER_PREFS, units: 'C' },
      });

      await useSession.getState().updateTempUnit('F');

      expect(useSession.getState().prefs.units).toBe('F');
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'users/user-456/prefs' }),
        { units: 'F' }
      );
    });
  });

  describe('4. Slider Gesture Interruption Contract', () => {
    test('Simulated Slider PanResponder restores starting value on onPanResponderTerminate', () => {
      let currentValue = 50;
      let startValue = 50;
      let slidingCompleteValue: number | null = null;

      const onSlidingComplete = (val: number) => {
        slidingCompleteValue = val;
      };

      const panResponderHandlers = {
        onPanResponderGrant: () => {
          startValue = currentValue;
        },
        onPanResponderMove: (_: any, gestureState: { dx: number }) => {
          currentValue = startValue + gestureState.dx;
        },
        onPanResponderRelease: () => {
          onSlidingComplete(currentValue);
        },
        onPanResponderTerminate: () => {
          currentValue = startValue;
        },
      };

      // 1. Successful gesture: grant -> move -> release
      panResponderHandlers.onPanResponderGrant();
      panResponderHandlers.onPanResponderMove(null, { dx: 15 });
      expect(currentValue).toBe(65);
      panResponderHandlers.onPanResponderRelease();
      expect(slidingCompleteValue).toBe(65);

      // 2. Interrupted gesture: grant -> move -> terminate
      slidingCompleteValue = null;
      panResponderHandlers.onPanResponderGrant();
      panResponderHandlers.onPanResponderMove(null, { dx: 20 });
      expect(currentValue).toBe(85);
      panResponderHandlers.onPanResponderTerminate();

      expect(currentValue).toBe(65);
      expect(slidingCompleteValue).toBeNull();
    });
  });
});
