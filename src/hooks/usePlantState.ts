import { useLiveDevice, computePlantHealthState, DeviceRecord } from '@/store/useLiveDevice';

export function usePlantState(device?: DeviceRecord) {
  const storeActiveDevice = useLiveDevice((s) => s.devices[s.activeDeviceId]);
  const active = device || storeActiveDevice;
  const health = computePlantHealthState(active);

  const isOnline = active?.status?.online ?? false;
  const isWatering = useLiveDevice((s) => s.isWateringActive);
  const secondsLeft = useLiveDevice((s) => s.wateringSecondsLeft);

  return {
    device: active,
    health,
    isOnline,
    isWatering,
    secondsLeft,
  };
}
