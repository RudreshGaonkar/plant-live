import { ref, onValue, set, update, push, off, remove, query, limitToLast } from 'firebase/database';
import { db, auth } from './firebase';
import {
  DeviceConfig,
  DeviceTelemetry,
  DeviceStatus,
  DeviceCommand,
  WaterLog,
} from '@/store/useLiveDevice';

/**
 * Attaches a realtime listener to `devices/{deviceId}/telemetry`
 */
export const listenToDeviceTelemetry = (
  deviceId: string,
  onData: (telemetry: DeviceTelemetry) => void
) => {
  const telemetryRef = ref(db, `devices/${deviceId}/telemetry`);
  const unsubscribe = onValue(telemetryRef, (snapshot) => {
    if (snapshot.exists()) {
      onData(snapshot.val() as DeviceTelemetry);
    }
  });

  return () => off(telemetryRef, 'value', unsubscribe);
};

/**
 * Attaches a realtime listener to `devices/{deviceId}/config`
 */
export const listenToDeviceConfig = (
  deviceId: string,
  onData: (config: DeviceConfig) => void
) => {
  const configRef = ref(db, `devices/${deviceId}/config`);
  const unsubscribe = onValue(configRef, (snapshot) => {
    if (snapshot.exists()) {
      onData(snapshot.val() as DeviceConfig);
    }
  });

  return () => off(configRef, 'value', unsubscribe);
};

/**
 * Attaches a realtime listener to `devices/{deviceId}/status`
 */
export const listenToDeviceStatus = (
  deviceId: string,
  onData: (status: DeviceStatus) => void
) => {
  const statusRef = ref(db, `devices/${deviceId}/status`);
  const unsubscribe = onValue(statusRef, (snapshot) => {
    if (snapshot.exists()) {
      onData(snapshot.val() as DeviceStatus);
    }
  });

  return () => off(statusRef, 'value', unsubscribe);
};

/**
 * Attaches a realtime listener to `devices/{deviceId}/command`
 */
export const listenToDeviceCommand = (
  deviceId: string,
  onData: (command: DeviceCommand | null) => void
) => {
  const commandRef = ref(db, `devices/${deviceId}/command`);
  const unsubscribe = onValue(commandRef, (snapshot) => {
    if (snapshot.exists()) {
      onData(snapshot.val() as DeviceCommand);
    } else {
      onData(null);
    }
  });

  return () => off(commandRef, 'value', unsubscribe);
};

/**
 * Sends a command to `devices/{deviceId}/command`
 */
export const sendDeviceCommand = async (
  deviceId: string,
  command: Omit<DeviceCommand, 'id' | 'requestedAt'>
): Promise<string> => {
  const cmdId = `cmd-${Date.now()}`;
  const fullCommand: DeviceCommand = {
    ...command,
    id: cmdId,
    requestedAt: Date.now(),
    ack: {
      id: `ack-${Date.now()}`,
      status: 'received',
      ts: Date.now(),
    },
  };

  const commandRef = ref(db, `devices/${deviceId}/command`);
  await set(commandRef, fullCommand);
  return cmdId;
};

export interface DeviceControlPayload {
  pumpState: boolean;
  manualOverride: boolean;
  timestamp: number;
  durationSec?: number;
}

/**
 * Sends a manual pump control command to `devices/{deviceId}/control`
 * Explicitly bypasses soil moisture checks (for manual test mode)
 */
export const sendDeviceControl = async (
  deviceId: string,
  controlPayload: DeviceControlPayload = {
    pumpState: true,
    manualOverride: true,
    timestamp: Date.now(),
  }
): Promise<void> => {
  const controlRef = ref(db, `devices/${deviceId}/control`);
  await set(controlRef, controlPayload);
};

/**
 * Updates partial device config in `devices/{deviceId}/config`
 */
export const updateDeviceConfigInRTDB = async (
  deviceId: string,
  partialConfig: Partial<DeviceConfig>
) => {
  const configRef = ref(db, `devices/${deviceId}/config`);
  await update(configRef, partialConfig);
};

/**
 * Fetches or listens to watering logs in `waterLogs/{deviceId}`
 * Uses limitToLast(10) to prevent loading unbounded historical logs.
 */
