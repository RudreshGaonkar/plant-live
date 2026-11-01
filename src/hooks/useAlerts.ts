import { useState, useEffect, useMemo } from 'react';
import { useLiveDevice } from '@/store/useLiveDevice';
import { listenToDeviceAlerts, DeviceAlertRecord } from '@/services/devices';

export interface UseAlertsReturn {
  alerts: DeviceAlertRecord[];
  unreadAlerts: DeviceAlertRecord[];
  criticalAlerts: DeviceAlertRecord[];
  unreadCount: number;
  criticalCount: number;
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * useAlerts
 * Real-time listener hook for `/devices/{deviceId}/alerts`.
 * Enforces 7-day retention filtering and cleans up event listeners on unmount.
 */
export function useAlerts(customDeviceId?: string): UseAlertsReturn {
  const activeDeviceId = useLiveDevice((s) => s.activeDeviceId);
  const targetId = customDeviceId || activeDeviceId || 'leaf-node-01';
  const device = useLiveDevice((s) => s.devices[targetId]);

  const [deviceAlerts, setDeviceAlerts] = useState<DeviceAlertRecord[]>([]);

  useEffect(() => {
    if (!targetId) return;

    const unsubscribe = listenToDeviceAlerts(targetId, (liveAlerts) => {
      setDeviceAlerts(liveAlerts);
    });

    return () => {
      unsubscribe();
    };
  }, [targetId]);

  const [mountTime, setMountTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setMountTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const retainedAlerts = useMemo(() => {
    const cutoff = mountTime - SEVEN_DAYS_MS;
    const list = deviceAlerts.filter((a) => {
      const ts = a.createdAt || a.timestamp || a.ts || 0;
      return ts >= cutoff;
    });

    // Actively evaluate live threshold violation: soilMoisture < config.thresholds.moistureMin
    if (device && device.telemetry.soilMoisture < device.config.thresholds.moistureMin) {
      const liveDryAlert: DeviceAlertRecord = {
        id: `live-dry-${targetId}`,
        type: 'warning',
        title: 'Soil Dry - Needs Water',
        message: `${device.config.plantName || 'Plant'} soil moisture is ${device.telemetry.soilMoisture}%, below minimum ${device.config.thresholds.moistureMin}%.`,
        status: 'active',
        createdAt: mountTime,
        timestamp: mountTime,
        ts: mountTime,
      };
      if (!list.some((a) => a.id === liveDryAlert.id)) {
        list.unshift(liveDryAlert);
      }
    }

    list.sort((a, b) => ((b.createdAt || b.timestamp || b.ts || 0) - (a.createdAt || a.timestamp || a.ts || 0)));
    return list;
  }, [deviceAlerts, device, targetId, mountTime]);

  const unreadAlerts = useMemo(
    () => retainedAlerts.filter((a) => a.status === 'active'),
    [retainedAlerts]
  );

  const criticalAlerts = useMemo(
    () => retainedAlerts.filter((a) => a.type === 'critical'),
    [retainedAlerts]
  );

  return {
    alerts: retainedAlerts,
    unreadAlerts,
    criticalAlerts,
    unreadCount: unreadAlerts.length,
    criticalCount: criticalAlerts.length,
  };
}
