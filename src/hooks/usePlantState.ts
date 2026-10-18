import { useEffect } from 'react';
import { useLiveDevice, computePlantHealthState, DeviceRecord } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
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
  const isDemoMode = useSession((s) => s.isDemoMode);

  // When not in Demo Mode, listen to live Firebase RTDB updates
  useEffect(() => {
    if (isDemoMode || !activeDeviceId) return;

    const unsubTelemetry = listenToDeviceTelemetry(activeDeviceId, (telemetry) => {
      useLiveDevice.getState().updateTelemetry(telemetry);
    });

    const unsubConfig = listenToDeviceConfig(activeDeviceId, (config) => {
      useLiveDevice.setState((prev) => {
        const cur = prev.devices[activeDeviceId];
        if (!cur) return prev;
        return {
          devices: {
            ...prev.devices,
            [activeDeviceId]: {
              ...cur,
              config: { ...cur.config, ...config },
            },
          },
        };
      });
    });

    const unsubStatus = listenToDeviceStatus(activeDeviceId, (status) => {
      useLiveDevice.setState((prev) => {
        const cur = prev.devices[activeDeviceId];
        if (!cur) return prev;
        return {
          devices: {
            ...prev.devices,
            [activeDeviceId]: {
              ...cur,
              status: { ...cur.status, ...status },
            },
          },
        };
      });
    });

    const unsubLogs = listenToWaterLogs(activeDeviceId, (logs) => {
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
  }, [activeDeviceId, isDemoMode]);

  return {
    device: active,
    health,
    isOnline,
    isWatering,
    secondsLeft,
  };
}
