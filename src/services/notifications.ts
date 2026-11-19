import { normalizeAlert } from '@/utils/alerts';
import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { onValue, push, ref, remove, set } from 'firebase/database';
import { Platform } from 'react-native';
import { db } from './firebase';

type ExpoNotificationsType = typeof import('expo-notifications');

let Notifications: ExpoNotificationsType | null = null;
try {
  // Safely attempt to load expo-notifications (fails in Expo Go on Android for SDK 53+)
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  Notifications = require('expo-notifications');
  if (Notifications?.setNotificationHandler) {
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
      }),
    });
  }
} catch {
  // Remote and topic push modules are unavailable in standard Expo Go; in-app inbox and local fallback remain active
}

export interface CloudAlertRecord {
  id: string;
  ts: number;
  createdAt?: number;
  timestamp?: number;
  deviceId: string;
  type: string;
  severity: 'critical' | 'warning' | 'info';
  title?: string;
  message?: string;
  description?: string;
  body?: string;
  status?: string;
  read?: boolean;
}

/**
 * Requests notification permissions and retrieves the Expo Push Token.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Notifications || Platform.OS === 'web' || !Device.isDevice) {
    return null;
  }

  try {
    // Ensure the Android notification channel is created before permission requests
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default Plant Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5A8A5C',
      });
    }

    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ??
      (Constants as any).easConfig?.projectId;

    const tokenData = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined
    );
    return tokenData.data;
  } catch (err) {
    console.warn('Failed to retrieve Expo push token:', err);
    return null;
  }
}

/**
 * Saves a registered Expo Push Token to the user's profile in RTDB.
 */
export async function savePushTokenToRTDB(uid: string, token: string) {
  try {
    const sanitizedKey = token.replace(/[.#$[\]]/g, '_');
    const tokenRef = ref(db, `users/${uid}/pushTokens/${sanitizedKey}`);
    await set(tokenRef, token);
  } catch (err) {
    console.warn('Error saving push token to RTDB:', err);
  }
}

/**
 * Triggers a local notification (ideal for Demo Mode and client fallback).
 */
export async function sendLocalNotification(
  title: string,
  body: string,
  data?: Record<string, any>
) {
  if (!Notifications || Platform.OS === 'web') return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: {
        title,
        body,
        data,
        sound: true,
      },
      trigger: null, // immediate
    });
  } catch (err) {
    console.warn('Failed to display local notification:', err);
  }
}

export const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Routine to delete alert documents older than 7 days from Firebase RTDB upon fetching.
 * Critical: Do NOT auto-delete active, unresolved alerts regardless of age unless manually resolved by the user.
 */
export async function cleanupOldUserAlertsFromRTDB(uid: string) {
  try {
    const alertsRef = ref(db, `alerts/${uid}`);
    const cutoff = Date.now() - SEVEN_DAYS_MS;
    onValue(
      alertsRef,
      async (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.val();
          for (const key of Object.keys(data)) {
            const item = data[key];
            const isResolved =
              item.read || item.status === 'resolved' || item.status === 'RESOLVED' || item.status === 'read';
            // Only auto-delete resolved alerts older than 7 days; never auto-delete active alerts
            if (!isResolved) continue;
            const itemTs = item.createdAt || item.timestamp || item.ts;
            if (typeof itemTs === 'number' && itemTs < cutoff) {
              await remove(ref(db, `alerts/${uid}/${key}`));
            }
          }
        }
      },
      { onlyOnce: true }
    );
  } catch (err) {
    console.warn('Failed to cleanup old user alerts from RTDB:', err);
  }
}

/**
 * Attaches a realtime listener to `users/{uid}/alerts` (and legacy `alerts/{uid}`)
 * with client-side timestamp ordering and retention filtering.
 * Active unresolved alerts are preserved regardless of age.
 */
