import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLiveDevice } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import {
  listenToUserAlerts,
  markAlertReadInRTDB,
  deleteAlertFromRTDB,
  writeAlertToRTDB,
  sendLocalNotification,
  CloudAlertRecord,
  SEVEN_DAYS_MS,
} from '@/services/notifications';
import {
  listenToDeviceAlerts,
  saveDeviceAlertToRTDB,
  updateDeviceAlertInRTDB,
  deleteDeviceAlertFromRTDB,
  DeviceAlertRecord,
} from '@/services/devices';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'unread' | 'read' | 'snoozed' | 'active' | 'resolved';
export type AlertType =
  | 'bottle'
  | 'dry'
  | 'wet'
  | 'heat'
  | 'offline'
  | 'watered'
  | 'LOW_WATER'
  | 'PUMP_ERROR'
  | 'INFO_ALERT'
  | 'info'
  | 'warning'
  | 'critical';

export interface AppAlert {
  id: string;
  severity: AlertSeverity;
  type: AlertType | string;
  alertType: 'info' | 'warning' | 'critical';
  title: string;
  body: string;
  message: string;
  description?: string;
  plantName: string;
  deviceId: string;
  createdAt: number;
  ts: number;
  timestamp?: number;
  status: AlertStatus;
  actionLabel?: string;
}

const THREE_MINUTES_MS = 3 * 60 * 1000;

