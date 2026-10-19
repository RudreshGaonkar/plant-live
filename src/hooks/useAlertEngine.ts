import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLiveDevice, DeviceRecord } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import {
  listenToUserAlerts,
  markAlertReadInRTDB,
  deleteAlertFromRTDB,
  sendLocalNotification,
  CloudAlertRecord,
} from '@/services/notifications';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'unread' | 'read' | 'snoozed';
export type AlertType = 'bottle' | 'dry' | 'wet' | 'heat' | 'offline' | 'watered';

export interface AppAlert {
  id: string;
  severity: AlertSeverity;
  type: AlertType;
  title: string;
  body: string;
  plantName: string;
  deviceId: string;
  ts: number;
  status: AlertStatus;
  actionLabel?: string;
}

const ONE_HOUR_MS = 60 * 60 * 1000;
const THREE_MINUTES_MS = 3 * 60 * 1000;
const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export function useAlertEngine() {
  const user = useSession((s) => s.user);
  const isDemoMode = useSession((s) => s.isDemoMode);
  const devices = useLiveDevice((s) => s.devices);
  const refillBottle = useLiveDevice((s) => s.refillBottle);
  const triggerWaterNow = useLiveDevice((s) => s.triggerWaterNow);

  const [alerts, setAlerts] = useState<AppAlert[]>([]);

  // Tracking timestamps for 1-hour deduplication: `${deviceId}:${alertType}` -> timestamp
  const deduplicationMapRef = useRef<Record<string, number>>({});
  // Tracking when soil first went dry for 30-min sustained check: `${deviceId}` -> timestamp
  const drySinceMapRef = useRef<Record<string, number>>({});
  // Tracking previous pump states to detect dry pump cycles
  const prevPumpStateRef = useRef<Record<string, { pumpOn: boolean; moisture: number }>>({});

  /**
   * Evaluates all local alert rules for a device.
   * Returns newly generated alerts.
   */
  const evaluateDevice = useCallback(
    (device: DeviceRecord, now: number): AppAlert[] => {
      const { id: deviceId, config, telemetry, status } = device;
      const plantName = config.plantName || config.name || 'Plant';
      const location = config.location || 'indoor';
      const isOutdoor = location === 'balcony' || location === 'terrace';
      const locationLabel = location === 'balcony' ? 'Balcony' : location === 'terrace' ? 'Terrace' : 'Indoor';
      const thresholds = config.thresholds;

      const newAlerts: AppAlert[] = [];

      const shouldAlert = (type: AlertType): boolean => {
        const key = `${deviceId}:${type}`;
        const lastTs = deduplicationMapRef.current[key];
        if (lastTs && now - lastTs < ONE_HOUR_MS) {
          return false;
        }
        deduplicationMapRef.current[key] = now;
        return true;
      };

      // 1. Device Offline Check (now - lastSeen > 3 min or status.online === false)
      const isOffline = !status.online || now - status.lastSeen > THREE_MINUTES_MS;
      if (isOffline) {
        if (shouldAlert('offline')) {
          newAlerts.push({
            id: `offline-${deviceId}-${now}`,
            deviceId,
            type: 'offline',
            severity: 'critical',
            title: 'Device Offline',
            body: `${plantName} has not reported telemetry in over 3 minutes. Check power & Wi-Fi.`,
            plantName,
            ts: status.lastSeen || now,
            status: 'unread',
            actionLabel: 'Check Settings',
          });
        }
      }

      // 2. Low Water / Reservoir Level
      const capacity = config.bottle?.capacityMl || 500;
      const remaining = typeof config.bottle?.remainingMl === 'number' ? config.bottle.remainingMl : 500;
      const bottlePercent = (remaining / capacity) * 100;

      if (remaining <= 0 || bottlePercent < 5) {
        if (shouldAlert('bottle')) {
          newAlerts.push({
            id: `bottle-empty-${deviceId}-${now}`,
            deviceId,
            type: 'bottle',
            severity: 'critical',
            title: 'Water Reservoir Empty',
            body: `${plantName} reservoir is critically low (${Math.round(remaining)} ml). Auto-watering stopped.`,
            plantName,
            ts: now,
            status: 'unread',
            actionLabel: 'I Refilled',
          });
        }
      } else if (bottlePercent < 20) {
        if (shouldAlert('bottle')) {
          newAlerts.push({
            id: `bottle-low-${deviceId}-${now}`,
            deviceId,
            type: 'bottle',
            severity: 'warning',
            title: 'Water Reservoir Low',
            body: `${plantName} reservoir is below 20% (${Math.round(remaining)} ml left). Please refill soon.`,
            plantName,
            ts: now,
            status: 'unread',
            actionLabel: 'I Refilled',
          });
        }
      }

      // 2b. Pump ran without soil moisture rising
      const prevPump = prevPumpStateRef.current[deviceId];
      if (prevPump && prevPump.pumpOn && !telemetry.pumpOn) {
        if (telemetry.soilMoisture <= prevPump.moisture) {
          if (shouldAlert('bottle')) {
            newAlerts.push({
              id: `pump-failed-${deviceId}-${now}`,
              deviceId,
              type: 'bottle',
              severity: 'warning',
              title: 'Pump Ineffective',
              body: `${plantName}: Pump ran but soil moisture did not rise (${telemetry.soilMoisture}%). Possible empty reservoir or clogged tube.`,
              plantName,
              ts: now,
              status: 'unread',
              actionLabel: 'Check Reservoir',
            });
          }
        }
      }
      prevPumpStateRef.current[deviceId] = {
        pumpOn: telemetry.pumpOn,
        moisture: telemetry.soilMoisture,
      };

      // 3. Soil Too Dry (> 30 min continuously)
      if (telemetry.soilMoisture < thresholds.moistureMin) {
        if (!drySinceMapRef.current[deviceId]) {
          drySinceMapRef.current[deviceId] = now;
        }
        const dryDuration = now - drySinceMapRef.current[deviceId];
        // In demo mode or if dry for > 30 minutes
        if (isDemoMode || dryDuration >= THIRTY_MINUTES_MS) {
          if (shouldAlert('dry')) {
            newAlerts.push({
              id: `dry-${deviceId}-${now}`,
              deviceId,
              type: 'dry',
              severity: 'warning',
              title: 'Soil Moisture Low',
              body: `${plantName} soil is at ${telemetry.soilMoisture}%, below the ${thresholds.moistureMin}% min threshold.`,
              plantName,
              ts: now,
              status: 'unread',
              actionLabel: 'Water Now',
            });
          }
        }
      } else {
        delete drySinceMapRef.current[deviceId];
      }

      // 4. Over-Watering Risk
      if (telemetry.soilMoisture > thresholds.moistureMax) {
        if (shouldAlert('wet')) {
          newAlerts.push({
            id: `wet-max-${deviceId}-${now}`,
            deviceId,
            type: 'wet',
            severity: 'warning',
            title: 'Over-Watering Alert',
            body: `${plantName} soil moisture is ${telemetry.soilMoisture}%, exceeding recommended ${thresholds.moistureMax}% max.`,
            plantName,
            ts: now,
            status: 'unread',
          });
        }
      } else if (telemetry.humidity > thresholds.humidityMax && telemetry.soilMoisture >= thresholds.moistureMin) {
        if (shouldAlert('wet')) {
          newAlerts.push({
            id: `wet-humid-${deviceId}-${now}`,
            deviceId,
            type: 'wet',
            severity: 'warning',
            title: 'High Humidity & Wet Soil',
            body: `High air humidity (${telemetry.humidity}%) with wet soil (${telemetry.soilMoisture}%). Risk of fungal root rot on ${plantName}.`,
            plantName,
            ts: now,
            status: 'unread',
          });
        }
      }

      // 5. Extreme Temperature
      if (isOutdoor) {
        if (telemetry.temperature > thresholds.tempMax) {
          if (shouldAlert('heat')) {
            newAlerts.push({
              id: `heat-extreme-${deviceId}-${now}`,
              deviceId,
              type: 'heat',
              severity: 'warning',
              title: `Extreme Heat (${locationLabel})`,
              body: `Temperature is ${telemetry.temperature}°C on the ${locationLabel} (max: ${thresholds.tempMax}°C). Protect plant from intense heat.`,
              plantName,
              ts: now,
              status: 'unread',
            });
          }
        } else if (telemetry.temperature < 8) {
          if (shouldAlert('heat')) {
            newAlerts.push({
              id: `cold-extreme-${deviceId}-${now}`,
              deviceId,
              type: 'heat',
              severity: 'warning',
              title: `Extreme Cold (${locationLabel})`,
              body: `Temperature dropped to ${telemetry.temperature}°C on the ${locationLabel}. Move ${plantName} indoors to prevent frost damage.`,
              plantName,
              ts: now,
              status: 'unread',
            });
          }
        }
      } else {
        if (telemetry.temperature > thresholds.tempMax) {
          if (shouldAlert('heat')) {
            newAlerts.push({
              id: `heat-indoor-${deviceId}-${now}`,
              deviceId,
              type: 'heat',
              severity: 'warning',
              title: 'High Indoor Temperature',
              body: `Indoor temperature is ${telemetry.temperature}°C, above recommended ${thresholds.tempMax}°C.`,
              plantName,
              ts: now,
              status: 'unread',
            });
          }
        }
      }

      return newAlerts;
    },
    [isDemoMode]
  );

  const isCloudSynced = Boolean(user && !isDemoMode);

  // Periodic local alert evaluation (checks every 10 seconds or on telemetry update)
  const runLocalEvaluation = useCallback(() => {
    const now = Date.now();
    const evaluated: AppAlert[] = [];

    for (const dev of Object.values(devices)) {
      const devAlerts = evaluateDevice(dev, now);
      evaluated.push(...devAlerts);
    }

    if (evaluated.length > 0) {
      setAlerts((prev) => {
        const existingIds = new Set(prev.map((a) => a.id));
        const filteredNew = evaluated.filter((a) => !existingIds.has(a.id));
        if (filteredNew.length === 0) return prev;

        // Fire local notification for new alerts
        for (const na of filteredNew) {
          if (na.severity === 'critical' || na.severity === 'warning') {
            sendLocalNotification(na.title, na.body, {
              deviceId: na.deviceId,
              type: na.type,
              severity: na.severity,
            });
          }
        }

        return [...filteredNew, ...prev];
      });
    }
  }, [devices, evaluateDevice]);

  // --- Realtime Cloud Alerts Sync ---
  useEffect(() => {
    if (!user || isDemoMode) return;

    const unsubscribe = listenToUserAlerts(user.uid, (cloudAlerts: CloudAlertRecord[]) => {
      if (cloudAlerts.length > 0) {
        const mapped: AppAlert[] = cloudAlerts.map((ca) => ({
          id: ca.id,
          severity: ca.severity,
          type: ca.type,
          title: ca.title,
          body: ca.message,
          plantName: devices[ca.deviceId]?.config.plantName || 'Plant',
          deviceId: ca.deviceId,
          ts: ca.ts,
          status: ca.read ? 'read' : 'unread',
          actionLabel:
            ca.type === 'bottle'
              ? 'I Refilled'
              : ca.type === 'dry'
              ? 'Water Now'
              : ca.type === 'offline'
              ? 'Check Settings'
              : undefined,
        }));
        setAlerts(mapped);
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user, isDemoMode, devices]);

  // Evaluate on device changes or on a regular interval
  useEffect(() => {
    const timeout = setTimeout(runLocalEvaluation, 0);
    const timer = setInterval(runLocalEvaluation, 10000);
    return () => {
      clearTimeout(timeout);
      clearInterval(timer);
    };
  }, [runLocalEvaluation]);

  // Actions
  const markRead = useCallback(
    (id: string) => {
      setAlerts((prev) =>
        prev.map((a) => (a.id === id ? { ...a, status: 'read' as AlertStatus } : a))
      );
      if (user && !isDemoMode && isCloudSynced) {
        markAlertReadInRTDB(user.uid, id);
      }
    },
    [user, isDemoMode, isCloudSynced]
  );

  const markAllRead = useCallback(() => {
    setAlerts((prev) =>
      prev.map((a) => ({ ...a, status: 'read' as AlertStatus }))
    );
    if (user && !isDemoMode && isCloudSynced) {
      alerts.forEach((a) => {
        if (a.status === 'unread') {
          markAlertReadInRTDB(user.uid, a.id);
        }
      });
    }
  }, [alerts, user, isDemoMode, isCloudSynced]);

  const snooze = useCallback((id: string) => {
    setAlerts((prev) =>
      prev.map((a) => (a.id === id ? { ...a, status: 'snoozed' as AlertStatus } : a))
    );
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      setAlerts((prev) => prev.filter((a) => a.id !== id));
      if (user && !isDemoMode && isCloudSynced) {
        deleteAlertFromRTDB(user.uid, id);
      }
    },
    [user, isDemoMode, isCloudSynced]
  );

  const handleAction = useCallback(
    (alert: AppAlert) => {
      if (alert.type === 'bottle') {
        refillBottle();
        markRead(alert.id);
      } else if (alert.type === 'dry') {
        triggerWaterNow(5);
        markRead(alert.id);
      } else {
        markRead(alert.id);
      }
    },
    [refillBottle, triggerWaterNow, markRead]
  );

  const unreadAlerts = useMemo(
    () => alerts.filter((a) => a.status === 'unread'),
    [alerts]
  );
  const criticalAlerts = useMemo(
    () => unreadAlerts.filter((a) => a.severity === 'critical'),
    [unreadAlerts]
  );
  const warningAlerts = useMemo(
    () => unreadAlerts.filter((a) => a.severity === 'warning'),
    [unreadAlerts]
  );
  const infoAlerts = useMemo(
    () => unreadAlerts.filter((a) => a.severity === 'info'),
    [unreadAlerts]
  );

  return {
    alerts,
    unreadAlerts,
    criticalAlerts,
    warningAlerts,
    infoAlerts,
    unreadCount: unreadAlerts.length,
    criticalCount: criticalAlerts.length,
    isCloudSynced,
    markRead,
    markAllRead,
    snooze,
    dismiss,
    handleAction,
    evaluateNow: runLocalEvaluation,
  };
}
