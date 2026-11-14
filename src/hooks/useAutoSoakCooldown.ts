import { useState, useEffect, useMemo } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { useLiveDevice, TELEMETRY_MAX_AGE_MS, DeviceRecord } from '@/store/useLiveDevice';

export interface AutoSoakCooldownResult {
  isCoolingDown: boolean;
  remainingSec: number;
  remainingMinutes: number;
  formattedText: string;
}

/**
 * Pure calculation helper to evaluate soaking cooldown state for a device telemetry snapshot.
 * - Computes remaining seconds and rounded-up minutes.
 * - Hides when expired, offline, manual operating mode, or stale/missing telemetry (> 3 min).
 */
export function computeAutoSoakCooldown(
  device: DeviceRecord | undefined,
  now: number = Date.now()
): AutoSoakCooldownResult {
  const online = Boolean(device?.status?.online);
  const isAutoMode = device?.config?.mode === 'auto';
  const rawRemainingSec = device?.telemetry?.autoCooldownRemainingSec ?? 0;
  const sampleTs = device?.telemetry?.ts ?? 0;

  if (!online || !isAutoMode || rawRemainingSec <= 0 || sampleTs <= 0) {
    return {
      isCoolingDown: false,
      remainingSec: 0,
      remainingMinutes: 0,
      formattedText: '',
    };
  }

  // Guard against stale telemetry older than TELEMETRY_MAX_AGE_MS (3 minutes)
  if (now - sampleTs > TELEMETRY_MAX_AGE_MS) {
    return {
      isCoolingDown: false,
      remainingSec: 0,
      remainingMinutes: 0,
      formattedText: '',
    };
  }

  const elapsedSec = Math.max(0, Math.floor((now - sampleTs) / 1000));
  const remainingSec = Math.max(0, rawRemainingSec - elapsedSec);
  const isCoolingDown = remainingSec > 0;
  const remainingMinutes = isCoolingDown ? Math.ceil(remainingSec / 60) : 0;
  const formattedText = isCoolingDown ? `Soaking cooldown (${remainingMinutes}m left)` : '';

  return {
    isCoolingDown,
    remainingSec,
    remainingMinutes,
    formattedText,
  };
}

/**
 * Derives a live, accurate countdown from the latest controller telemetry sample.
 * - Recomputes on device switch, fresh telemetry updates, and app foreground resume.
 * - Hides when expired, offline, manual operating mode, or stale/missing telemetry.
 * - Never blocks manual watering or overrides active pump feedback.
 */
export function useAutoSoakCooldown(explicitDeviceId?: string): AutoSoakCooldownResult {
  const activeDeviceId = useLiveDevice((s) => s.activeDeviceId);
  const targetDeviceId = explicitDeviceId || activeDeviceId;
  const device = useLiveDevice((s) => s.devices[targetDeviceId]);

  const [tick, setTick] = useState<number>(() => Date.now());

  // Tick countdown locally every 1 second while mounted
  useEffect(() => {
    const timer = setInterval(() => {
      setTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Recompute immediately when app resumes from background
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        setTick(Date.now());
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => {
      subscription.remove();
    };
  }, []);

  return useMemo(() => computeAutoSoakCooldown(device, tick), [device, tick]);
}