export function useAlertEngine() {
  const user = useSession((s) => s.user);
  const devices = useLiveDevice((s) => s.devices);
  const activeDeviceId = useLiveDevice((s) => s.activeDeviceId);
  const refillBottle = useLiveDevice((s) => s.refillBottle);
  const triggerWaterNow = useLiveDevice((s) => s.triggerWaterNow);

  const [localAlerts, setLocalAlerts] = useState<AppAlert[]>([]);
  const [deviceAlerts, setDeviceAlerts] = useState<AppAlert[]>([]);
  const [userAlerts, setUserAlerts] = useState<AppAlert[]>([]);
  const [statusOverrides, setStatusOverrides] = useState<Record<string, AlertStatus>>({});
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const notifiedAlertsRef = useRef<Set<string>>(new Set());

  // Tracking previous pump states to detect dry pump cycles
  const prevPumpStateRef = useRef<Record<string, { pumpOn: boolean; moisture: number }>>({});
  // Ref to hold current local alerts to prevent over-clearing on telemetry heartbeats
  const localAlertsRef = useRef<AppAlert[]>([]);
  useEffect(() => {
    localAlertsRef.current = localAlerts;
  }, [localAlerts]);

  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  const isCloudSynced = Boolean(user);

  /**
   * Evaluates active conditions for all devices without clearing existing active alerts.
   * Telemetry updates do NOT wipe active alerts unless the underlying condition actually resolves.
   * Every newly generated alert is immediately saved to Firebase RTDB at `/devices/{deviceId}/alerts/{alertId}`.
   */
  const runLocalEvaluation = useCallback(() => {
    const now = Date.now();
    const weather = useLiveDevice.getState().weather;
    const currentAlerts = [...localAlertsRef.current];
    const alertMap = new Map<string, AppAlert>();
    for (const a of currentAlerts) {
      alertMap.set(a.id, a);
    }

    const newLocalAlerts: AppAlert[] = [];
    const newlyCreatedAlerts: AppAlert[] = [];

    for (const dev of Object.values(devices)) {
      const { id: deviceId, config, telemetry, status } = dev;
      const plantName = config.plantName || config.name || 'Plant';
      const location = config.location || 'indoor';
      const isOutdoor = location === 'balcony' || location === 'terrace';
      const locationLabel = location === 'balcony' ? 'Balcony' : location === 'terrace' ? 'Terrace' : 'Indoor';
      const thresholds = config.thresholds;

      // Helper to evaluate an alert rule condition:
      // If violated: retain existing or generate new with createdAt: Date.now()
      // If resolved: mark resolved if it was active
      const evaluateRule = (
        alertId: string,
        isViolated: boolean,
        factory: () => AppAlert
      ) => {
        const existing = alertMap.get(alertId);

        if (isViolated) {
          if (existing) {
            // Retain active alert without resetting createdAt or reinitializing
            newLocalAlerts.push(existing);
            alertMap.delete(alertId);
          } else {
            // Newly triggered alert
            const alert = factory();
            newLocalAlerts.push(alert);
            newlyCreatedAlerts.push(alert);
          }
        } else if (existing) {
          // Condition resolved: soil moisture, temperature, bottle, etc. normalized
          if (existing.status === 'active' || existing.status === 'unread') {
            const resolvedAlert: AppAlert = {
              ...existing,
              status: 'resolved',
            };
            newLocalAlerts.push(resolvedAlert);
            alertMap.delete(alertId);
            // Notify Firebase RTDB that this alert is resolved
            updateDeviceAlertInRTDB(deviceId, alertId, { status: 'resolved' });
          } else {
            newLocalAlerts.push(existing);
            alertMap.delete(alertId);
          }
          notifiedAlertsRef.current.delete(alertId);
        }
      };

      // 1. Device Offline Check
      const isOffline = !status.online || now - status.lastSeen > THREE_MINUTES_MS;
      evaluateRule(`offline-${deviceId}`, isOffline, () => {
        const body = `${plantName} has not reported telemetry in over 3 minutes. Check power & Wi-Fi.`;
        return {
          id: `offline-${deviceId}`,
          deviceId,
          type: 'offline',
          alertType: 'critical',
          severity: 'critical',
          title: 'Device Offline',
          body,
          message: body,
          plantName,
          createdAt: now,
          ts: status.lastSeen || now,
          timestamp: status.lastSeen || now,
          status: 'active',
          actionLabel: 'Check Settings',
        };
      });

      // 2. Low Water / Reservoir Level
      const capacity = config.bottle?.capacityMl || 500;
      const remaining = typeof config.bottle?.remainingMl === 'number' ? config.bottle.remainingMl : 500;
      const bottlePercent = (remaining / capacity) * 100;
      const isBottleEmpty = remaining <= 0 || bottlePercent < 5;
      const isBottleLow = !isBottleEmpty && bottlePercent < 20;

      evaluateRule(`bottle-empty-${deviceId}`, isBottleEmpty, () => {
        const body = `${plantName} reservoir is critically low (${Math.round(remaining)} ml). Auto-watering stopped.`;
        return {
          id: `bottle-empty-${deviceId}`,
          deviceId,
          type: 'bottle',
          alertType: 'critical',
          severity: 'critical',
          title: 'Water Reservoir Empty',
          body,
          message: body,
          plantName,
          createdAt: now,
          ts: now,
          timestamp: now,
          status: 'active',
          actionLabel: 'I Refilled',
        };
      });

      evaluateRule(`bottle-low-${deviceId}`, isBottleLow, () => {
        const body = `${plantName} reservoir is below 20% (${Math.round(remaining)} ml left). Please refill soon.`;
        return {
          id: `bottle-low-${deviceId}`,
          deviceId,
          type: 'bottle',
          alertType: 'warning',
          severity: 'warning',
          title: 'Water Reservoir Low',
          body,
          message: body,
          plantName,
          createdAt: now,
          ts: now,
          timestamp: now,
          status: 'active',
          actionLabel: 'I Refilled',
        };
      });

      // 2b. Pump Ran Without Moisture Rising
      const prevPump = prevPumpStateRef.current[deviceId];
      let pumpFailedCondition = false;
      if (prevPump && prevPump.pumpOn && !telemetry.pumpOn) {
        if (telemetry.soilMoisture <= prevPump.moisture) {
          pumpFailedCondition = true;
        }
      }
      prevPumpStateRef.current[deviceId] = {
        pumpOn: telemetry.pumpOn,
        moisture: telemetry.soilMoisture,
      };

      if (pumpFailedCondition) {
        const failedId = `pump-failed-${deviceId}`;
        const existingFailed = alertMap.get(failedId);
        if (!existingFailed || existingFailed.status !== 'active') {
          const body = `${plantName}: Pump ran but soil moisture did not rise (${telemetry.soilMoisture}%). Possible empty reservoir or clogged tube.`;
          const failedAlert: AppAlert = {
            id: failedId,
            deviceId,
            type: 'bottle',
            alertType: 'warning',
            severity: 'warning',
            title: 'Pump Ineffective',
            body,
            message: body,
            plantName,
            createdAt: now,
            ts: now,
            timestamp: now,
            status: 'active',
            actionLabel: 'Check Reservoir',
          };
          newLocalAlerts.push(failedAlert);
          newlyCreatedAlerts.push(failedAlert);
          alertMap.delete(failedId);
        }
      }

      // 3. Soil Dry - Needs Water (warning alert whenever soilMoisture < moistureMin)
      const isSoilDry = telemetry.soilMoisture < thresholds.moistureMin;
      evaluateRule(`dry-${deviceId}`, isSoilDry, () => {
        const body = `${plantName} soil is at ${telemetry.soilMoisture}%, below the ${thresholds.moistureMin}% min threshold. Needs water now.`;
        return {
          id: `dry-${deviceId}`,
          deviceId,
          type: 'dry',
          alertType: 'warning',
          severity: 'warning',
          title: 'Soil Dry - Needs Water',
          body,
          message: body,
          description: body,
          plantName,
          createdAt: now,
          ts: now,
          timestamp: now,
          status: 'active',
          actionLabel: 'Water Now',
        };
      });

      // 4. Over-Watering Risk
      const isOverWatered = telemetry.soilMoisture > thresholds.moistureMax;
      evaluateRule(`wet-max-${deviceId}`, isOverWatered, () => {
        const body = `${plantName} soil moisture is ${telemetry.soilMoisture}%, exceeding recommended ${thresholds.moistureMax}% max.`;
        return {
          id: `wet-max-${deviceId}`,
          deviceId,
          type: 'wet',
          alertType: 'warning',
          severity: 'warning',
          title: 'Over-Watering Alert',
          body,
          message: body,
          plantName,
          createdAt: now,
          ts: now,
          timestamp: now,
          status: 'active',
        };
      });

      const isHighHumidityWetSoil =
        telemetry.humidity > thresholds.humidityMax && telemetry.soilMoisture >= thresholds.moistureMin;
      evaluateRule(`wet-humid-${deviceId}`, isHighHumidityWetSoil, () => {
        const body = `High air humidity (${telemetry.humidity}%) with wet soil (${telemetry.soilMoisture}%). Risk of fungal root rot on ${plantName}.`;
        return {
          id: `wet-humid-${deviceId}`,
          deviceId,
          type: 'wet',
          alertType: 'warning',
          severity: 'warning',
          title: 'High Humidity & Wet Soil',
          body,
          message: body,
          plantName,
          createdAt: now,
          ts: now,
          timestamp: now,
          status: 'active',
        };
      });

      // 5. Extreme Temperature
      if (isOutdoor) {
        const isExtremeHeat = telemetry.temperature > thresholds.tempMax;
        evaluateRule(`heat-${deviceId}`, isExtremeHeat, () => {
          const body = `Temperature is ${telemetry.temperature}°C on the ${locationLabel} (max: ${thresholds.tempMax}°C). Protect plant from intense heat.`;
          return {
            id: `heat-${deviceId}`,
            deviceId,
            type: 'heat',
            alertType: 'warning',
            severity: 'warning',
            title: `Extreme Heat (${locationLabel})`,
            body,
            message: body,
            plantName,
            createdAt: now,
            ts: now,
            timestamp: now,
            status: 'active',
          };
        });

        const isExtremeCold = telemetry.temperature < 8;
        evaluateRule(`cold-${deviceId}`, isExtremeCold, () => {
          const body = `Temperature dropped to ${telemetry.temperature}°C on the ${locationLabel}. Move ${plantName} indoors to prevent frost damage.`;
          return {
            id: `cold-${deviceId}`,
            deviceId,
            type: 'heat',
            alertType: 'warning',
            severity: 'warning',
            title: `Extreme Cold (${locationLabel})`,
            body,
            message: body,
            plantName,
            createdAt: now,
            ts: now,
            timestamp: now,
            status: 'active',
          };
        });
      } else {
        const isIndoorHeat = telemetry.temperature > thresholds.tempMax;
        evaluateRule(`heat-${deviceId}`, isIndoorHeat, () => {
          const body = `Indoor temperature is ${telemetry.temperature}°C, above recommended ${thresholds.tempMax}°C.`;
          return {
            id: `heat-${deviceId}`,
            deviceId,
            type: 'heat',
            alertType: 'warning',
            severity: 'warning',
            title: 'High Indoor Temperature',
            body,
            message: body,
            plantName,
            createdAt: now,
            ts: now,
            timestamp: now,
            status: 'active',
          };
        });
      }

      // 6. Smart Terrace Rain Delay Notice
      const isRainDelay =
        location === 'terrace' &&
        config.mode === 'auto' &&
        Boolean(weather && weather.rainProbability > 70) &&
        telemetry.soilMoisture < thresholds.moistureMin &&
        telemetry.soilMoisture >= 15;

      evaluateRule(`terrace-rain-delay-${deviceId}`, isRainDelay, () => {
        const body = `${plantName} is on the Terrace. Auto-watering is temporarily delayed because rain probability is ${weather?.rainProbability ?? 0}%. Current soil moisture is ${telemetry.soilMoisture}%.`;
        return {
          id: `terrace-rain-delay-${deviceId}`,
          deviceId,
          type: 'info',
          alertType: 'info',
          severity: 'info',
          title: 'Smart Terrace Rain Delay',
          body,
          message: body,
          plantName,
          createdAt: now,
          ts: now,
          timestamp: now,
          status: 'active',
        };
      });
    }

    // Preserve any remaining alerts (e.g. historical pump failure or other custom alerts)
    for (const remaining of alertMap.values()) {
      newLocalAlerts.push(remaining);
    }

    setLocalAlerts(newLocalAlerts);

    // Save every newly generated alert immediately to Firebase RTDB at /devices/{deviceId}/alerts/{alertId}
    for (const na of newlyCreatedAlerts) {
      saveDeviceAlertToRTDB(na.deviceId, na);
      if (user) {
        writeAlertToRTDB(user.uid, na);
      }

      // Fire notification for warning/critical
      if (!notifiedAlertsRef.current.has(na.id)) {
        notifiedAlertsRef.current.add(na.id);
        if (na.severity === 'critical' || na.severity === 'warning') {
          sendLocalNotification(na.title, na.body, {
            deviceId: na.deviceId,
            type: na.type,
            severity: na.severity,
          });
        }
      }
    }
  }, [devices, user]);

  // Realtime listener for hardware alerts stored in /devices/{deviceId}/alerts
  // Do NOT wipe local active alerts when Firebase RTDB listener updates
  useEffect(() => {
    if (!activeDeviceId) return;

    const unsubscribe = listenToDeviceAlerts(activeDeviceId, (devAlerts: DeviceAlertRecord[]) => {
      const mapped: AppAlert[] = devAlerts.map((da) => {
        const tsVal = da.createdAt || da.timestamp || da.ts || Date.now();
        const messageBody =
          da.message && da.message.trim().length > 0
            ? da.message.trim()
            : da.description && da.description.trim().length > 0
            ? da.description.trim()
            : da.body && da.body.trim().length > 0
            ? da.body.trim()
            : 'Water level is low. Please refill the reservoir.';
        const isLowWater = da.type === 'LOW_WATER' || da.type === 'critical';
        const sev: AlertSeverity =
          isLowWater || da.status === 'ACTIVE' || da.status === 'active' ? 'critical' : 'warning';
        const statusVal: AlertStatus =
          da.status === 'resolved' || da.status === 'RESOLVED' || da.status === 'read'
            ? 'resolved'
            : 'active';

        return {
          id: da.id,
          severity: (da.severity as AlertSeverity) || sev,
          alertType: (da.severity as AlertSeverity) || sev,
          type: da.type || sev,
          title: da.title?.trim() || (isLowWater ? 'Low Reservoir Water' : 'System Notice'),
          body: messageBody,
          message: messageBody,
          description: da.description || messageBody,
          plantName: devices[activeDeviceId]?.config?.plantName || 'Plant',
          deviceId: activeDeviceId,
          createdAt: tsVal,
          ts: tsVal,
          timestamp: tsVal,
          status: statusVal,
          actionLabel: da.actionLabel || (isLowWater ? 'I Refilled' : undefined),
        };
      });

      setDeviceAlerts(mapped);
    });

    return () => unsubscribe();
  }, [activeDeviceId, devices]);

  // Realtime listener for user cloud alerts (/alerts/{uid})
  useEffect(() => {
    if (!user) return;

    const unsubscribe = listenToUserAlerts(user.uid, (cloudAlerts: CloudAlertRecord[]) => {
      const mapped: AppAlert[] = cloudAlerts.map((ca) => {
        const tsVal = ca.createdAt || ca.timestamp || ca.ts || Date.now();
        const messageBody =
          ca.message && ca.message.trim().length > 0
            ? ca.message.trim()
            : ca.description && ca.description.trim().length > 0
            ? ca.description.trim()
            : 'System alert notification.';
        const sev: AlertSeverity =
          ca.severity === 'critical' || ca.severity === 'warning' || ca.severity === 'info'
            ? ca.severity
            : ca.type === 'critical'
            ? 'critical'
            : ca.type === 'warning'
            ? 'warning'
            : 'info';
        const statusVal: AlertStatus =
          ca.read || ca.status === 'resolved' || ca.status === 'read' ? 'resolved' : 'active';

        return {
          id: ca.id,
          severity: sev,
          alertType: sev,
          type: ca.type || sev,
          title: ca.title?.trim() || 'System Notice',
          body: messageBody,
          message: messageBody,
          description: ca.description || messageBody,
          plantName: devices[ca.deviceId]?.config?.plantName || 'Plant',
          deviceId: ca.deviceId,
          createdAt: tsVal,
          ts: tsVal,
          timestamp: tsVal,
          status: statusVal,
          actionLabel:
            ca.type === 'bottle' || ca.type === 'LOW_WATER'
              ? 'I Refilled'
              : ca.type === 'dry'
              ? 'Water Now'
              : ca.type === 'offline'
              ? 'Check Settings'
              : undefined,
        };
      });

      setUserAlerts(mapped);
    });

    return () => unsubscribe();
  }, [user, devices]);

  // Evaluate on device changes or on a regular interval
  useEffect(() => {
    const timeout = setTimeout(runLocalEvaluation, 0);
    const timer = setInterval(runLocalEvaluation, 5000);
    return () => {
      clearTimeout(timeout);
      clearInterval(timer);
    };
  }, [runLocalEvaluation]);

  /**
   * Combined Alerts:
   * Merge incoming server alerts with locally generated real-time alerts using `id` as the unique key:
   * `[...serverAlerts, ...localAlerts]`
   * 7-day pruning filter guards against undefined timestamps:
   * `alert.createdAt && (Date.now() - alert.createdAt <= 7 * 24 * 60 * 60 * 1000)`
   * Do NOT auto-delete active, unresolved alerts regardless of age unless manually resolved by the user.
   */
  const retainedAlerts = useMemo(() => {
    const activeUserAlerts = user ? userAlerts : [];
    const serverAlerts = [...deviceAlerts, ...activeUserAlerts];
    const combined = [...serverAlerts, ...localAlerts];
    const map = new Map<string, AppAlert>();

    for (const a of combined) {
      if (dismissedIds.has(a.id)) continue;
      const override = statusOverrides[a.id];
      const alertWithOverride = override ? { ...a, status: override } : a;

      if (!map.has(a.id)) {
        map.set(a.id, alertWithOverride);
      } else {
        const existing = map.get(a.id)!;
        // Merge without losing properties or active status
        const isResolved =
          override === 'resolved' ||
          override === 'read' ||
          (alertWithOverride.status === 'resolved' && existing.status === 'resolved');

        map.set(a.id, {
          ...existing,
          ...alertWithOverride,
          createdAt: existing.createdAt || alertWithOverride.createdAt,
          status: override || (isResolved ? 'resolved' : alertWithOverride.status || existing.status),
        });
      }
    }

    return Array.from(map.values())
      .filter((alert) => {
        const isResolved = alert.status === 'resolved' || alert.status === 'read';
        // Do NOT auto-delete active, unresolved alerts regardless of age unless manually resolved by the user
        if (!isResolved) return true;
        // Guard against undefined timestamps
        return Boolean(alert.createdAt && currentTime - alert.createdAt <= SEVEN_DAYS_MS);
      })
      .sort(
        (a, b) =>
          (b.createdAt || b.ts || b.timestamp || 0) - (a.createdAt || a.ts || a.timestamp || 0)
      );
  }, [localAlerts, deviceAlerts, userAlerts, statusOverrides, dismissedIds, user, currentTime]);

  // Actions
  const markRead = useCallback(
    (id: string) => {
      setStatusOverrides((prev) => ({ ...prev, [id]: 'read' }));
      const alert = retainedAlerts.find((a) => a.id === id);
      if (alert?.deviceId) {
        updateDeviceAlertInRTDB(alert.deviceId, id, { status: 'resolved' });
      }
      if (user && isCloudSynced) {
        markAlertReadInRTDB(user.uid, id);
      }
    },
    [retainedAlerts, user, isCloudSynced]
  );

  const markAllRead = useCallback(() => {
    setStatusOverrides((prev) => {
      const next = { ...prev };
      retainedAlerts.forEach((a) => {
        next[a.id] = 'read';
      });
      return next;
    });
    retainedAlerts.forEach((a) => {
      if (a.deviceId) {
        updateDeviceAlertInRTDB(a.deviceId, a.id, { status: 'resolved' });
      }
      if (user && isCloudSynced && (a.status === 'unread' || a.status === 'active')) {
        markAlertReadInRTDB(user.uid, a.id);
      }
    });
  }, [retainedAlerts, user, isCloudSynced]);

  const snooze = useCallback((id: string) => {
    setStatusOverrides((prev) => ({ ...prev, [id]: 'snoozed' }));
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      setDismissedIds((prev) => new Set(prev).add(id));
      const alert = retainedAlerts.find((a) => a.id === id);
      if (alert?.deviceId) {
        deleteDeviceAlertFromRTDB(alert.deviceId, id);
      }
      if (user && isCloudSynced) {
        deleteAlertFromRTDB(user.uid, id);
      }
    },
    [retainedAlerts, user, isCloudSynced]
  );

  const handleAction = useCallback(
    (alert: AppAlert) => {
      if (alert.type === 'bottle' || alert.type === 'LOW_WATER') {
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
    () => retainedAlerts.filter((a) => a.status === 'active' || a.status === 'unread'),
    [retainedAlerts]
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
    alerts: retainedAlerts,
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
