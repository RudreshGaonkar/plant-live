import { useEffect } from 'react';
import {
  useLiveDevice,
  computePlantHealthState,
  DeviceRecord,
  createDefaultDeviceRecord,
} from '@/hooks/useLiveDevice';
import {
  listenToDeviceTelemetry,
  listenToDeviceConfig,
  listenToDeviceStatus,
  listenToWaterLogs,
} from '@/services/devices';

export function usePlantState(device?: DeviceRecord) {
  const activeDeviceId = useLiveDevice((s) => s.activeDeviceId);
  const storeActiveDevice = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const active = device || storeActiveDevice;
  const health = computePlantHealthState(active);

  const isOnline = active?.status?.online ?? false;
  const isWatering = useLiveDevice((s) => s.isWateringActive);
  const secondsLeft = useLiveDevice((s) => s.wateringSecondsLeft);

  // Persistent live Firebase RTDB updates
  useEffect(() => {
    const targetId = activeDeviceId || 'leaf-node-01';

    const unsubTelemetry = listenToDeviceTelemetry(targetId, (telemetry) => {
      useLiveDevice.getState().updateTelemetry(telemetry);
    });

    const unsubConfig = listenToDeviceConfig(targetId, (config) => {
      useLiveDevice.getState().updateConfig(config);
    });

    const unsubStatus = listenToDeviceStatus(targetId, (status) => {
      useLiveDevice.setState((prev) => {
        const cur = prev.devices[targetId] || createDefaultDeviceRecord(targetId);
        return {
          devices: {
            ...prev.devices,
            [targetId]: {
              ...cur,
              status: { ...cur.status, ...status },
            },
          },
        };
      });
    });

    const unsubLogs = listenToWaterLogs(targetId, (logs) => {
      if (logs && logs.length > 0) {
        useLiveDevice.setState({ waterLogs: logs });
      }
    });

    return () => {
      unsubTelemetry();
      unsubConfig();
      unsubStatus();
      unsubLogs();
    };
  }, [activeDeviceId]);

  return {
    device: active,
    health,
    isOnline,
    isWatering,
    secondsLeft,
  };
}