export const listenToWaterLogs = (
  deviceId: string,
  onData: (logs: WaterLog[]) => void,
  limitCount = 10
) => {
  const logsRef = ref(db, `waterLogs/${deviceId}`);
  const logsQuery = query(logsRef, limitToLast(limitCount));
  const unsubscribe = onValue(logsQuery, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const logsArray: WaterLog[] = Object.keys(data).map((key) => {
        const item = data[key];
        const itemTs = item.ts || item.timestamp || Date.now();
        return {
          id: key,
          ...item,
          ts: itemTs,
          timestamp: itemTs,
        };
      });
      // Sort newest first descending by timestamp (b.timestamp - a.timestamp)
      logsArray.sort((a, b) => ((b.timestamp ?? b.ts) - (a.timestamp ?? a.ts)));
      onData(logsArray);
    } else {
      onData([]);
    }
  });

  return () => off(logsQuery, 'value', unsubscribe);
};

/**
 * Appends a new water log to `waterLogs/{deviceId}`
 */
export const appendWaterLogInRTDB = async (
  deviceId: string,
  log: Omit<WaterLog, 'id'>
) => {
  const logsRef = ref(db, `waterLogs/${deviceId}`);
  const newRef = push(logsRef);
  await set(newRef, log);
  return newRef.key;
};

export interface DeviceHistoryRecord {
  id: string;
  ts: number;
  timestamp?: number;
  soilMoisture: number;
  temperature: number;
  humidity: number;
  light?: number | null;
}

/**
 * Attaches a realtime listener to `history/{deviceId}`
 * Uses limitToLast to prevent downloading unbounded historical telemetry snapshots.
 */
export const listenToDeviceHistory = (
  deviceId: string,
  onData: (history: DeviceHistoryRecord[]) => void,
  limitCount = 50
) => {
  const historyRef = ref(db, `history/${deviceId}`);
  const historyQuery = query(historyRef, limitToLast(limitCount));
  const unsubscribe = onValue(historyQuery, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const records: DeviceHistoryRecord[] = Object.keys(data).map((key) => {
        const item = data[key];
        const itemTs = item.ts || item.timestamp || Date.now();
        return {
          id: key,
          ...item,
          ts: itemTs,
          timestamp: itemTs,
        };
      });
      // Sort newest first descending by timestamp (b.timestamp - a.timestamp)
      records.sort((a, b) => ((b.timestamp ?? b.ts) - (a.timestamp ?? a.ts)));
      onData(records);
    } else {
      onData([]);
    }
  });

  return () => off(historyQuery, 'value', unsubscribe);
};

export interface DeviceAlertRecord {
  id: string;
  type: string; // e.g. "critical" | "warning" | "info" | "LOW_WATER"
  title: string;
  message: string;
  description?: string;
  body?: string;
  status: string; // "active" | "resolved"
  createdAt: number;
  timestamp?: number;
  ts?: number;
  severity?: string;
  actionLabel?: string;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

const alertSaveDebounceMap = new Map<string, number>();

/**
 * Saves a device alert directly to Firebase RTDB at `/devices/{deviceId}/alerts/{alertId}`.
 * Explicitly sets `createdAt: Date.now()` (or provided ts) so it persists across stream updates.
 */
export async function saveDeviceAlertToRTDB(
  deviceId: string,
  alert: Partial<DeviceAlertRecord> & { id: string }
): Promise<void> {
  try {
    if (!deviceId || !alert?.id) return;
    if (auth && auth.currentUser === null) return;

    // Deduplicate identical writes occurring within 3 seconds
    const cacheKey = `${deviceId}:${alert.id}`;
    const now = Date.now();
    const lastSaved = alertSaveDebounceMap.get(cacheKey);
    if (lastSaved && now - lastSaved < 3000) {
      return;
    }
    alertSaveDebounceMap.set(cacheKey, now);

    const alertRef = ref(db, `devices/${deviceId}/alerts/${alert.id}`);
    const createdAt = alert.createdAt || alert.timestamp || alert.ts || now;
    const msg = alert.message || alert.body || alert.description || '';
    const payload = {
      id: alert.id,
      type: alert.type || 'warning',
      severity: alert.severity || alert.type || 'warning',
      title: alert.title || 'System Notice',
      message: msg,
      body: alert.body || msg,
      description: alert.description || msg,
      status: alert.status || 'active',
      createdAt,
      timestamp: createdAt,
      ts: createdAt,
      ...(alert.actionLabel ? { actionLabel: alert.actionLabel } : {}),
    };
    await set(alertRef, payload);
  } catch (err) {
    console.warn(`Failed to save alert ${alert.id} to RTDB:`, err);
  }
}

/**
 * Updates partial alert fields in `/devices/{deviceId}/alerts/{alertId}`.
 */
export async function updateDeviceAlertInRTDB(
  deviceId: string,
  alertId: string,
  updates: Partial<DeviceAlertRecord>
): Promise<void> {
  try {
    if (!deviceId || !alertId) return;
    if (auth && auth.currentUser === null) return;
    const alertRef = ref(db, `devices/${deviceId}/alerts/${alertId}`);
    await update(alertRef, updates);
  } catch (err) {
    console.warn(`Failed to update alert ${alertId} in RTDB:`, err);
  }
}

/**
 * Deletes an alert document from `/devices/{deviceId}/alerts/{alertId}`.
 */
export async function deleteDeviceAlertFromRTDB(
  deviceId: string,
  alertId: string
): Promise<void> {
  try {
    if (!deviceId || !alertId) return;
    if (auth && auth.currentUser === null) return;
    const alertRef = ref(db, `devices/${deviceId}/alerts/${alertId}`);
    await remove(alertRef);
  } catch (err) {
    console.warn(`Failed to delete alert ${alertId} from RTDB:`, err);
  }
}

/**
 * Routine to delete alert documents older than 7 days directly from Firebase RTDB (/devices/{deviceId}/alerts).
 * Critical: Do NOT auto-delete active, unresolved alerts regardless of age unless manually resolved by the user.
 */
export async function cleanupOldDeviceAlertsFromRTDB(deviceId: string) {
  try {
    const alertsRef = ref(db, `devices/${deviceId}/alerts`);
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    onValue(
      alertsRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          for (const key of Object.keys(data)) {
            const item = data[key];
            const isResolved =
              item.status === 'resolved' || item.status === 'RESOLVED' || item.status === 'read';
            // Only auto-delete resolved alerts older than 7 days; never auto-delete active alerts
            if (!isResolved) continue;
            const itemTs = item.createdAt || item.timestamp || item.ts;
            if (typeof itemTs === 'number' && itemTs < cutoff) {
              await remove(ref(db, `devices/${deviceId}/alerts/${key}`));
            }
          }
        }
      },
      { onlyOnce: true }
    );
  } catch (err) {
    console.warn('Failed to cleanup old device alerts from RTDB:', err);
  }
}

