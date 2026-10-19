/**
 * Seed Demo Data Script for LeafLink RTDB
 * 
 * Usage:
 *   npx ts-node scripts/seedDemoData.ts
 *   or
 *   node --loader ts-node/esm scripts/seedDemoData.ts
 *   or via package.json: npm run seed
 *
 * Populates:
 * - Test User: test-user-01
 * - Device Claim / Ownership: esp8266-demo-01 mapped to test-user-01
 * - Device Config: Balcony Monstera with calibrated thresholds
 * - Realtime Telemetry: Live moisture, temperature, humidity, pump state
 * - 24-Hour Telemetry History: 5-min intervals
 * - Water Logs: Historical auto and manual watering cycles
 * - User Alerts: Sample low water and humidity alerts
 */

import { initializeApp } from 'firebase/app';
import { getDatabase, ref, set } from 'firebase/database';
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables from .env
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'demo-key',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'plant-live.firebaseapp.com',
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || 'https://plant-live-default-rtdb.firebaseio.com',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'plant-live',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'plant-live.appspot.com',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '123456789',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:123456789:web:abcdef',
};

const app = initializeApp(firebaseConfig, 'seedApp');
const db = getDatabase(app);
const auth = getAuth(app);

async function seed() {
  console.log('🌱 [LeafLink] Starting Demo Data Seeding to RTDB...');
  console.log(`📡 Target Database URL: ${firebaseConfig.databaseURL}`);

  const email = process.env.SEED_USER_EMAIL || 'demo@leaflink.local';
  const password = process.env.SEED_USER_PASSWORD || 'leaflink123';
  const testDeviceId = 'esp8266-demo-01';
  const now = Date.now();

  let testUid = 'test-user-01';

  try {
    // Authenticate or register seed user so RTDB rules pass
    console.log(`🔐 Authenticating as ${email}...`);
    try {
      const userCred = await signInWithEmailAndPassword(auth, email, password);
      testUid = userCred.user.uid;
      console.log(`✓ Signed in existing user: ${testUid}`);
    } catch {
      try {
        const userCred = await createUserWithEmailAndPassword(auth, email, password);
        testUid = userCred.user.uid;
        console.log(`✓ Created new test user: ${testUid}`);
      } catch (authErr) {
        console.warn(`⚠ Could not sign in/create auth user (${authErr}). Proceeding with unauthenticated write or default UID...`);
      }
    }
    // 1. Seed User profile & device map
    console.log('1/6 Seeding user profile and claimed devices index...');
    await set(ref(db, `users/${testUid}`), {
      email: 'demo@leaflink.local',
      displayName: 'LeafLink Botanist',
      devices: {
        [testDeviceId]: true,
      },
      createdAt: now - 86400000 * 7,
    });

    // 2. Seed Device Owner mapping (for rule authorization)
    console.log('2/6 Seeding ownership claim...');
    await set(ref(db, `owners/${testDeviceId}`), testUid);

    // 3. Seed Device Configuration & Status
    console.log('3/6 Seeding device configuration and status...');
    await set(ref(db, `devices/${testDeviceId}/config`), {
      name: 'Balcony Hub Plant',
      plantName: 'Monstera Deliciosa',
      plantSpecies: 'Swiss Cheese Plant',
      hubId: 'hub-home-1',
      location: 'balcony',
      mode: 'auto',
      thresholds: {
        moistureMin: 30,
        moistureMax: 60,
        tempMax: 35,
        humidityMax: 80,
        pumpDurationSec: 5,
      },
      sensors: {
        lightMode: 'digital',
      },
      calibration: {
        soilDryRaw: 1024,
        soilWetRaw: 400,
      },
      bottle: {
        capacityMl: 500,
        flowMlPerSec: 15,
        remainingMl: 380,
      },
      pairedAt: now - 86400000 * 3,
    });

    await set(ref(db, `devices/${testDeviceId}/status`), {
      online: true,
      lastSeen: now,
      firmware: 'v1.0.4-esp8266',
    });

    // 4. Seed Live Telemetry
    console.log('4/6 Seeding live telemetry...');
    await set(ref(db, `devices/${testDeviceId}/telemetry`), {
      soilRaw: 620,
      soilMoisture: 48,
      temperature: 28,
      humidity: 68,
      light: 1, // Bright daylight
      pumpOn: false,
      rssi: -58,
      ts: now,
    });

    // 5. Seed 24h Historical Telemetry (points every 30 minutes for sleek charting)
    console.log('5/6 Generating 24-hour historical telemetry series...');
    const historyData: Record<string, any> = {};
    const points = 48; // every 30 min for 24h
    for (let i = points; i >= 0; i--) {
      const pointTime = now - i * 30 * 60 * 1000;
      // Diurnal curve simulation: cooler and more humid at night, warmer mid-day
      const hourOfDay = new Date(pointTime).getHours();
      const tempWave = Math.sin(((hourOfDay - 6) / 24) * 2 * Math.PI);
      const temp = Math.round(23 + tempWave * 7);
      const hum = Math.round(75 - tempWave * 20);
      const isDay = hourOfDay >= 7 && hourOfDay <= 18;

      // Moisture slowly declining with bumps at watering events
      let moisture = 54 - ((points - i) % 16) * 1.8;
      if (moisture < 28) moisture = 50;

      const key = `hist-${pointTime}`;
      historyData[key] = {
        ts: pointTime,
        temperature: temp,
        humidity: hum,
        soilMoisture: Math.round(moisture),
        light: isDay ? 1 : 0,
      };
    }
    await set(ref(db, `history/${testDeviceId}`), historyData);

    // 6. Seed Water Logs & Sample Alerts
    console.log('6/6 Seeding water logs and notification alerts...');
    const waterLogsData: Record<string, any> = {
      'log-auto-1': {
        ts: now - 3600000 * 5,
        trigger: 'auto',
        durationSec: 5,
        moistureBefore: 28,
        moistureAfter: 52,
        note: 'Optimal automatic cycle',
      },
      'log-manual-2': {
        ts: now - 3600000 * 22,
        trigger: 'manual',
        durationSec: 4,
        moistureBefore: 27,
        moistureAfter: 48,
        note: 'Manual refresh via mobile app',
      },
      'log-auto-3': {
        ts: now - 86400000 * 2,
        trigger: 'auto',
        durationSec: 5,
        moistureBefore: 29,
        moistureAfter: 54,
        note: 'Automated morning hydration',
      },
    };
    await set(ref(db, `waterLogs/${testDeviceId}`), waterLogsData);

    await set(ref(db, `alerts/${testUid}`), {
      'alert-sample-1': {
        id: 'alert-sample-1',
        deviceId: testDeviceId,
        type: 'bottle',
        severity: 'info',
        title: 'Watering Complete',
        message: 'Monstera Deliciosa was successfully watered (5s cycle).',
        timestamp: now - 3600000 * 5,
        read: false,
      },
    });

    console.log('\n✅ [LeafLink] Demo database seeded successfully!');
    console.log(`✨ Test User UID: ${testUid}`);
    console.log(`🌿 Device ID: ${testDeviceId}`);
    console.log('You can now open the app with live Firebase connectivity or explore historical charts.');
    process.exit(0);
  } catch (err) {
    console.error('❌ Failed to seed Firebase database:', err);
    process.exit(1);
  }
}

seed();
