import { onSchedule } from 'firebase-functions/v2/scheduler';
import { adminDb, dispatchAlert } from './notifications';

const THREE_MINUTES_MS = 3 * 60 * 1000;

/**
 * Scheduled Offline Sweep runs every 1 minute.
 * Scans all devices. If `now - lastSeen > 3 minutes`, sets `status.online = false`
 * and dispatches a Critical Offline Alert to the owner (with 1-hour deduplication).
 */
export const offlineSweep = onSchedule(
  {
    schedule: 'every 1 minutes',
    timeZone: 'UTC',
    region: 'us-central1',
  },
  async () => {
    const now = Date.now();
    console.log(`[offlineSweep] Starting sweep at ${new Date(now).toISOString()}`);

    const [devicesSnap, ownersSnap] = await Promise.all([
      adminDb.ref('devices').once('value'),
      adminDb.ref('owners').once('value'),
    ]);

    if (!devicesSnap.exists()) {
      console.log('[offlineSweep] No devices found in database.');
      return;
    }

    const devices = devicesSnap.val() || {};
    const owners = ownersSnap.val() || {};

    const updates: Record<string, any> = {};
    const alertPromises: Promise<any>[] = [];

    for (const deviceId of Object.keys(devices)) {
      const device = devices[deviceId];
      const status = device.status || {};
      const lastSeen = status.lastSeen;
      const isOnline = status.online !== false;

      if (typeof lastSeen === 'number') {
        const diff = now - lastSeen;
        if (diff > THREE_MINUTES_MS) {
          // Device timed out
          if (isOnline) {
            updates[`devices/${deviceId}/status/online`] = false;
          }

          const uid = owners[deviceId];
          if (uid) {
            const plantName =
              device.config?.plantName || device.config?.name || deviceId;
            const minutesSince = Math.round(diff / 60000);

            alertPromises.push(
              dispatchAlert(uid, {
                deviceId,
                type: 'offline',
                severity: 'critical',
                title: 'Device Offline',
                message: `${plantName} has been offline for ${minutesSince} minutes. Please verify power and Wi-Fi connection.`,
              })
            );
          }
        }
      }
    }

    // Apply batch updates if any status changed
    if (Object.keys(updates).length > 0) {
      await adminDb.ref().update(updates);
    }

    if (alertPromises.length > 0) {
      const results = await Promise.allSettled(alertPromises);
      console.log(`[offlineSweep] Dispatched ${results.length} offline alert evaluations.`);
    }

    console.log('[offlineSweep] Sweep completed successfully.');
  }
);
