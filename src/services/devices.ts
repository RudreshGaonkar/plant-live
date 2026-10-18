import { ref, onValue, set, update, push, off } from 'firebase/database';
import { db } from './firebase';
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
 */
export const listenToWaterLogs = (
  deviceId: string,
  onData: (logs: WaterLog[]) => void
) => {
  const logsRef = ref(db, `waterLogs/${deviceId}`);
  const unsubscribe = onValue(logsRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const logsArray: WaterLog[] = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));
      // Sort newest first
      logsArray.sort((a, b) => b.ts - a.ts);
      onData(logsArray);
    } else {
      onData([]);
    }
  });

  return () => off(logsRef, 'value', unsubscribe);
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
