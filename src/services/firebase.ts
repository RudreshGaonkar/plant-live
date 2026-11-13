import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  initializeAuth,
  getAuth,
  Auth,
  // @ts-expect-error - React Native persistence module in firebase/auth
  getReactNativePersistence,
} from 'firebase/auth';
import { getDatabase, Database } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';

export const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || 'AIzaSyBV1o12illTDwQlw1K1kwYJ0QhIaipzZ7E',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || 'leaflink-7c669.firebaseapp.com',
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL || 'https://leaflink-7c669-default-rtdb.firebaseio.com/',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || 'leaflink-7c669',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || 'leaflink-7c669.firebasestorage.app',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '224304593106',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '1:224304593106:web:f8618c4c6ff06d0681150b',
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID || 'G-L1WVH7V1CJ',
};

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

let auth: Auth;
try {
  auth = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  auth = getAuth(app);
}

const db: Database = getDatabase(app, firebaseConfig.databaseURL);

export { app, auth, db };