/**
 * Attaches a realtime listener to `devices/{deviceId}/alerts` with 7-day retention enforcement.
 * Active unresolved alerts are preserved regardless of age.
 */
export const listenToDeviceAlerts = (
  deviceId: string,
  onData: (alerts: DeviceAlertRecord[]) => void
) => {
  const alertsRef = ref(db, `devices/${deviceId}/alerts`);
  // Trigger cleanup routine for expired resolved items older than 7 days
  cleanupOldDeviceAlertsFromRTDB(deviceId);

  const unsubscribe = onValue(alertsRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const list: DeviceAlertRecord[] = Object.keys(data)
        .map((key) => {
          const item = data[key];
          const tsVal = item.createdAt || item.timestamp || item.ts || Date.now();
          const alertType =
            item.type === 'critical' || item.type === 'warning' || item.type === 'info'
              ? item.type
              : item.type === 'LOW_WATER' || item.type === 'PUMP_ERROR'
              ? 'critical'
              : 'warning';
          const statusVal =
            item.status === 'resolved' || item.status === 'RESOLVED' || item.status === 'read'
              ? 'resolved'
              : 'active';
          const titleVal =
            item.title && String(item.title).trim().length > 0
              ? String(item.title).trim()
              : alertType === 'critical'
              ? 'Low Reservoir Water'
              : 'System Notice';
          const messageVal =
            item.message && String(item.message).trim().length > 0
              ? String(item.message).trim()
              : item.description && String(item.description).trim().length > 0
              ? String(item.description).trim()
              : item.body && String(item.body).trim().length > 0
              ? String(item.body).trim()
              : 'Water level is low. Please refill the reservoir.';

          return {
            id: key,
            ...item,
            title: titleVal,
            message: messageVal,
            type: alertType,
            status: statusVal,
            createdAt: tsVal,
            timestamp: tsVal,
            ts: tsVal,
          };
        })
        // Enforce 7-day retention filter: guard against undefined timestamps and do NOT auto-delete active unresolved alerts
        .filter((item) => {
          const isResolved = item.status === 'resolved' || item.status === 'read';
          if (!isResolved) return true;
          return Boolean(item.createdAt && (Date.now() - item.createdAt <= SEVEN_DAYS_MS));
        });

      // Sort newest first
      list.sort(
        (a, b) => (b.createdAt || b.timestamp || b.ts || 0) - (a.createdAt || a.timestamp || a.ts || 0)
      );
      onData(list);
    } else {
      onData([]);
    }
  });

  return () => off(alertsRef, 'value', unsubscribe);
};


