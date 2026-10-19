import * as admin from 'firebase-admin';
import { Expo, ExpoPushMessage } from 'expo-server-sdk';

// Initialize Firebase Admin SDK if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

export const adminDb = admin.database();
export const expo = new Expo();

export type AlertSeverity = 'critical' | 'warning' | 'info';
export type AlertType = 'bottle' | 'dry' | 'wet' | 'heat' | 'offline' | 'watered';

export interface AlertData {
  deviceId: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
}

export interface UserPrefs {
  units?: 'C' | 'F';
  quietHours?: {
    enabled?: boolean;
    start?: string; // "22:00"
    end?: string;   // "07:00"
  };
  alerts?: {
    bottle?: boolean;
    dry?: boolean;
    wet?: boolean;
    heat?: boolean;
    offline?: boolean;
    watered?: boolean;
  };
}

const ONE_HOUR_MS = 60 * 60 * 1000;

/**
 * Checks if the current time falls inside quiet hours.
 */
export function isQuietHours(
  quietHours?: UserPrefs['quietHours'],
  now: Date = new Date()
): boolean {
  if (!quietHours) return false;
  if (quietHours.enabled === false) return false;
  if (!quietHours.start || !quietHours.end) return false;

  const [startHour, startMin] = quietHours.start.split(':').map(Number);
  const [endHour, endMin] = quietHours.end.split(':').map(Number);
  if (isNaN(startHour) || isNaN(startMin) || isNaN(endHour) || isNaN(endMin)) {
    return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;

  if (startMinutes <= endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  } else {
    // Overnight interval e.g. 22:00 to 07:00
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }
}

/**
 * Dispatches an alert:
 * 1. Evaluates 1-hour de-duplication window.
 * 2. Writes the alert entry to `alerts/{uid}/{pushId}`.
 * 3. Checks user prefs and quiet hours.
 * 4. Sends push notification via Expo Push API to `users/{uid}/pushTokens`.
 */
export async function dispatchAlert(
  uid: string,
  alert: AlertData,
  bypassDeduplication: boolean = false
): Promise<{ dispatched: boolean; pushSent: boolean; reason?: string }> {
  const { deviceId, type, severity, title, message } = alert;
  const now = Date.now();

  // 1. De-duplication check
  const stateRef = adminDb.ref(`_alertState/${deviceId}/${type}`);
  if (!bypassDeduplication) {
    const stateSnap = await stateRef.once('value');
    const lastTriggered = stateSnap.child('lastTriggered').val();
    if (lastTriggered && typeof lastTriggered === 'number') {
      if (now - lastTriggered < ONE_HOUR_MS) {
        return {
          dispatched: false,
          pushSent: false,
          reason: `Deduplicated: alert '${type}' for device '${deviceId}' was fired ${Math.round((now - lastTriggered) / 60000)} min ago.`,
        };
      }
    }
  }

  // Update de-duplication timestamp
  await stateRef.update({
    lastTriggered: now,
    lastSeverity: severity,
    lastMessage: message,
  });

  // 2. Write alert record to RTDB
  const alertRef = adminDb.ref(`alerts/${uid}`).push();
  await alertRef.set({
    id: alertRef.key,
    ts: now,
    deviceId,
    type,
    severity,
    title,
    message,
    read: false,
  });

  // 3. Read user preferences
  const prefsSnap = await adminDb.ref(`users/${uid}/prefs`).once('value');
  const prefs: UserPrefs = (prefsSnap.val() as UserPrefs) || {};

  // Check alert toggle preference (defaults to true if undefined)
  const isEnabled = prefs.alerts?.[type] !== false;
  if (!isEnabled) {
    return {
      dispatched: true,
      pushSent: false,
      reason: `User preference disabled for alert type '${type}'.`,
    };
  }

  // Check quiet hours
  if (isQuietHours(prefs.quietHours)) {
    return {
      dispatched: true,
      pushSent: false,
      reason: `Quiet hours active: push notification suppressed.`,
    };
  }

  // 4. Fetch registered push tokens
  const tokensSnap = await adminDb.ref(`users/${uid}/pushTokens`).once('value');
  if (!tokensSnap.exists()) {
    return {
      dispatched: true,
      pushSent: false,
      reason: 'No push tokens registered for user.',
    };
  }

  const rawTokens = tokensSnap.val();
  const validTokens: string[] = [];

  if (typeof rawTokens === 'object' && rawTokens !== null) {
    for (const key of Object.keys(rawTokens)) {
      const token = rawTokens[key] === true ? key : rawTokens[key];
      if (typeof token === 'string' && Expo.isExpoPushToken(token)) {
        validTokens.push(token);
      }
    }
  }

  if (validTokens.length === 0) {
    return {
      dispatched: true,
      pushSent: false,
      reason: 'No valid Expo push tokens found.',
    };
  }

  // 5. Send push notification via Expo Push API
  const messages: ExpoPushMessage[] = validTokens.map((to) => ({
    to,
    sound: 'default',
    title,
    body: message,
    data: {
      alertId: alertRef.key,
      deviceId,
      type,
      severity,
      ts: now,
    },
    priority: severity === 'critical' ? 'high' : 'default',
  }));

  try {
    const chunks = expo.chunkPushNotifications(messages);
    for (const chunk of chunks) {
      await expo.sendPushNotificationsAsync(chunk);
    }
    return { dispatched: true, pushSent: true };
  } catch (error) {
    console.error('Error dispatching Expo push notifications:', error);
    return {
      dispatched: true,
      pushSent: false,
      reason: (error as Error).message,
    };
  }
}