export function listenToUserAlerts(
  uid: string,
  onAlerts: (alerts: CloudAlertRecord[]) => void
) {
  // Read all candidates: RTDB key order cannot rank mixed timestamp formats.
  const userAlertsRef = ref(db, `users/${uid}/alerts`);
  const alertsQuery = userAlertsRef;
  // Viewing the inbox never deletes underlying records.

  const unsubscribe = onValue(alertsQuery, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const list: CloudAlertRecord[] = Object.keys(data)
        .map((key) => {
          const item = data[key];
          return normalizeAlert({ ...item, id: key } as CloudAlertRecord);
        })
        // Enforce 7-day retention filter: guard against undefined timestamps and do NOT auto-delete active unresolved alerts
        .filter((item) => {
          const isResolved = item.read || item.status === 'resolved' || item.status === 'read';
          if (!isResolved) return true;
          return Boolean(item.createdAt && (Date.now() - item.createdAt <= SEVEN_DAYS_MS));
        });

      // Sort newest first
      list.sort((a, b) => (b.createdAt || b.ts || b.timestamp || 0) - (a.createdAt || a.ts || a.timestamp || 0));
      onAlerts(list);
    } else {
      // Legacy path fallback: /alerts/{uid}
      const legacyRef = ref(db, `alerts/${uid}`);
      onValue(legacyRef, (legacySnap) => {
        if (legacySnap.exists()) {
          const data = legacySnap.val();
          const list: CloudAlertRecord[] = Object.keys(data)
            .map((key) => {
              const item = data[key];
              return normalizeAlert({ ...item, id: key } as CloudAlertRecord);
            })
            .filter((item) => {
              const isResolved = item.read || item.status === 'resolved' || item.status === 'read';
              if (!isResolved) return true;
              return Boolean(item.createdAt && (Date.now() - item.createdAt <= SEVEN_DAYS_MS));
            });
          list.sort((a, b) => (b.createdAt || b.ts || b.timestamp || 0) - (a.createdAt || a.ts || a.timestamp || 0));
          onAlerts(list);
        } else {
          onAlerts([]);
        }
      }, { onlyOnce: true });
    }
  });

  return () => unsubscribe();
}

/**
 * Marks an alert as read in RTDB.
 */
export async function markAlertReadInRTDB(uid: string, alertId: string) {
  try {
    const alertRef = ref(db, `users/${uid}/alerts/${alertId}/read`);
    await set(alertRef, true);
    try {
      await set(ref(db, `alerts/${uid}/${alertId}/read`), true);
    } catch { }
  } catch (err) {
    console.warn('Failed to mark alert as read:', err);
  }
}

/**
 * Deletes an alert from RTDB.
 */
export async function deleteAlertFromRTDB(uid: string, alertId: string) {
  try {
    const alertRef = ref(db, `users/${uid}/alerts/${alertId}`);
    await remove(alertRef);
    try {
      await remove(ref(db, `alerts/${uid}/${alertId}`));
    } catch { }
  } catch (err) {
    console.warn('Failed to delete alert:', err);
  }
}

/**
 * Appends a new alert to RTDB `users/{uid}/alerts` (and mirrors to `alerts/{uid}`).
 */
export async function writeAlertToRTDB(
  uid: string,
  alert: Omit<CloudAlertRecord, 'id'>
): Promise<string | null> {
  try {
    const alertsRef = ref(db, `users/${uid}/alerts`);
    const newRef = push(alertsRef);
    const now = Date.now();
    const createdAt = alert.createdAt || alert.ts || alert.timestamp || now;
    const payload = {
      ...alert,
      createdAt,
      ts: createdAt,
      timestamp: createdAt,
      id: newRef.key,
    };
    await set(newRef, payload);
    try {
      if (newRef.key) {
        await set(ref(db, `alerts/${uid}/${newRef.key}`), payload);
      }
    } catch { }
    return newRef.key;
  } catch (err) {
    console.warn('Failed to write alert to RTDB:', err);
    return null;
  }
}
