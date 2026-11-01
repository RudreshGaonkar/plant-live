import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useLiveDevice, DeviceRecord } from '@/store/useLiveDevice';
import { useSession } from '@/store/useSession';
import {
  listenToUserAlerts,
  markAlertReadInRTDB,
  deleteAlertFromRTDB,
  sendLocalNotification,
  CloudAlertRecord,
  SEVEN_DAYS_MS,
} from '@/services/notifications';
import { listenToDeviceAlerts, DeviceAlertRecord } from '@/services/devices';

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertStatus = 'unread' | 'read' | 'snoozed' | 'active' | 'resolved';
export type AlertType = 'bottle' | 'dry' | 'wet' | 'heat' | 'offline' | 'watered' | 'LOW_WATER' | 'PUMP_ERROR' | 'INFO_ALERT' | 'info' | 'warning' | 'critical';

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

const ONE_HOUR_MS = 60 * 60 * 1000;
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

  // Tracking timestamps for 1-hour deduplication: `${deviceId}:${alertType}` -> timestamp
  const deduplicationMapRef = useRef<Record<string, number>>({});
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
          const body = `${plantName} has not reported telemetry in over 3 minutes. Check power & Wi-Fi.`;
          newAlerts.push({
            id: `offline-${deviceId}-${now}`,
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
          });
        }
      }

      // 2. Low Water / Reservoir Level
      const capacity = config.bottle?.capacityMl || 500;
      const remaining = typeof config.bottle?.remainingMl === 'number' ? config.bottle.remainingMl : 500;
      const bottlePercent = (remaining / capacity) * 100;

      if (remaining <= 0 || bottlePercent < 5) {
        if (shouldAlert('bottle')) {
          const body = `${plantName} reservoir is critically low (${Math.round(remaining)} ml). Auto-watering stopped.`;
          newAlerts.push({
            id: `bottle-empty-${deviceId}-${now}`,
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
          });
        }
      } else if (bottlePercent < 20) {
        if (shouldAlert('bottle')) {
          const body = `${plantName} reservoir is below 20% (${Math.round(remaining)} ml left). Please refill soon.`;
          newAlerts.push({
            id: `bottle-low-${deviceId}-${now}`,
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
          });
        }
      }

      // 2b. Pump ran without soil moisture rising
      const prevPump = prevPumpStateRef.current[deviceId];
      if (prevPump && prevPump.pumpOn && !telemetry.pumpOn) {
        if (telemetry.soilMoisture <= prevPump.moisture) {
          if (shouldAlert('bottle')) {
            const body = `${plantName}: Pump ran but soil moisture did not rise (${telemetry.soilMoisture}%). Possible empty reservoir or clogged tube.`;
            newAlerts.push({
              id: `pump-failed-${deviceId}-${now}`,
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
            });
          }
        }
      }
      prevPumpStateRef.current[deviceId] = {
        pumpOn: telemetry.pumpOn,
        moisture: telemetry.soilMoisture,
      };

      // 3. Soil Dry - Needs Water (Immediate warning alert whenever soilMoisture < moistureMin)
      if (telemetry.soilMoisture < thresholds.moistureMin) {
        const body = `${plantName} soil is at ${telemetry.soilMoisture}%, below the ${thresholds.moistureMin}% min threshold. Needs water now.`;
        newAlerts.push({
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
        });
      }

      // 4. Over-Watering Risk
      if (telemetry.soilMoisture > thresholds.moistureMax) {
        if (shouldAlert('wet')) {
          const body = `${plantName} soil moisture is ${telemetry.soilMoisture}%, exceeding recommended ${thresholds.moistureMax}% max.`;
          newAlerts.push({
            id: `wet-max-${deviceId}-${now}`,
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
          });
        }
      } else if (telemetry.humidity > thresholds.humidityMax && telemetry.soilMoisture >= thresholds.moistureMin) {
        if (shouldAlert('wet')) {
          const body = `High air humidity (${telemetry.humidity}%) with wet soil (${telemetry.soilMoisture}%). Risk of fungal root rot on ${plantName}.`;
          newAlerts.push({
            id: `wet-humid-${deviceId}-${now}`,
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
          });
        }
      }

      // 5. Extreme Temperature
      if (isOutdoor) {
        if (telemetry.temperature > thresholds.tempMax) {
          if (shouldAlert('heat')) {
            const body = `Temperature is ${telemetry.temperature}°C on the ${locationLabel} (max: ${thresholds.tempMax}°C). Protect plant from intense heat.`;
            newAlerts.push({
              id: `heat-extreme-${deviceId}-${now}`,
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
            });
          }
        } else if (telemetry.temperature < 8) {
          if (shouldAlert('heat')) {
            const body = `Temperature dropped to ${telemetry.temperature}°C on the ${locationLabel}. Move ${plantName} indoors to prevent frost damage.`;
            newAlerts.push({
              id: `cold-extreme-${deviceId}-${now}`,
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
            });
          }
        }
      } else {
        if (telemetry.temperature > thresholds.tempMax) {
          if (shouldAlert('heat')) {
            const body = `Indoor temperature is ${telemetry.temperature}°C, above recommended ${thresholds.tempMax}°C.`;
            newAlerts.push({
              id: `heat-indoor-${deviceId}-${now}`,
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
            });
          }
        }
      }

      // 6. Smart Terrace Rain Delay Notice
      const weather = useLiveDevice.getState().weather;
      if (
        location === 'terrace' &&
        config.mode === 'auto' &&
        weather &&
        weather.rainProbability > 70 &&
        telemetry.soilMoisture < thresholds.moistureMin &&
        telemetry.soilMoisture >= 15 // Override if below CRITICAL_MIN (15%)
      ) {
        if (shouldAlert('info')) {
          const body = `${plantName} is on the Terrace. Auto-watering is temporarily delayed because rain probability is ${weather.rainProbability}%. Current soil moisture is ${telemetry.soilMoisture}%.`;
          newAlerts.push({
            id: `terrace-rain-delay-${deviceId}-${now}`,
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
          });
        }
      }

      return newAlerts;
    },
    []
  );

  const isCloudSynced = Boolean(user);

  // Periodic local alert evaluation (checks on telemetry updates & regular timer)
  const runLocalEvaluation = useCallback(() => {
    const now = Date.now();
    const evaluated: AppAlert[] = [];

    for (const dev of Object.values(devices)) {
      const devAlerts = evaluateDevice(dev, now);
      evaluated.push(...devAlerts);
    }

    setLocalAlerts(evaluated);

    // Fire notifications for newly appearing critical or warning alerts
    for (const na of evaluated) {
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
  }, [devices, evaluateDevice]);

  // Realtime listener for historical hardware alerts stored in /devices/{deviceId}/alerts
  useEffect(() => {
    if (!activeDeviceId) return;

    const unsubscribe = listenToDeviceAlerts(activeDeviceId, (devAlerts: DeviceAlertRecord[]) => {
      const cutoff = Date.now() - SEVEN_DAYS_MS;
      const mapped: AppAlert[] = devAlerts
        .filter((da) => (da.createdAt || da.timestamp || da.ts || 0) >= cutoff)
        .map((da) => {
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
            severity: sev,
            alertType: sev,
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
            actionLabel: isLowWater ? 'I Refilled' : undefined,
          };
        });

      setDeviceAlerts(mapped);
    });

    return () => unsubscribe();
  }, [activeDeviceId, devices]);

  // Realtime listener for user cloud alerts (/users/{uid}/alerts)
  useEffect(() => {
    if (!user) return;

    const unsubscribe = listenToUserAlerts(user.uid, (cloudAlerts: CloudAlertRecord[]) => {
      const cutoff = Date.now() - SEVEN_DAYS_MS;
      const mapped: AppAlert[] = cloudAlerts
        .filter((ca) => (ca.createdAt || ca.ts || ca.timestamp || 0) >= cutoff)
        .map((ca) => {
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
    const timer = setInterval(runLocalEvaluation, 10000);
    return () => {
      clearTimeout(timeout);
      clearInterval(timer);
    };
  }, [runLocalEvaluation]);

  const [nowTimestamp, setNowTimestamp] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNowTimestamp(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Combined Alerts: Merges live threshold violations from telemetry, device alerts, and user alerts
  const retainedAlerts = useMemo(() => {
    const activeUserAlerts = user ? userAlerts : [];
    const combined = [...localAlerts, ...deviceAlerts, ...activeUserAlerts];
    const map = new Map<string, AppAlert>();

    for (const a of combined) {
      if (dismissedIds.has(a.id)) continue;
      if (!map.has(a.id)) {
        const override = statusOverrides[a.id];
        map.set(a.id, override ? { ...a, status: override } : a);
      }
    }

    const cutoff = nowTimestamp - SEVEN_DAYS_MS;
    return Array.from(map.values())
      .filter((a) => (a.createdAt || a.ts || a.timestamp || 0) >= cutoff)
      .sort(
        (a, b) => (b.createdAt || b.ts || b.timestamp || 0) - (a.createdAt || a.ts || a.timestamp || 0)
      );
  }, [localAlerts, deviceAlerts, userAlerts, statusOverrides, dismissedIds, nowTimestamp, user]);

  // Actions
  const markRead = useCallback(
    (id: string) => {
      setStatusOverrides((prev) => ({ ...prev, [id]: 'read' }));
      if (user && isCloudSynced) {
        markAlertReadInRTDB(user.uid, id);
      }
    },
    [user, isCloudSynced]
  );

  const markAllRead = useCallback(() => {
    setStatusOverrides((prev) => {
      const next = { ...prev };
      retainedAlerts.forEach((a) => {
        next[a.id] = 'read';
      });
      return next;
    });
    if (user && isCloudSynced) {
      retainedAlerts.forEach((a) => {
        if (a.status === 'unread' || a.status === 'active') {
          markAlertReadInRTDB(user.uid, a.id);
        }
      });
    }
  }, [retainedAlerts, user, isCloudSynced]);

  const snooze = useCallback((id: string) => {
    setStatusOverrides((prev) => ({ ...prev, [id]: 'snoozed' }));
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      setDismissedIds((prev) => new Set(prev).add(id));
      if (user && isCloudSynced) {
        deleteAlertFromRTDB(user.uid, id);
      }
    },
    [user, isCloudSynced]
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
