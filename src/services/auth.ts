import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  User,
} from 'firebase/auth';
import { ref, runTransaction, serverTimestamp } from 'firebase/database';
import { auth, db } from '@/services/firebase';
import { RegisterFormData } from '@/utils/authValidation';

const setupKey = (uid: string) => `@plant_live_registration_${uid}`;
const setupDrafts = new Map<string, string>();
const setupInFlight = new Map<string, Promise<void>>();
const resendAvailableAt = new Map<string, number>();

export type VerificationEmailStatus = 'sending' | 'sent' | 'failed';

interface AccountData {
  profile?: Record<string, unknown>;
  prefs?: {
    units?: unknown;
    quietHours?: Record<string, unknown>;
    alerts?: Record<string, unknown>;
  };
}

export const completeUserSetup = async (uid: string, name: string, email: string) => {
  const createdAt = serverTimestamp();
  await runTransaction(ref(db, `users/${uid}`), (existing: AccountData | null) => ({
    ...existing,
    profile: { name, displayName: name, email, createdAt, ...existing?.profile },
    prefs: {
      units: 'C',
      ...existing?.prefs,
      quietHours: {
        enabled: true, start: '22:00', end: '07:00', ...existing?.prefs?.quietHours,
      },
      alerts: {
        bottle: true, dry: true, wet: true, heat: true, offline: true, watered: true,
        ...existing?.prefs?.alerts,
      },
    },
  }), { applyLocally: false });
};

async function getSetupDraft(uid: string) {
  return setupDrafts.get(uid) ?? await AsyncStorage.getItem(setupKey(uid)).catch(() => null);
}

export async function hasPendingRegistrationSetup(uid: string): Promise<boolean> {
  return (await getSetupDraft(uid)) !== null;
}

export function ensureUserSetup(
  user: User,
  registeredName?: string,
  setupUser = completeUserSetup
): Promise<void> {
  const { uid, email } = user;
  const existing = setupInFlight.get(uid);
  if (existing) return existing;

  if (registeredName) setupDrafts.set(uid, registeredName);
  const setup = (async () => {
    if (!email) return;
    if (registeredName) {
      await AsyncStorage.setItem(setupKey(uid), registeredName).catch((err) => {
        console.warn('[Register] Could not save profile setup for later retry:', err);
      });
    }
    const draft = await getSetupDraft(uid);
    if (draft && draft !== user.displayName) {
      await updateProfile(user, { displayName: draft });
    }
    await setupUser(uid, draft || user.displayName || email.split('@')[0], email);
    if (draft) {
      await AsyncStorage.removeItem(setupKey(uid));
      setupDrafts.delete(uid);
    }
  })().finally(() => setupInFlight.delete(uid));
  setupInFlight.set(uid, setup);
  return setup;
}

export function getVerificationResendTime(uid: string): number {
  return resendAvailableAt.get(uid) ?? 0;
}

export async function sendVerificationEmail(user: User, initial = false): Promise<void> {
  if (!initial && getVerificationResendTime(user.uid) > Date.now()) return;
  resendAvailableAt.set(user.uid, Date.now() + 60_000);
  try {
    await sendEmailVerification(user);
    resendAvailableAt.set(user.uid, Date.now() + 60_000);
  } catch (err) {
    resendAvailableAt.delete(user.uid);
    throw err;
  }
}

export const registerUserWithEmail = async (
  data: RegisterFormData,
  deps?: {
    setupUser?: typeof completeUserSetup;
    onVerificationEmailStatus?: (uid: string, status: VerificationEmailStatus) => void;
  }
): Promise<User> => {
  const { user } = await createUserWithEmailAndPassword(auth, data.email.trim(), data.password);
  deps?.onVerificationEmailStatus?.(user.uid, 'sending');
  const verification = sendVerificationEmail(user, true).then(
    () => deps?.onVerificationEmailStatus?.(user.uid, 'sent'),
    (err) => {
      deps?.onVerificationEmailStatus?.(user.uid, 'failed');
      console.warn('[Register] Failed to send verification email:', err);
    }
  );
  await Promise.all([
    verification,
    ensureUserSetup(user, data.name.trim(), deps?.setupUser),
  ]);
  return user;
};
