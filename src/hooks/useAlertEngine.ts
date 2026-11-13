import { useState, useEffect, useCallback, useMemo } from 'react';
import { create } from 'zustand';
import { ref, onValue } from 'firebase/database';
import { db } from '@/services/firebase';
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
  sendDeviceCommand,
  listenToDeviceCommand,
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

/**
 * Execute real hardware waterNow command targeting a specific deviceId
 * and wait for confirmed execution before completing.
 */
export async function executeWaterForDevice(deviceId: string, durationSec = 5): Promise<boolean> {
  return new Promise((resolve) => {
    const cmdId = `cmd-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    let hasResolved = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let unsub: (() => void) | null = null;

    const cleanup = () => {
      if (timer) clearTimeout(timer);
      unsub?.();
    };

    unsub = listenToDeviceCommand(deviceId, (cmd) => {
      if (cmd?.id === cmdId && cmd?.ack?.id === cmdId) {
        if (cmd.ack.status === 'done') {
          if (!hasResolved) {
            hasResolved = true;
            cleanup();
            resolve(true);
          }
        } else if (cmd.ack.status === 'rejected' || cmd.ack.status === 'failed') {
          if (!hasResolved) {
            hasResolved = true;
            cleanup();
            resolve(false);
          }
        }
      }
    });

    timer = setTimeout(() => {
      if (!hasResolved) {
        hasResolved = true;
        cleanup();
        resolve(false);
      }
    }, (durationSec + 15) * 1000);

    sendDeviceCommand(deviceId, { type: 'waterNow', durationSec }, cmdId).catch(() => {
      if (!hasResolved) {
        hasResolved = true;
        cleanup();
        resolve(false);
      }
    });
  });
}

// ── Session-Level Alert Store Singleton ──────────────────────────────────
interface AlertStoreState {
  localAlerts: AppAlert[];
  deviceAlerts: AppAlert[];
  userAlerts: AppAlert[];
  statusOverrides: Record<string, AlertStatus>;
  dismissedIds: Set<string>;
  setLocalAlerts: (alerts: AppAlert[]) => void;
  setDeviceAlerts: (alerts: AppAlert[]) => void;
  setUserAlerts: (alerts: AppAlert[]) => void;
  setStatusOverride: (id: string, status: AlertStatus) => void;
  setAllStatusOverrides: (overrides: Record<string, AlertStatus>) => void;
  dismissId: (id: string) => void;
}

export const useAlertStore = create<AlertStoreState>((set) => ({
  localAlerts: [],
  deviceAlerts: [],
  userAlerts: [],
  statusOverrides: {},
  dismissedIds: new Set<string>(),
  setLocalAlerts: (alerts) => set({ localAlerts: alerts }),
  setDeviceAlerts: (alerts) => set({ deviceAlerts: alerts }),
  setUserAlerts: (alerts) => set({ userAlerts: alerts }),
  setStatusOverride: (id, status) =>
    set((state) => ({ statusOverrides: { ...state.statusOverrides, [id]: status } })),
  setAllStatusOverrides: (overrides) =>
    set((state) => ({ statusOverrides: { ...state.statusOverrides, ...overrides } })),
  dismissId: (id) =>
    set((state) => ({ dismissedIds: new Set(state.dismissedIds).add(id) })),
}));

// ── Singleton Evaluator & Realtime Listener Manager ──────────────────────
let activeDevAlertsUnsub: (() => void) | null = null;
let activeUserAlertsUnsub: (() => void) | null = null;
let evalIntervalTimer: ReturnType<typeof setInterval> | null = null;
let currentSubscribedDeviceId: string | null = null;
let currentSubscribedUid: string | null = null;

export interface UserAlertPrefs {
  units?: 'C' | 'F';
  quietHours?: {
    enabled?: boolean;
    start?: string | number;
    end?: string | number;
  };
  alerts?: {
    bottle?: boolean;
    dry?: boolean;
    wet?: boolean;
    heat?: boolean;
    offline?: boolean;
    watered?: boolean;
    [key: string]: boolean | undefined;
  };
}

let currentUserPrefs: UserAlertPrefs | null = null;
let userPrefsUnsub: (() => void) | null = null;

function parseTimeToMinutes(val: unknown): number | null {
  if (typeof val === 'number') {
    if (isNaN(val) || val < 0 || val > 23) return null;
    return val * 60;
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (!trimmed) return null;
    if (trimmed.includes(':')) {
      const parts = trimmed.split(':').map((p) => Number(p.trim()));
      if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
        return parts[0] * 60 + parts[1];
      }
    } else {
      const num = Number(trimmed);
      if (!isNaN(num) && num >= 0 && num <= 23) {
        return num * 60;
      }
    }
  }
  return null;
}

export function isQuietHours(
  quietHours?: { enabled?: boolean; start?: string | number; end?: string | number },
  now: Date = new Date()
): boolean {
  if (!quietHours) return false;
  if (quietHours.enabled === false) return false;
  if (quietHours.start === undefined || quietHours.start === null ||
      quietHours.end === undefined || quietHours.end === null) {
    return false;
  }

  const startMinutes = parseTimeToMinutes(quietHours.start);
  const endMinutes = parseTimeToMinutes(quietHours.end);

  if (startMinutes === null || endMinutes === null) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight interval e.g. 22:00 to 07:00
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

export function clearAlertSession() {
  activeDevAlertsUnsub?.();
  activeDevAlertsUnsub = null;
  currentSubscribedDeviceId = null;
  activeUserAlertsUnsub?.();
  activeUserAlertsUnsub = null;
  userPrefsUnsub?.();
  userPrefsUnsub = null;
  currentSubscribedUid = null;
  currentUserPrefs = null;
  notifiedAlerts.clear();
  useAlertStore.getState().setUserAlerts([]);
  useAlertStore.getState().setLocalAlerts([]);
  useAlertStore.getState().setDeviceAlerts([]);
  useAlertStore.getState().setAllStatusOverrides({});
}

const prevPumpState: Record<string, { pumpOn: boolean; moisture: number }> = {};
const createdTodayAlertKeys = new Set<string>();
const notifiedAlerts = new Set<string>();

function runEvaluation() {
  const state = useLiveDevice.getState();
  const devices = state.devices;
  const user = useSession.getState().user;
  const now = Date.now();
  const startOfTodayMs = new Date().setHours(0, 0, 0, 0);
  const weather = state.weather;

  const currentLocalAlerts = useAlertStore.getState().localAlerts;
  const alertMap = new Map<string, AppAlert>();
  for (const a of currentLocalAlerts) {
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

    const evaluateRule = (
      alertId: string,
      ruleType: string,
      isViolated: boolean,
      factory: () => AppAlert
    ) => {
      const todayKey = `${deviceId}:${ruleType}:${new Date().toDateString()}`;
      const existing =
        alertMap.get(alertId) ||
        useAlertStore.getState().deviceAlerts.find(
          (a) =>
            (a.id === alertId || (a.deviceId === deviceId && a.type === ruleType)) &&
            (a.timestamp ?? a.createdAt ?? a.ts ?? 0) >= startOfTodayMs
        ) ||
        useAlertStore.getState().userAlerts.find(
          (a) =>
            (a.id === alertId || (a.deviceId === deviceId && a.type === ruleType)) &&
            (a.timestamp ?? a.createdAt ?? a.ts ?? 0) >= startOfTodayMs
        );

      const alreadyDispatchedToday =
        createdTodayAlertKeys.has(todayKey) ||
        createdTodayAlertKeys.has(alertId);

      if (isViolated) {
        if (existing) {
          newLocalAlerts.push(existing);
          alertMap.delete(alertId);
        } else if (alreadyDispatchedToday) {
          return;
        } else {
          const alert = factory();
          newLocalAlerts.push(alert);
          newlyCreatedAlerts.push(alert);
          createdTodayAlertKeys.add(todayKey);
          createdTodayAlertKeys.add(alertId);
        }
      } else if (existing) {
        if (existing.status === 'active' || existing.status === 'unread') {
          const resolvedAlert: AppAlert = {
            ...existing,
            status: 'resolved',
          };
          newLocalAlerts.push(resolvedAlert);
          alertMap.delete(alertId);
          updateDeviceAlertInRTDB(deviceId, alertId, { status: 'resolved' });
        } else {
          newLocalAlerts.push(existing);
          alertMap.delete(alertId);
        }
        notifiedAlerts.delete(alertId);
      }
    };

    // 1. Device Offline Check
    const isOffline = !status.online || now - status.lastSeen > THREE_MINUTES_MS;
    evaluateRule(`offline-${deviceId}`, 'offline', isOffline, () => {
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

    evaluateRule(`bottle-empty-${deviceId}`, 'bottle', isBottleEmpty, () => {
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

    evaluateRule(`bottle-low-${deviceId}`, 'bottle', isBottleLow, () => {
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
    const prevPump = prevPumpState[deviceId];
    let pumpFailedCondition = false;
    if (prevPump && prevPump.pumpOn && !telemetry.pumpOn) {
      if (telemetry.soilMoisture <= prevPump.moisture) {
        pumpFailedCondition = true;
      }
    }
    prevPumpState[deviceId] = {
      pumpOn: telemetry.pumpOn,
      moisture: telemetry.soilMoisture,
    };

    if (pumpFailedCondition) {
      const failedId = `pump-failed-${deviceId}`;
      const failedKey = `${deviceId}:pump-failed:${new Date().toDateString()}`;
      const existingFailed =
        alertMap.get(failedId) ||
        useAlertStore.getState().deviceAlerts.find(
          (a) => a.id === failedId && (a.timestamp ?? a.createdAt ?? a.ts ?? 0) >= startOfTodayMs
        ) ||
        useAlertStore.getState().userAlerts.find(
          (a) => a.id === failedId && (a.timestamp ?? a.createdAt ?? a.ts ?? 0) >= startOfTodayMs
        );

      const alreadyDispatchedFailed =
        createdTodayAlertKeys.has(failedKey) ||
        createdTodayAlertKeys.has(failedId);

      if (!existingFailed && !alreadyDispatchedFailed) {
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
        createdTodayAlertKeys.add(failedKey);
        createdTodayAlertKeys.add(failedId);
        alertMap.delete(failedId);
      } else if (existingFailed) {
        newLocalAlerts.push(existingFailed);
        alertMap.delete(failedId);
      }
    }

    // 3. Soil Dry - Needs Water
    const isSoilDry = telemetry.soilMoisture < thresholds.moistureMin;
    evaluateRule(`dry-${deviceId}`, 'dry', isSoilDry, () => {
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
    evaluateRule(`wet-max-${deviceId}`, 'wet', isOverWatered, () => {
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
    evaluateRule(`wet-humid-${deviceId}`, 'wet', isHighHumidityWetSoil, () => {
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
      evaluateRule(`heat-${deviceId}`, 'heat', isExtremeHeat, () => {
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
      evaluateRule(`cold-${deviceId}`, 'heat', isExtremeCold, () => {
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
      evaluateRule(`heat-${deviceId}`, 'heat', isIndoorHeat, () => {
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

    evaluateRule(`terrace-rain-delay-${deviceId}`, 'info', isRainDelay, () => {
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

  for (const remaining of alertMap.values()) {
    newLocalAlerts.push(remaining);
  }

  useAlertStore.getState().setLocalAlerts(newLocalAlerts);

  for (const na of newlyCreatedAlerts) {
    saveDeviceAlertToRTDB(na.deviceId, na);
    if (user) {
      writeAlertToRTDB(user.uid, na);
    }

    if (!notifiedAlerts.has(na.id)) {
      notifiedAlerts.add(na.id);
      if (na.severity === 'critical' || na.severity === 'warning') {
        const typeKey = na.type?.toLowerCase() || '';
        const isEnabled = currentUserPrefs?.alerts
          ? (currentUserPrefs.alerts as any)[typeKey] !== false
          : true;
        const inQuietHours = isQuietHours(currentUserPrefs?.quietHours);

        if (isEnabled && !inQuietHours) {
          sendLocalNotification(na.title, na.body, {
            deviceId: na.deviceId,
            type: na.type,
            severity: na.severity,
          });
        }
      }
    }
  }
}

function syncAlertSession(uid: string | null, activeDeviceId: string | null) {
  if (currentSubscribedDeviceId !== activeDeviceId) {
    activeDevAlertsUnsub?.();
    activeDevAlertsUnsub = null;
    currentSubscribedDeviceId = activeDeviceId;

    if (activeDeviceId) {
      const unsub = listenToDeviceAlerts(activeDeviceId, (devAlerts: DeviceAlertRecord[]) => {
        const liveDev = useLiveDevice.getState().devices[activeDeviceId];
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
            plantName: liveDev?.config?.plantName || 'Plant',
            deviceId: activeDeviceId,
            createdAt: tsVal,
            ts: tsVal,
            timestamp: tsVal,
            status: statusVal,
            actionLabel: da.actionLabel || (isLowWater ? 'I Refilled' : undefined),
          };
        });
        useAlertStore.getState().setDeviceAlerts(mapped);
      });
      activeDevAlertsUnsub = () => unsub();
    } else {
      useAlertStore.getState().setDeviceAlerts([]);
    }
  }

  if (currentSubscribedUid !== uid) {
    activeUserAlertsUnsub?.();
    activeUserAlertsUnsub = null;
    userPrefsUnsub?.();
    userPrefsUnsub = null;
    currentUserPrefs = null;
    currentSubscribedUid = uid;

    if (uid) {
      // Listen to user preferences (quiet hours and alert toggles)
      const prefsRef = ref(db, `users/${uid}/prefs`);
      userPrefsUnsub = onValue(prefsRef, (snap) => {
        if (snap.exists()) {
          currentUserPrefs = snap.val() as UserAlertPrefs;
        } else {
          currentUserPrefs = null;
        }
      });

      const unsub = listenToUserAlerts(uid, (cloudAlerts: CloudAlertRecord[]) => {
        const currentDevs = useLiveDevice.getState().devices;
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
            plantName: currentDevs[ca.deviceId]?.config?.plantName || 'Plant',
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
        useAlertStore.getState().setUserAlerts(mapped);
      });
      activeUserAlertsUnsub = () => unsub();
    } else {
      clearAlertSession();
    }
  }

  if (!evalIntervalTimer) {
    evalIntervalTimer = setInterval(runEvaluation, 5000);
    runEvaluation();
  }
}

// ── Main useAlertEngine Hook ─────────────────────────────────────────────
export function useAlertEngine() {
  const user = useSession((s) => s.user);
  const activeDeviceId = useLiveDevice((s) => s.activeDeviceId);

  const localAlerts = useAlertStore((s) => s.localAlerts);
  const deviceAlerts = useAlertStore((s) => s.deviceAlerts);
  const userAlerts = useAlertStore((s) => s.userAlerts);
  const statusOverrides = useAlertStore((s) => s.statusOverrides);
  const dismissedIds = useAlertStore((s) => s.dismissedIds);

  const setStatusOverride = useAlertStore((s) => s.setStatusOverride);
  const setAllStatusOverrides = useAlertStore((s) => s.setAllStatusOverrides);
  const dismissId = useAlertStore((s) => s.dismissId);

  const [currentTime, setCurrentTime] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(Date.now()), 60000);
    return () => clearInterval(timer);
  }, []);

  // Ensure singleton session manager is synchronized
  useEffect(() => {
    syncAlertSession(user?.uid ?? null, activeDeviceId || null);
  }, [user?.uid, activeDeviceId]);

  const isCloudSynced = Boolean(user);

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

    const startOfTodayMs = new Date().setHours(0, 0, 0, 0);

    return Array.from(map.values())
      .filter((alert) => {
        const ts = alert.timestamp ?? alert.createdAt ?? alert.ts ?? 0;
        // Strictly filter to today only
        if (ts < startOfTodayMs) return false;

        const isResolved = alert.status === 'resolved' || alert.status === 'read';
        if (!isResolved) return true;
        return Boolean(alert.createdAt && currentTime - alert.createdAt <= SEVEN_DAYS_MS);
      })
      .sort(
        (a, b) =>
          (b.timestamp ?? b.createdAt ?? b.ts ?? 0) - (a.timestamp ?? a.createdAt ?? a.ts ?? 0)
      );
  }, [localAlerts, deviceAlerts, userAlerts, statusOverrides, dismissedIds, user, currentTime]);

  const markRead = useCallback(
    (id: string) => {
      setStatusOverride(id, 'read');
      const alert = retainedAlerts.find((a) => a.id === id);
      if (alert?.deviceId) {
        updateDeviceAlertInRTDB(alert.deviceId, id, { status: 'resolved' });
      }
      if (user && isCloudSynced) {
        markAlertReadInRTDB(user.uid, id);
      }
    },
    [retainedAlerts, user, isCloudSynced, setStatusOverride]
  );

  const markAllRead = useCallback(() => {
    const nextOverrides: Record<string, AlertStatus> = {};
    retainedAlerts.forEach((a) => {
      nextOverrides[a.id] = 'read';
      if (a.deviceId) {
        updateDeviceAlertInRTDB(a.deviceId, a.id, { status: 'resolved' });
      }
      if (user && isCloudSynced && (a.status === 'unread' || a.status === 'active')) {
        markAlertReadInRTDB(user.uid, a.id);
      }
    });
    setAllStatusOverrides(nextOverrides);
  }, [retainedAlerts, user, isCloudSynced, setAllStatusOverrides]);

  const snooze = useCallback(
    (id: string) => {
      setStatusOverride(id, 'snoozed');
    },
    [setStatusOverride]
  );

  const dismiss = useCallback(
    (id: string) => {
      dismissId(id);
      const alert = retainedAlerts.find((a) => a.id === id);
      if (alert?.deviceId) {
        deleteDeviceAlertFromRTDB(alert.deviceId, id);
      }
      if (user && isCloudSynced) {
        deleteAlertFromRTDB(user.uid, id);
      }
    },
    [retainedAlerts, user, isCloudSynced, dismissId]
  );

  const handleAction = useCallback(
    async (alert: AppAlert) => {
      if (alert.type === 'bottle' || alert.type === 'LOW_WATER') {
        const confirmed = await useLiveDevice.getState().refillBottle(alert.deviceId);
        if (confirmed) {
          markRead(alert.id);
        }
      } else if (alert.type === 'dry') {
        const confirmed = await executeWaterForDevice(alert.deviceId, 5);
        if (confirmed) {
          markRead(alert.id);
        }
      } else {
        markRead(alert.id);
      }
    },
    [markRead]
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
    evaluateNow: runEvaluation,
  };
}
