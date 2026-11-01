import { useState, useEffect, useMemo } from 'react';
import { ref, onValue, off, query, limitToLast } from 'firebase/database';
import { db } from '@/services/firebase';
import {
  useLiveDevice,
  DeviceRecord,
  DeviceTelemetry,
  DeviceConfig,
  DeviceStatus,
  WaterLog,
  computePlantHealthState,
  PlantHealthState,
  createDefaultDeviceRecord,
} from '@/store/useLiveDevice';
import { DeviceHistoryRecord } from '@/services/devices';

export interface UsePlantDataReturn {
  device: DeviceRecord;
  telemetry: DeviceTelemetry;
  config: DeviceConfig;
  status: DeviceStatus;
  control?: DeviceRecord['control'];
  history: DeviceHistoryRecord[];
  waterLogs: WaterLog[];
  health: PlantHealthState;
  isOnline: boolean;
  isWatering: boolean;
  isPumpActive: boolean;
  activeDeviceId: string;
}

/**
 * usePlantData
 * Real-time composite hook for any screen requiring complete hardware state:
 * - Telemetry, Config, Status, Control, WaterLogs, and 24h History.
 * - Persistent Firebase event listeners with complete cleanup on unmount.
 */
export function usePlantData(customDeviceId?: string): UsePlantDataReturn {
  const storeActiveDeviceId = useLiveDevice((s) => s.activeDeviceId);
  const targetId = customDeviceId || storeActiveDeviceId || 'leaf-node-01';

  const storeDevice = useLiveDevice((s) => s.devices[targetId]);
  const storeWaterLogs = useLiveDevice((s) => s.waterLogs);
  const isWateringActive = useLiveDevice((s) => s.isWateringActive);

  const [history, setHistory] = useState<DeviceHistoryRecord[]>([]);

  useEffect(() => {
    if (!targetId) return;

    // 1. Telemetry
    const telemetryRef = ref(db, `devices/${targetId}/telemetry`);
    const unsubTelemetry = onValue(telemetryRef, (snapshot) => {
      if (snapshot.exists()) {
        useLiveDevice.getState().updateTelemetry(snapshot.val() as DeviceTelemetry);
      }
    });

    // 2. Config
    const configRef = ref(db, `devices/${targetId}/config`);
    const unsubConfig = onValue(configRef, (snapshot) => {
      if (snapshot.exists()) {
        useLiveDevice.getState().updateConfig(snapshot.val() as DeviceConfig);
      }
    });

    // 3. Status
    const statusRef = ref(db, `devices/${targetId}/status`);
    const unsubStatus = onValue(statusRef, (snapshot) => {
      if (snapshot.exists()) {
        const status = snapshot.val() as DeviceStatus;
        useLiveDevice.setState((prev) => {
          const cur = prev.devices[targetId] || createDefaultDeviceRecord(targetId);
          return {
            devices: {
              ...prev.devices,
              [targetId]: { ...cur, status: { ...cur.status, ...status } },
            },
          };
        });
      }
    });

    // 4. Control
    const controlRef = ref(db, `devices/${targetId}/control`);
    const unsubControl = onValue(controlRef, (snapshot) => {
      if (snapshot.exists()) {
        const control = snapshot.val();
        useLiveDevice.setState((prev) => {
          const cur = prev.devices[targetId] || createDefaultDeviceRecord(targetId);
          const isPump = Boolean(control?.pumpState || cur.telemetry.isPumpActive || cur.telemetry.pumpOn);
          return {
            devices: {
              ...prev.devices,
              [targetId]: {
                ...cur,
                control: { ...cur.control, ...control },
                telemetry: {
                  ...cur.telemetry,
                  isPumpActive: isPump,
                  pumpOn: isPump,
                },
              },
            },
          };
        });
      }
    });

    // 5. Water Logs (Bounded to latest 10 to prevent unbounded history load)
    const logsRef = ref(db, `waterLogs/${targetId}`);
    const logsQuery = query(logsRef, limitToLast(10));
    const unsubLogs = onValue(logsQuery, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const logsArray: WaterLog[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        logsArray.sort((a, b) => b.ts - a.ts);
        useLiveDevice.setState({ waterLogs: logsArray });
      }
    });

    // 6. History Logs (Bounded to latest 50 to prevent memory spikes)
    const historyRef = ref(db, `history/${targetId}`);
    const historyQuery = query(historyRef, limitToLast(50));
    const unsubHistory = onValue(historyQuery, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        const records: DeviceHistoryRecord[] = Object.keys(data).map((key) => ({
          id: key,
          ...data[key],
        }));
        records.sort((a, b) => a.ts - b.ts);
        setHistory(records);
      }
    });

    return () => {
      off(telemetryRef, 'value', unsubTelemetry);
      off(configRef, 'value', unsubConfig);
      off(statusRef, 'value', unsubStatus);
      off(controlRef, 'value', unsubControl);
      off(logsQuery, 'value', unsubLogs);
      off(historyQuery, 'value', unsubHistory);
    };
  }, [targetId]);

  const device = useMemo<DeviceRecord>(
    () => storeDevice || createDefaultDeviceRecord(targetId),
    [storeDevice, targetId]
  );

  const isPumpActive = Boolean(
    device.telemetry.isPumpActive ||
    device.telemetry.pumpOn ||
    device.control?.pumpState ||
    isWateringActive
  );

  const health = computePlantHealthState(device);

  return {
    device,
    telemetry: device.telemetry,
    config: device.config,
    status: device.status,
    control: device.control,
    history,
    waterLogs: storeWaterLogs,
    health,
    isOnline: device.status.online,
    isWatering: isWateringActive,
    isPumpActive,
    activeDeviceId: targetId,
  };
}
