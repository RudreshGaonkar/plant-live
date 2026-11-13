import { removeDeviceWithAudit } from '../src/services/devices';
import { useLiveDevice } from '../src/store/useLiveDevice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { set, remove, push, get as fbGet } from 'firebase/database';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));
jest.mock('expo-device', () => ({}));

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
    onValue: jest.fn(() => jest.fn()),
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
          actorUid: uid,
          timestamp: 'SERVER_TIMESTAMP_MOCK',
        })
      );
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ path: `userAuditLogs/${uid}` }),
        expect.objectContaining({
          action: 'DEVICE_REMOVED',
          deviceId: devId,
          plantName,
          actorUid: uid,
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

    test('preserves active device selection when an inactive device is removed', async () => {
      useLiveDevice.getState().setActiveDeviceId('active-leaf-node');
      (fbGet as jest.Mock).mockImplementation((refObj: any) => {
        if (refObj.path === `devices/${devId}/meta/ownerUid`) {
          return Promise.resolve({ exists: () => true, val: () => uid });
        }
        if (refObj.path === `users/${uid}/devices`) {
          return Promise.resolve({
            exists: () => true,
            val: () => ({
              'active-leaf-node': true,
              [devId]: true,
            }),
          });
        }
        return Promise.resolve({ exists: () => false, val: () => null });
      });

      const res = await removeDeviceWithAudit(uid, email, devId, plantName);
      expect(res.nextDeviceId).toBe('active-leaf-node');
      expect(useLiveDevice.getState().activeDeviceId).toBe('active-leaf-node');
    });
  });

  describe('3. Database Security Rules & Ownership Claim Invariants', () => {
    const rules = require('../database.rules.json');

    test('enforces strict ownership check on /devices/$deviceId core paths', () => {
      const devRules = rules.rules.devices['$deviceId'];
      const owner = "root.child('devices').child($deviceId).child('meta').child('ownerUid')";
      const legacyOwner = "root.child('owners').child($deviceId)";
      const ownershipExpr =
        `auth != null && (${owner}.val() === auth.uid || ${legacyOwner}.val() === auth.uid || auth.token.email === $deviceId + '@devices.leaflink.local')`;

      expect(devRules.config['.read']).toBe(ownershipExpr);
      expect(devRules.config['.write']).toBe(ownershipExpr);
      expect(devRules.command['.read']).toBe(ownershipExpr);
      expect(devRules.command['.write']).toBe(
        `auth != null && (root.child('devices').child($deviceId).child('meta').child('ownerUid').val() === auth.uid || root.child('owners').child($deviceId).val() === auth.uid) && !newData.hasChild('ack')`
      );
      expect(devRules.command.ack['.write']).toBe(
        `auth != null && auth.token.email === $deviceId + '@devices.leaflink.local'`
      );
      expect(devRules.control['.read']).toBe(ownershipExpr);
      expect(devRules.control['.write']).toBe(ownershipExpr);
      expect(devRules.telemetry['.read']).toBe(ownershipExpr);
      expect(devRules.telemetry['.write']).toBe(ownershipExpr);
      expect(devRules.status['.read']).toBe(ownershipExpr);
      expect(devRules.status['.write']).toBe(ownershipExpr);
      expect(devRules.alerts['.read']).toBe(ownershipExpr);
      expect(devRules.alerts['.write']).toBe(ownershipExpr);
    });

    test('enforces atomic meta ownership claim rule', () => {
      const metaRules = rules.rules.devices['$deviceId'].meta;
      expect(metaRules['.write']).toBeUndefined();
      expect(metaRules.ownerUid['.write']).toContain('!newData.exists() || newData.val() === auth.uid');
      expect(metaRules.ownerUid['.write']).toContain("root.child('owners').child($deviceId).val() === auth.uid");
    });

    test('enforces payload validation rules on command and config/mode', () => {
      const cmdRules = rules.rules.devices['$deviceId'].command;
      expect(cmdRules['.validate']).toContain("newData.hasChildren(['id', 'type'])");
      expect(cmdRules.id['.validate']).toBe('newData.isString()');
      expect(cmdRules.type['.validate']).toContain('waterNow');
      expect(cmdRules.type['.validate']).toContain('refilled');
      expect(cmdRules.type['.validate']).toContain('calibrateDry');
      expect(cmdRules.type['.validate']).toContain('calibrateWet');
      expect(cmdRules.type['.validate']).toContain('disarm');
      expect(cmdRules.durationSec['.validate']).toBe('newData.isNumber() && newData.val() >= 1 && newData.val() <= 15');

      const configRules = rules.rules.devices['$deviceId'].config;
      expect(configRules.mode['.validate']).toBe("newData.val() === 'auto' || newData.val() === 'manual'");
    });

    test('enforces immutable audit log rules on /auditLogs/$deviceId', () => {
      const auditRules = rules.rules.auditLogs['$deviceId'];
      expect(auditRules['.read']).toContain("root.child('devices').child($deviceId).child('meta').child('ownerUid').val() === auth.uid");
      expect(auditRules['.write']).toBe('auth != null && !data.exists()');
      expect(auditRules['$logId']['.write']).toBe('auth != null && !data.exists()');
    });

    test('enforces user sandboxing on /users/$uid', () => {
      const userRules = rules.rules.users['$uid'];
      expect(userRules['.read']).toBe('auth != null && auth.uid === $uid');
      expect(userRules['.write']).toBe('auth != null && auth.uid === $uid');
    });
  });
});

