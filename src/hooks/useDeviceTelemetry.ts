import { useState, useEffect, useMemo } from 'react';
import { ref, onValue, off } from 'firebase/database';
import { db } from '@/services/firebase';
import { useLiveDevice, DeviceTelemetry, createDefaultDeviceRecord } from '@/store/useLiveDevice';

export interface UseDeviceTelemetryReturn {
  telemetry: DeviceTelemetry;
  isPumpActive: boolean;
  soilMoisture: number;
  soilRaw: number;
  temperature: number;
  humidity: number;
  waterLevel: number;
  waterLevelLow: boolean;
  light: number | null;
  rssi: number;
  ts: number;
  isOnline: boolean;
}

/**
 * useDeviceTelemetry
 * Persistent real-time listener hook for `/devices/{deviceId}/telemetry` and `/devices/{deviceId}/control`.
 * Guarantees zero-lag updates without requiring pull-to-refresh or remounts.
 * Cleans up listeners on unmount.
 */
export function useDeviceTelemetry(customDeviceId?: string): UseDeviceTelemetryReturn {
  const activeDeviceId = useLiveDevice((s) => s.activeDeviceId);
  const targetId = customDeviceId || activeDeviceId || 'leaf-node-01';

  const device = useLiveDevice((s) => s.devices[targetId]);
  const isWateringActive = useLiveDevice((s) => s.isWateringActive);

  useEffect(() => {
    if (!targetId) return;

    // 1. Persistent Telemetry Listener
    const telemetryRef = ref(db, `devices/${targetId}/telemetry`);
    const unsubTelemetry = onValue(telemetryRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val() as DeviceTelemetry;
        useLiveDevice.getState().updateTelemetry(data);
      }
    });

    // 2. Persistent Control Listener
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

    return () => {
      off(telemetryRef, 'value', unsubTelemetry);
      off(controlRef, 'value', unsubControl);
    };
  }, [targetId]);

  const [initialTs] = useState(() => Date.now());

  const defaultTelemetry = useMemo<DeviceTelemetry>(() => ({
    soilRaw: 600,
    soilMoisture: 45,
    temperature: 24,
    humidity: 60,
    light: 1,
    pumpOn: false,
    isPumpActive: false,
    waterLevelLow: false,
    waterLevel: 50,
    rssi: -60,
    ts: initialTs,
  }), [initialTs]);

  const telemetry = device?.telemetry || defaultTelemetry;
  const isPumpActive = Boolean(
    telemetry.isPumpActive ||
    telemetry.pumpOn ||
    device?.control?.pumpState ||
    isWateringActive
  );

  return {
    telemetry,
    isPumpActive,
    soilMoisture: telemetry.soilMoisture ?? 0,
    soilRaw: telemetry.soilRaw ?? 0,
    temperature: telemetry.temperature ?? 0,
    humidity: telemetry.humidity ?? 0,
    waterLevel: telemetry.waterLevel ?? 0,
    waterLevelLow: Boolean(telemetry.waterLevelLow),
    light: telemetry.light ?? null,
    rssi: telemetry.rssi ?? -60,
    ts: telemetry.ts ?? initialTs,
    isOnline: device?.status?.online ?? true,
  };
}
