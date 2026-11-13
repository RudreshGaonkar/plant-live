import { useState, useEffect, useMemo, useRef } from 'react';
import { useLiveDevice } from '@/store/useLiveDevice';
import {
  listenToDeviceAlerts,
  saveDeviceAlertToRTDB,
  updateDeviceAlertInRTDB,
  DeviceAlertRecord,
} from '@/services/devices';

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
 * Merges server alerts with local real-time alerts without wiping on RTDB stream updates.
 * Immediately saves newly generated alerts to Firebase RTDB and protects active alerts from 7-day pruning.
 */
export function useAlerts(customDeviceId?: string): UseAlertsReturn {
  const activeDeviceId = useLiveDevice((s) => s.activeDeviceId);
  const targetId = customDeviceId || activeDeviceId || 'leaf-node-01';
  const device = useLiveDevice((s) => s.devices[targetId]);

  const [serverAlerts, setServerAlerts] = useState<DeviceAlertRecord[]>([]);
  const [localAlerts, setLocalAlerts] = useState<DeviceAlertRecord[]>([]);
  const savedAlertIdsRef = useRef<Set<string>>(new Set());

  // RTDB listener: do NOT wipe local active alerts when Firebase RTDB listener updates
  useEffect(() => {
    if (!targetId) return;

    const unsubscribe = listenToDeviceAlerts(targetId, (liveAlerts) => {
      setServerAlerts(liveAlerts);
    });

    return () => {
      unsubscribe();
    };
  }, [targetId]);

  // Telemetry heartbeat evaluation: do not clear active alerts unless condition resolves
  useEffect(() => {
    if (!device) return;

    const dryAlertId = `live-dry-${targetId}`;
    const isDry = device.telemetry.soilMoisture < device.config.thresholds.moistureMin;

    if (isDry) {
      setLocalAlerts((prev) => {
        const existing = prev.find((a) => a.id === dryAlertId);
        if (existing && existing.status === 'active') {
          return prev; // Retain active alert without resetting createdAt
        }

        const now = Date.now();
        const liveDryAlert: DeviceAlertRecord = {
          id: dryAlertId,
          type: 'warning',
          title: 'Soil Dry - Needs Water',
          message: `${device.config.plantName || 'Plant'} soil moisture is ${device.telemetry.soilMoisture}%, below minimum ${device.config.thresholds.moistureMin}%.`,
          status: 'active',
          createdAt: existing?.createdAt || now,
          timestamp: existing?.createdAt || now,
          ts: existing?.createdAt || now,
        };

        // Immediately save newly generated alert to Firebase RTDB at /devices/{deviceId}/alerts/{alertId}
        if (!savedAlertIdsRef.current.has(dryAlertId)) {
          savedAlertIdsRef.current.add(dryAlertId);
          saveDeviceAlertToRTDB(targetId, liveDryAlert);
        }

        return [liveDryAlert, ...prev.filter((a) => a.id !== dryAlertId)];
      });
    } else {
      // Condition resolved: soil moisture returned to normal range
      setLocalAlerts((prev) => {
        const existing = prev.find((a) => a.id === dryAlertId);
        if (existing && existing.status === 'active') {
          savedAlertIdsRef.current.delete(dryAlertId);
          updateDeviceAlertInRTDB(targetId, dryAlertId, { status: 'resolved' });
          return prev.map((a) => (a.id === dryAlertId ? { ...a, status: 'resolved' } : a));
        }
        return prev;
      });
    }
  }, [device, targetId]);

  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Clean merge strategy: Merge incoming server alerts with locally generated real-time alerts using id as unique key
  const retainedAlerts = useMemo(() => {
    const combined = [...serverAlerts, ...localAlerts];
    const alertMap = new Map<string, DeviceAlertRecord>();

    for (const alert of combined) {
      if (!alertMap.has(alert.id)) {
        alertMap.set(alert.id, alert);
      } else {
        const existing = alertMap.get(alert.id)!;
        alertMap.set(alert.id, {
          ...existing,
          ...alert,
          createdAt: existing.createdAt || alert.createdAt,
          status: existing.status === 'resolved' || alert.status === 'resolved' ? 'resolved' : alert.status,
        });
      }
    }

    const startOfTodayMs = new Date().setHours(0, 0, 0, 0);

    return Array.from(alertMap.values())
      .filter((alert) => {
        const ts = alert.timestamp ?? alert.createdAt ?? alert.ts ?? 0;
        // Strictly filter to today only
        if (ts < startOfTodayMs) return false;

        const isResolved = alert.status === 'resolved' || alert.status === 'read';
        // Do NOT auto-delete active, unresolved alerts regardless of age unless manually resolved by the user
        if (!isResolved) return true;
        // Guard against undefined timestamps: alert.createdAt && (currentTime - alert.createdAt <= 7 * 24 * 60 * 60 * 1000)
        return Boolean(alert.createdAt && currentTime - alert.createdAt <= SEVEN_DAYS_MS);
      })
      .sort((a, b) => (b.timestamp || b.createdAt || b.ts || 0) - (a.timestamp || a.createdAt || a.ts || 0));
  }, [serverAlerts, localAlerts, currentTime]);

  const unreadAlerts = useMemo(
    () => retainedAlerts.filter((a) => a.status === 'active' || a.status === 'unread'),
    [retainedAlerts]
  );

  const criticalAlerts = useMemo(
    () => retainedAlerts.filter((a) => a.type === 'critical' || a.severity === 'critical'),
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

