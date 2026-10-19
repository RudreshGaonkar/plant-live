import { Platform } from 'react-native';
import * as Device from 'expo-device';
import { ref, onValue, set, remove, push, off } from 'firebase/database';
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
  deviceId: string;
  type: 'bottle' | 'dry' | 'wet' | 'heat' | 'offline' | 'watered';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  message: string;
  read: boolean;
}

/**
 * Requests notification permissions and retrieves the Expo Push Token.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Notifications || Platform.OS === 'web' || !Device.isDevice) {
    return null;
  }

  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      return null;
    }

    // Android notification channel setup
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Default Plant Alerts',
        importance: Notifications.AndroidImportance.MAX,
        vibrationPattern: [0, 250, 250, 250],
        lightColor: '#5A8A5C',
      });
    }

    const tokenData = await Notifications.getExpoPushTokenAsync();
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

/**
 * Attaches a realtime listener to `alerts/{uid}`.
 */
export function listenToUserAlerts(
  uid: string,
  onAlerts: (alerts: CloudAlertRecord[]) => void
) {
  const alertsRef = ref(db, `alerts/${uid}`);
  const unsubscribe = onValue(alertsRef, (snapshot) => {
    if (snapshot.exists()) {
      const data = snapshot.val();
      const list: CloudAlertRecord[] = Object.keys(data).map((key) => ({
        id: key,
        ...data[key],
      }));
      // Sort newest first
      list.sort((a, b) => b.ts - a.ts);
      onAlerts(list);
    } else {
      onAlerts([]);
    }
  });

  return () => off(alertsRef, 'value', unsubscribe);
}

/**
 * Marks an alert as read in RTDB.
 */
export async function markAlertReadInRTDB(uid: string, alertId: string) {
  try {
    const alertRef = ref(db, `alerts/${uid}/${alertId}/read`);
    await set(alertRef, true);
  } catch (err) {
    console.warn('Failed to mark alert as read:', err);
  }
}

/**
 * Deletes an alert from RTDB.
 */
export async function deleteAlertFromRTDB(uid: string, alertId: string) {
  try {
    const alertRef = ref(db, `alerts/${uid}/${alertId}`);
    await remove(alertRef);
  } catch (err) {
    console.warn('Failed to delete alert:', err);
  }
}

/**
 * Appends a new alert to RTDB `alerts/{uid}`.
 */
export async function writeAlertToRTDB(
  uid: string,
  alert: Omit<CloudAlertRecord, 'id'>
): Promise<string | null> {
  try {
    const alertsRef = ref(db, `alerts/${uid}`);
    const newRef = push(alertsRef);
    await set(newRef, {
      ...alert,
      id: newRef.key,
    });
    return newRef.key;
  } catch (err) {
    console.warn('Failed to write alert to RTDB:', err);
    return null;
  }
}
