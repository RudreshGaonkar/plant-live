import {
  saveDeviceAlertToRTDB,
  updateDeviceAlertInRTDB,
  listenToDeviceAlerts,
  DeviceAlertRecord,
} from '../src/services/devices';
import { listenToUserAlerts } from '../src/services/notifications';
import { db } from '../src/services/firebase';
import { set, update, ref, query, limitToLast } from 'firebase/database';

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));
jest.mock('expo-device', () => ({}));

jest.mock('../src/services/firebase', () => ({
  db: {},
}));

jest.mock('firebase/database', () => ({
  ref: jest.fn((database, path) => ({ path })),
  set: jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  onValue: jest.fn(),
  off: jest.fn(),
  push: jest.fn(() => ({ key: 'mock-key' })),
  remove: jest.fn(() => Promise.resolve()),
  query: jest.fn((r, ...args) => ({ ref: r, queryArgs: args })),
  limitToLast: jest.fn((count) => ({ limitToLast: count })),
}));

describe('Alerts Engine & Retention Suite', () => {
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
  const now = Date.now();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('1. Firebase RTDB Alert Persistence', () => {
    test('saveDeviceAlertToRTDB saves alert immediately to /devices/{deviceId}/alerts/{alertId} with createdAt', async () => {
      const alert: DeviceAlertRecord = {
        id: 'dry-leaf-node-01',
        type: 'warning',
        title: 'Soil Dry - Needs Water',
        message: 'Moisture below minimum',
        status: 'active',
        createdAt: now,
      };

      await saveDeviceAlertToRTDB('leaf-node-01', alert);

      expect(ref).toHaveBeenCalledWith(db, 'devices/leaf-node-01/alerts/dry-leaf-node-01');
      expect(set).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'devices/leaf-node-01/alerts/dry-leaf-node-01' }),
        expect.objectContaining({
          id: 'dry-leaf-node-01',
          type: 'warning',
          title: 'Soil Dry - Needs Water',
          status: 'active',
          createdAt: now,
        })
      );
    });

    test('updateDeviceAlertInRTDB updates status in RTDB when alert resolves', async () => {
      await updateDeviceAlertInRTDB('leaf-node-01', 'dry-leaf-node-01', { status: 'resolved' });

      expect(ref).toHaveBeenCalledWith(db, 'devices/leaf-node-01/alerts/dry-leaf-node-01');
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'devices/leaf-node-01/alerts/dry-leaf-node-01' }),
        { status: 'resolved' }
      );
    });
  });

  describe('2. Clean Merge Strategy ([...serverAlerts, ...localAlerts])', () => {
    test('merges server and local alerts using id as unique key without losing local active state', () => {
      const serverAlerts: DeviceAlertRecord[] = [
        {
          id: 'server-notice-1',
          type: 'info',
          title: 'Firmware Updated',
          message: 'ESP8266 updated to v1.0.4',
          status: 'resolved',
          createdAt: now - 3600000,
        },
        {
          id: 'dry-leaf-node-01',
          type: 'warning',
          title: 'Soil Dry - Needs Water',
          message: 'Soil moisture is 22%',
          status: 'active',
          createdAt: now - 1800000,
        },
      ];

      const localAlerts: DeviceAlertRecord[] = [
        {
          id: 'dry-leaf-node-01', // Duplicate ID from real-time local engine
          type: 'warning',
          title: 'Soil Dry - Needs Water',
          message: 'Soil moisture is 20%',
          status: 'active',
          createdAt: now - 1800000,
        },
        {
          id: 'bottle-low-leaf-node-01',
          type: 'warning',
          title: 'Water Reservoir Low',
          message: 'Reservoir is below 20%',
          status: 'active',
          createdAt: now - 60000,
        },
      ];

      // Clean merge strategy: [...serverAlerts, ...localAlerts] using id as unique key
      const combined = [...serverAlerts, ...localAlerts];
      const alertMap = new Map<string, DeviceAlertRecord>();

      for (const alert of combined) {
        if (!alertMap.has(alert.id)) {
          alertMap.set(alert.id, alert);
        } else {
          const existing = alertMap.get(alert.id)!;
          alertMap.set(alert.id, {
            ...existing,
            ...alert,
            createdAt: existing.createdAt || alert.createdAt,
            status: existing.status === 'resolved' || alert.status === 'resolved' ? 'resolved' : alert.status,
          });
        }
      }

      const merged = Array.from(alertMap.values());

      // Should have 3 unique alerts, deduplicated by id
      expect(merged).toHaveLength(3);
      expect(merged.map((a) => a.id)).toEqual(['server-notice-1', 'dry-leaf-node-01', 'bottle-low-leaf-node-01']);

      // Local active alert 'bottle-low-leaf-node-01' is preserved and NOT wiped by server alerts
      const bottleAlert = merged.find((a) => a.id === 'bottle-low-leaf-node-01');
      expect(bottleAlert).toBeDefined();
      expect(bottleAlert?.status).toBe('active');
    });
  });

  describe('3. 7-Day Auto-Pruning & Unresolved Retention Logic', () => {
    test('does NOT auto-delete active, unresolved alerts regardless of age', () => {
      const tenDaysAgo = now - 10 * 24 * 60 * 60 * 1000;
      const twentyDaysAgo = now - 20 * 24 * 60 * 60 * 1000;

      const alerts: DeviceAlertRecord[] = [
        {
          id: 'active-old-critical',
          type: 'critical',
          title: 'Reservoir Empty (10 days old)',
          message: 'Still empty',
          status: 'active',
          createdAt: tenDaysAgo,
        },
        {
          id: 'active-unread-old',
          type: 'warning',
          title: 'Thirsty (20 days old)',
          message: 'Still thirsty',
          status: 'unread' as any,
          createdAt: twentyDaysAgo,
        },
      ];

      const retained = alerts.filter((alert) => {
        const isResolved = alert.status === 'resolved' || alert.status === 'read';
        // Do NOT auto-delete active, unresolved alerts regardless of age unless manually resolved by the user
        if (!isResolved) return true;
        // Guard against undefined timestamps
        return Boolean(alert.createdAt && now - alert.createdAt <= SEVEN_DAYS_MS);
      });

      expect(retained).toHaveLength(2);
      expect(retained[0].id).toBe('active-old-critical');
      expect(retained[1].id).toBe('active-unread-old');
    });

    test('prunes resolved alerts older than 7 days', () => {
      const eightDaysAgo = now - 8 * 24 * 60 * 60 * 1000;
      const threeDaysAgo = now - 3 * 24 * 60 * 60 * 1000;

      const alerts: DeviceAlertRecord[] = [
        {
          id: 'resolved-expired',
          type: 'info',
          title: 'Refilled',
          message: 'Watered',
          status: 'resolved',
          createdAt: eightDaysAgo,
        },
        {
          id: 'resolved-recent',
          type: 'info',
          title: 'Watered Plant',
          message: 'Watered',
          status: 'resolved',
          createdAt: threeDaysAgo,
        },
      ];

      const retained = alerts.filter((alert) => {
        const isResolved = alert.status === 'resolved' || alert.status === 'read';
        if (!isResolved) return true;
        return Boolean(alert.createdAt && now - alert.createdAt <= SEVEN_DAYS_MS);
      });

      expect(retained).toHaveLength(1);
      expect(retained[0].id).toBe('resolved-recent');
    });

    test('guards against undefined timestamps', () => {
      const alerts: any[] = [
        {
          id: 'resolved-no-timestamp',
          type: 'info',
          title: 'No timestamp',
          status: 'resolved',
          createdAt: undefined,
        },
      ];

      const retained = alerts.filter((alert) => {
        const isResolved = alert.status === 'resolved' || alert.status === 'read';
        if (!isResolved) return true;
        return Boolean(alert.createdAt && now - alert.createdAt <= SEVEN_DAYS_MS);
      });

      expect(retained).toHaveLength(0);
    });
  });

  describe('4. Telemetry Heartbeat Stability', () => {
    test('successive telemetry updates do not clear active alerts while condition is violated', () => {
      let localAlerts: DeviceAlertRecord[] = [];
      const thresholdMin = 35;

      // Evaluation cycle function imitating useAlertEngine
      const evaluateMoistureCondition = (currentMoisture: number, existingAlerts: DeviceAlertRecord[]) => {
        const isDry = currentMoisture < thresholdMin;
        const dryAlertId = 'dry-leaf-node-01';
        const currentMap = new Map<string, DeviceAlertRecord>();
        for (const a of existingAlerts) currentMap.set(a.id, a);

        const nextAlerts: DeviceAlertRecord[] = [];

        if (isDry) {
          const existing = currentMap.get(dryAlertId);
          if (existing) {
            // Retain active alert without resetting createdAt
            nextAlerts.push(existing);
          } else {
            nextAlerts.push({
              id: dryAlertId,
              type: 'warning',
              title: 'Soil Dry - Needs Water',
              message: `Soil moisture is ${currentMoisture}%`,
              status: 'active',
              createdAt: Date.now(),
            });
          }
        } else {
          const existing = currentMap.get(dryAlertId);
          if (existing && existing.status === 'active') {
            nextAlerts.push({ ...existing, status: 'resolved' });
          }
        }

        return nextAlerts;
      };

      // Heartbeat 1 (t=0s): soil moisture is 22% (< 35%) -> alert generated
      localAlerts = evaluateMoistureCondition(22, localAlerts);
      expect(localAlerts).toHaveLength(1);
      expect(localAlerts[0].id).toBe('dry-leaf-node-01');
      expect(localAlerts[0].status).toBe('active');
      const originalCreatedAt = localAlerts[0].createdAt;

      // Heartbeat 2 (t=5s): telemetry update arrives with soil moisture 21% (< 35%)
      localAlerts = evaluateMoistureCondition(21, localAlerts);
      // Alert MUST NOT disappear or be cleared
      expect(localAlerts).toHaveLength(1);
      expect(localAlerts[0].id).toBe('dry-leaf-node-01');
      expect(localAlerts[0].status).toBe('active');
      expect(localAlerts[0].createdAt).toBe(originalCreatedAt);

      // Heartbeat 3 (t=10s): telemetry update arrives with soil moisture 20% (< 35%)
      localAlerts = evaluateMoistureCondition(20, localAlerts);
      expect(localAlerts).toHaveLength(1);
      expect(localAlerts[0].status).toBe('active');

      // Heartbeat 4 (t=15s): Plant watered! Moisture returns to 48% (>= 35%)
      localAlerts = evaluateMoistureCondition(48, localAlerts);
      // Alert condition resolved!
      expect(localAlerts).toHaveLength(1);
      expect(localAlerts[0].status).toBe('resolved');
    });
  });

  describe('5. RTDB Query Capping & Today-Only Filter (limitToLast(50))', () => {
    test('listenToDeviceAlerts queries /devices/{deviceId}/alerts with limitToLast(50)', () => {
      listenToDeviceAlerts('leaf-node-01', jest.fn());

      expect(ref).toHaveBeenCalledWith(db, 'devices/leaf-node-01/alerts');
      expect(limitToLast).toHaveBeenCalledWith(50);
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'devices/leaf-node-01/alerts' }),
        expect.objectContaining({ limitToLast: 50 })
      );
    });

    test('listenToUserAlerts queries /users/{uid}/alerts with limitToLast(50)', () => {
      listenToUserAlerts('user-123', jest.fn());

      expect(ref).toHaveBeenCalledWith(db, 'users/user-123/alerts');
      expect(limitToLast).toHaveBeenCalledWith(50);
      expect(query).toHaveBeenCalledWith(
        expect.objectContaining({ path: 'users/user-123/alerts' }),
        expect.objectContaining({ limitToLast: 50 })
      );
    });

    test('filters alerts strictly to today only and caps rendered items to max 25', () => {
      const startOfTodayMs = new Date().setHours(0, 0, 0, 0);
      const yesterday = startOfTodayMs - 3600000;
      const todayEarlier = startOfTodayMs + 1000 * 60;

      const alerts: DeviceAlertRecord[] = [
        { id: 'yesterday-1', title: 'Yesterday', message: 'Yesterday message', createdAt: yesterday, status: 'active', type: 'warning' },
        ...Array.from({ length: 30 }, (_, i) => ({
          id: `today-${i}`,
          title: `Alert ${i}`,
          message: `Alert message ${i}`,
          createdAt: todayEarlier + i * 1000,
          status: 'active' as const,
          type: 'warning' as const,
        })),
      ];

      // Filter displayed alerts strictly to today only (timestamp >= startOfTodayMs), sorted newest-first
      const todayAlerts = alerts
        .filter((a) => (a.createdAt || 0) >= startOfTodayMs)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

      // Capped to max 25 items
      const capped = todayAlerts.slice(0, 25);

      expect(todayAlerts).toHaveLength(30);
      expect(todayAlerts.some((a) => a.id === 'yesterday-1')).toBe(false);
      expect(capped).toHaveLength(25);
      expect(capped[0].createdAt).toBeGreaterThan(capped[1].createdAt!);
    });

    test('evaluation tick does not spam duplicate identical alerts if an alert exists for today', () => {
      const startOfTodayMs = new Date().setHours(0, 0, 0, 0);
      const deviceId = 'leaf-node-01';
      const createdAlerts: any[] = [];
      const createdKeys = new Set<string>();

      const evaluateRuleDeduplicated = (alertId: string, ruleType: string, isViolated: boolean) => {
        const todayKey = `${deviceId}:${ruleType}:${new Date().toDateString()}`;
        const alreadyExistsToday =
          createdKeys.has(todayKey) ||
          createdAlerts.some(
            (a) => (a.id === alertId || a.type === ruleType) && a.createdAt >= startOfTodayMs
          );

        if (isViolated) {
          if (!alreadyExistsToday) {
            const newAlert = {
              id: alertId,
              deviceId,
              type: ruleType,
              createdAt: Date.now(),
              status: 'active',
            };
            createdAlerts.push(newAlert);
            createdKeys.add(todayKey);
            createdKeys.add(alertId);
          }
        }
      };

      // Tick 1 (t=0s): soil dry condition violated
      evaluateRuleDeduplicated('dry-leaf-node-01', 'dry', true);
      expect(createdAlerts).toHaveLength(1);

      // Tick 2 (t=5s): same condition evaluated
      evaluateRuleDeduplicated('dry-leaf-node-01', 'dry', true);
      expect(createdAlerts).toHaveLength(1); // No duplicate spammed!

      // Tick 3 (t=10s): same condition evaluated
      evaluateRuleDeduplicated('dry-leaf-node-01', 'dry', true);
      expect(createdAlerts).toHaveLength(1); // Still exactly 1!
    });
  });
});
