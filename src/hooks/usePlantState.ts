import { useEffect, useReducer } from 'react';
import {
  useLiveDevice,
  computePlantHealthState,
  DeviceRecord,
  TELEMETRY_MAX_AGE_MS,
} from '@/store/useLiveDevice';
import { listenToWaterLogs } from '@/services/devices';

export function usePlantState(device?: DeviceRecord) {
  const activeDeviceId = useLiveDevice((s) => s.activeDeviceId);
  const storeActiveDevice = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const active = device || storeActiveDevice;
  const isWatering = useLiveDevice((s) => s.isWateringActive);
  const secondsLeft = useLiveDevice((s) => s.wateringSecondsLeft);
  const [, refreshHealth] = useReducer((revision: number) => revision + 1, 0);
  const sampleTime = active?.telemetry?.ts;

  useEffect(() => {
    if (!sampleTime) return;
    const remainingMs = sampleTime + TELEMETRY_MAX_AGE_MS - Date.now();
    if (remainingMs <= 0) return;
    const timer = setTimeout(refreshHealth, remainingMs);
    return () => clearTimeout(timer);
  }, [sampleTime]);

  useEffect(() => {
    useLiveDevice.setState({ waterLogs: [] });
    if (!activeDeviceId) return;
    return listenToWaterLogs(activeDeviceId, (waterLogs) => {
      if (useLiveDevice.getState().activeDeviceId === activeDeviceId) {
        useLiveDevice.setState({ waterLogs });
      }
    });
  }, [activeDeviceId]);

  return {
    device: active,
    health: computePlantHealthState(active),
    isOnline: active?.status.online ?? false,
    isWatering,
    secondsLeft,
  };
}
