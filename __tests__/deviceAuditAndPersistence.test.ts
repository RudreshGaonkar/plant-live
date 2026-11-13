import { removeDeviceWithAudit } from '../src/services/devices';
import { useLiveDevice } from '../src/store/useLiveDevice';
import { useSession } from '../src/store/useSession';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ref, set, remove, push, get as fbGet } from 'firebase/database';

jest.mock('../src/services/firebase', () => ({
  db: {},
  auth: {
    currentUser: { uid: 'user-123', email: 'test@example.com' },
  },
}));

jest.mock('firebase/database', () => {
  return {
    ref: jest.fn((database, path) => ({ path })),
    set: jest.fn(() => Promise.resolve()),
    update: jest.fn(() => Promise.resolve()),
    onValue: jest.fn(),
    push: jest.fn((refObj) => ({ ...refObj, key: 'mock-audit-id' })),
    remove: jest.fn(() => Promise.resolve()),
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

describe('Device Audit Logging & Persistence Suite', () => {
  const uid = 'user-123';
  const email = 'gardener@leaf.io';
  const devId = 'leaf-node-test-01';
  const plantName = 'Monstera Deliciosa';

  beforeEach(() => {
    jest.clearAllMocks();
    (AsyncStorage as any).clear();
    useLiveDevice.getState().clearDeviceState();
  });

  describe('1. Active Device Persistence in Store and AsyncStorage', () => {
    test('persists activeDeviceId to AsyncStorage on setActiveDeviceId', async () => {
      useLiveDevice.getState().setActiveDeviceId('dev-abc');
      expect(useLiveDevice.getState().activeDeviceId).toBe('dev-abc');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        `@plant_live_active_device_${uid}`,
        'dev-abc'
      );
    });

    test('persists activeDeviceId on addDevice', async () => {
      useLiveDevice.getState().addDevice({
        id: 'dev-new',
        config: { plantName: 'Fern', mode: 'auto' } as any,
        telemetry: { soilMoisture: 40 } as any,
        status: { online: true } as any,
      });

      expect(useLiveDevice.getState().activeDeviceId).toBe('dev-new');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        `@plant_live_active_device_${uid}`,
        'dev-new'
      );
    });
  });

  describe('2. removeDeviceWithAudit functionality', () => {
    test('writes immutable audit logs to /auditLogs/{deviceId} and /userAuditLogs/{uid}', async () => {
      (fbGet as jest.Mock).mockImplementation((refObj: any) => {
        if (refObj.path === `devices/${devId}/meta/ownerUid`) {
          return Promise.resolve({ exists: () => true, val: () => uid });
        }
        if (refObj.path === `users/${uid}/devices`) {
          return Promise.resolve({ exists: () => false, val: () => null });
        }
        return Promise.resolve({ exists: () => false, val: () => null });
      });

      const res = await removeDeviceWithAudit(uid, email, devId, plantName);

      // Verify audit logs were pushed
      expect(push).toHaveBeenCalledWith(expect.objectContaining({ path: `auditLogs/${devId}` }));
      expect(push).toHaveBeenCalledWith(expect.objectContaining({ path: `userAuditLogs/${uid}` }));

      // Verify immutable audit log payload
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ path: `auditLogs/${devId}` }),
        expect.objectContaining({
          action: 'DEVICE_REMOVED',
          deviceId: devId,
          plantName,
          deletedByUid: uid,
          deletedByEmail: email,
          timestamp: 'SERVER_TIMESTAMP_MOCK',
        })
      );
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ path: `userAuditLogs/${uid}` }),
        expect.objectContaining({
          action: 'DEVICE_REMOVED',
          deviceId: devId,
          plantName,
          deletedByUid: uid,
          deletedByEmail: email,
          timestamp: 'SERVER_TIMESTAMP_MOCK',
        })
      );

      // Verify removal of user association and meta ownerUid
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ path: `users/${uid}/devices/${devId}` }));
      expect(remove).toHaveBeenCalledWith(expect.objectContaining({ path: `devices/${devId}/meta/ownerUid` }));

      // No devices left -> nextDeviceId is null and activeDeviceId cleared from AsyncStorage
      expect(res.nextDeviceId).toBeNull();
      expect(res.remainingCount).toBe(0);
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith(`@plant_live_active_device_${uid}`);
    });

    test('switches to next remaining paired device if multiple exist', async () => {
      (fbGet as jest.Mock).mockImplementation((refObj: any) => {
        if (refObj.path === `devices/${devId}/meta/ownerUid`) {
          return Promise.resolve({ exists: () => true, val: () => uid });
        }
        if (refObj.path === `users/${uid}/devices`) {
          return Promise.resolve({
            exists: () => true,
            val: () => ({
              'leaf-node-remaining-02': true,
            }),
          });
        }
        return Promise.resolve({ exists: () => false, val: () => null });
      });

      const res = await removeDeviceWithAudit(uid, email, devId, plantName);

      expect(res.nextDeviceId).toBe('leaf-node-remaining-02');
      expect(res.remainingCount).toBe(1);
      expect(useLiveDevice.getState().activeDeviceId).toBe('leaf-node-remaining-02');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        `@plant_live_active_device_${uid}`,
        'leaf-node-remaining-02'
      );
    });
  });
});

