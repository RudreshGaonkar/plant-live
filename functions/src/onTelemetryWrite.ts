import { onValueWritten } from 'firebase-functions/v2/database';
import { adminDb, dispatchAlert } from './notifications';

interface DeviceThresholds {
  moistureMin: number;
  moistureMax: number;
  tempMax: number;
  humidityMax: number;
  pumpDurationSec: number;
}

interface DeviceConfig {
  name?: string;
  plantName?: string;
  location?: 'balcony' | 'terrace' | 'indoor';
  thresholds?: Partial<DeviceThresholds>;
  bottle?: {
    capacityMl?: number;
    remainingMl?: number;
    flowMlPerSec?: number;
  };
}

interface DeviceTelemetry {
  soilRaw: number;
  soilMoisture: number; // 0 - 100%
  temperature: number;
  humidity: number;
  light?: number | null;
  pumpOn: boolean;
  rssi?: number;
  ts: number;
}

const THIRTY_MINUTES_MS = 30 * 60 * 1000;

export const onTelemetryWrite = onValueWritten(
  {
    ref: '/devices/{deviceId}/telemetry',
    region: 'us-central1',
  },
  async (event) => {
    const deviceId = event.params.deviceId;
    const telemetry = event.data.after.val() as DeviceTelemetry | null;
    const prevTelemetry = event.data.before.val() as DeviceTelemetry | null;

    if (!telemetry || typeof telemetry !== 'object') {
      return;
    }

    // 1. Resolve Device Owner
    let uid: string | null = null;
    const ownerSnap = await adminDb.ref(`owners/${deviceId}`).once('value');
    if (ownerSnap.exists()) {
      uid = ownerSnap.val() as string;
    } else {
      // Fallback: check index under users/{uid}/devices/{deviceId}
      const usersSnap = await adminDb
        .ref('users')
        .orderByChild(`devices/${deviceId}`)
        .equalTo(true)
        .limitToFirst(1)
        .once('value');

      if (usersSnap.exists()) {
        const uids = Object.keys(usersSnap.val());
        if (uids.length > 0) {
          uid = uids[0];
        }
      }
    }

    if (!uid) {
      console.log(`[onTelemetryWrite] No owner mapped for device ${deviceId}, skipping alert processing.`);
      return;
    }

    // 2. Fetch Device Config
    const configSnap = await adminDb.ref(`devices/${deviceId}/config`).once('value');
    const config: DeviceConfig = (configSnap.val() as DeviceConfig) || {};
    const plantName = config.plantName || config.name || 'Your plant';
    const location = config.location || 'indoor';

    // Default thresholds based on location if not customized
    const defaultMoistureMin = location === 'terrace' ? 25 : location === 'balcony' ? 30 : 35;
    const defaultMoistureMax = location === 'terrace' ? 55 : location === 'balcony' ? 60 : 65;

    const thresholds: DeviceThresholds = {
      moistureMin: config.thresholds?.moistureMin ?? defaultMoistureMin,
      moistureMax: config.thresholds?.moistureMax ?? defaultMoistureMax,
      tempMax: config.thresholds?.tempMax ?? (location === 'terrace' ? 32 : 35),
      humidityMax: config.thresholds?.humidityMax ?? 80,
      pumpDurationSec: config.thresholds?.pumpDurationSec ?? 5,
    };

    const now = Date.now();
    const alertStateRef = adminDb.ref(`_alertState/${deviceId}`);

    // --- 3. Evaluate Alerts ---

    // A. Low Water / Reservoir Level
    const bottle = config.bottle || {};
    const capacityMl = bottle.capacityMl || 500;
    const remainingMl = typeof bottle.remainingMl === 'number' ? bottle.remainingMl : 500;
    const bottlePercent = (remainingMl / capacityMl) * 100;

    if (remainingMl <= 0 || bottlePercent < 5) {
      await dispatchAlert(uid, {
        deviceId,
        type: 'bottle',
        severity: 'critical',
        title: 'Water Reservoir Empty',
        message: `${plantName} water reservoir is empty (${Math.max(0, Math.round(remainingMl))} ml). Auto-watering is disabled.`,
      });
    } else if (bottlePercent < 20) {
      await dispatchAlert(uid, {
        deviceId,
        type: 'bottle',
        severity: 'warning',
        title: 'Water Reservoir Low',
        message: `${plantName} water reservoir is below 20% (${Math.round(remainingMl)} ml left). Please refill soon.`,
      });
    }

    // A2. Pump ran without soil moisture rising (possible empty bottle or clogged tube)
    if (prevTelemetry?.pumpOn === true && telemetry.pumpOn === false) {
      // Pump just turned off
      if (telemetry.soilMoisture <= prevTelemetry.soilMoisture) {
        await dispatchAlert(uid, {
          deviceId,
          type: 'bottle',
          severity: 'warning',
          title: 'Pump Run Failed to Moisten Soil',
          message: `${plantName}: Pump operated but soil moisture did not increase (${telemetry.soilMoisture}%). Check water bottle or tube blockage.`,
        });
      }
    }

    // B. Soil Too Dry (> 30 min continuously)
    const drySinceSnap = await alertStateRef.child('drySince').once('value');
    const drySince = drySinceSnap.val() as number | null;

    if (telemetry.soilMoisture < thresholds.moistureMin) {
      if (!drySince) {
        // Mark the start of the dry period
        await alertStateRef.child('drySince').set(now);
      } else if (now - drySince >= THIRTY_MINUTES_MS) {
        await dispatchAlert(uid, {
          deviceId,
          type: 'dry',
          severity: 'warning',
          title: 'Soil Critically Dry',
          message: `${plantName} soil moisture (${telemetry.soilMoisture}%) has been below ${thresholds.moistureMin}% for over 30 minutes.`,
        });
      }
    } else {
      // Soil recovered, clear dry tracker
      if (drySince) {
        await alertStateRef.child('drySince').remove();
      }
    }

    // C. Over-Watering Risk
    if (telemetry.soilMoisture > thresholds.moistureMax) {
      await dispatchAlert(uid, {
        deviceId,
        type: 'wet',
        severity: 'warning',
        title: 'Over-Watering Detected',
        message: `${plantName} soil moisture is at ${telemetry.soilMoisture}%, exceeding maximum safe threshold (${thresholds.moistureMax}%).`,
      });
    } else if (
      telemetry.humidity > thresholds.humidityMax &&
      telemetry.soilMoisture >= thresholds.moistureMin
    ) {
      await dispatchAlert(uid, {
        deviceId,
        type: 'wet',
        severity: 'warning',
        title: 'High Humidity & Damp Soil Risk',
        message: `High air humidity (${telemetry.humidity}%) with wet soil (${telemetry.soilMoisture}%). Potential risk of root rot on ${plantName}.`,
      });
    }

    // D. Extreme Temperature
    const isOutdoor = location === 'balcony' || location === 'terrace';
    const locationLabel = location === 'balcony' ? 'Balcony' : location === 'terrace' ? 'Terrace' : 'Indoor';

    if (isOutdoor) {
      if (telemetry.temperature > thresholds.tempMax) {
        await dispatchAlert(uid, {
          deviceId,
          type: 'heat',
          severity: 'warning',
          title: `Extreme Heat (${locationLabel})`,
          message: `Temperature reached ${telemetry.temperature}°C on the ${locationLabel} (limit: ${thresholds.tempMax}°C). Protect ${plantName} from heat stress.`,
        });
      } else if (telemetry.temperature < 8) {
        await dispatchAlert(uid, {
          deviceId,
          type: 'heat',
          severity: 'warning',
          title: `Extreme Cold (${locationLabel})`,
          message: `Temperature fell to ${telemetry.temperature}°C on the ${locationLabel}. Move ${plantName} indoors to prevent chill damage.`,
        });
      }
    } else {
      // Indoor heat threshold
      if (telemetry.temperature > thresholds.tempMax) {
        await dispatchAlert(uid, {
          deviceId,
          type: 'heat',
          severity: 'warning',
          title: 'High Indoor Temperature',
          message: `Indoor temperature is ${telemetry.temperature}°C, exceeding comfortable threshold (${thresholds.tempMax}°C).`,
        });
      }
    }
  }
);
