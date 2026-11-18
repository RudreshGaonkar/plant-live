import { triggerAlertSessionClear } from '@/store/alertSessionBus';
import { auth, db } from '@/services/firebase';
import { ensureUserSetup, hasPendingRegistrationSetup, registerUserWithEmail, sendVerificationEmail, type VerificationEmailStatus } from '@/services/auth';
import type { RegisterFormData } from '@/utils/authValidation';
import { useLiveDevice } from '@/store/useLiveDevice';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  User,
  signOut as fbSignOut,
  onAuthStateChanged,
  updatePassword,
  updateProfile,
  EmailAuthProvider,
  reauthenticateWithCredential,
  sendPasswordResetEmail as fbSendPasswordResetEmail,
} from 'firebase/auth';
import { get as fbGet, ref, update } from 'firebase/database';
import { create } from 'zustand';

export type SessionRoutingState = 'resolving' | 'signed_out' | 'verification_pending' | 'verified';

export function selectSessionRoutingState(
  state: Pick<SessionState, 'isAuthReady' | 'hasResolvedAuth' | 'user' | 'isEmailVerified'>
): SessionRoutingState {
  if (!state.isAuthReady || !state.hasResolvedAuth) return 'resolving';
  if (!state.user) return 'signed_out';
  return state.isEmailVerified ? 'verified' : 'verification_pending';
}

export type PairingStatus = 'pending' | 'paired' | 'unpaired' | 'cached' | 'unavailable';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  avatarUri?: string | null;
  emailVerified?: boolean;
}

export interface UserAlertPrefs {
  bottle: boolean;
  dry: boolean;
  wet: boolean;
  heat: boolean;
  offline: boolean;
}

export interface UserQuietHours {
  enabled: boolean;
  start: string;
  end: string;
}

export interface UserPrefs {
  units: 'C' | 'F';
  quietHours: UserQuietHours;
  alerts: UserAlertPrefs;
}

export const DEFAULT_USER_PREFS: UserPrefs = {
  units: 'C',
  quietHours: {
    enabled: false,
    start: '22:00',
    end: '07:00',
  },
  alerts: {
    bottle: true,
    dry: true,
    wet: true,
    heat: true,
    offline: true,
  },
};

interface SessionState {
  user: UserProfile | null;
  isEmailVerified: boolean;
  isLoading: boolean;
  isAuthReady: boolean;
  hasResolvedAuth: boolean;
  pairingStatus: PairingStatus;
  activeDeviceId: string;
  prefs: UserPrefs;
  profileSyncError: string | null;
  verificationEmailDelivery: { uid: string; status: VerificationEmailStatus } | null;
  registerUser: (data: RegisterFormData) => Promise<User>;
  setUser: (user: UserProfile | null) => void;
  setPrefs: (partial: Partial<UserPrefs>) => void;
  updateTempUnit: (unit: 'C' | 'F') => Promise<void>;
  toggleQuietHours: (enabled: boolean) => Promise<void>;
  updateQuietHoursTimes: (start: string, end: string) => Promise<void>;
  updateAlertPref: (key: keyof UserAlertPrefs, enabled: boolean) => Promise<void>;
  setAvatarUri: (uri: string | null) => Promise<void>;
  updateUserDisplayName: (displayName: string) => Promise<void>;
  retrySyncProfileToRTDB: () => Promise<void>;
  updateUserPassword: (currentPasswordOrNew: string, maybeNewPassword?: string) => Promise<void>;
  sendPasswordResetEmail: (email: string) => Promise<void>;
  sendPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  refreshEmailVerification: () => Promise<boolean>;
  retryRegistrationSetup: () => Promise<void>;
  setActiveDeviceId: (deviceId: string) => void;
  signOut: () => Promise<void>;
  initializeAuthListener: () => () => void;
  retryBoot: () => Promise<void>;
}

let currentBootAttempt = 0;
let receivedAuthCallback = false;
const BOOT_TIMEOUT_MS = 5000;
let verificationCheck: { user: User; promise: Promise<boolean> } | null = null;
let authListenerUnsubscribe: (() => void) | null = null;

type SetSession = (
  partial: Partial<SessionState> | ((state: SessionState) => Partial<SessionState>)
) => void;

function toSessionUser(user: User): UserProfile {
  return {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    avatarUri: user.photoURL || null,
    emailVerified: Boolean(user.emailVerified),
  };
}

function isCurrentBoot(uid: string, attemptId: number) {
  return attemptId === currentBootAttempt && auth.currentUser?.uid === uid;
}

async function boundedBootRead<T>(read: () => Promise<T>, fallback: T, deadline: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), Math.max(0, deadline - Date.now()));
      }),
    ]);
  } catch {
    return fallback;
  } finally {
    clearTimeout(timer);
  }
}

export function normalizePrefs(raw: Partial<Omit<UserPrefs, 'alerts' | 'quietHours'>> & {
  quietHours?: Partial<UserQuietHours>;
  alerts?: Partial<UserAlertPrefs>;
} | null): UserPrefs {
  return {
    units: raw?.units === 'F' ? 'F' : 'C',
    quietHours: { ...DEFAULT_USER_PREFS.quietHours, ...raw?.quietHours },
    alerts: { ...DEFAULT_USER_PREFS.alerts, ...raw?.alerts },
  };
}

function publishIdentity(user: User, verified: boolean, set: SetSession) {
  set({
    user: { ...toSessionUser(user), emailVerified: verified },
    isEmailVerified: verified,
    isLoading: verified,
    isAuthReady: true,
    hasResolvedAuth: true,
  });
}

async function resolveUserSession(user: User, attemptId: number, set: SetSession, get: () => SessionState) {
  const deadline = Date.now() + BOOT_TIMEOUT_MS;
  const needsVerification = !user.emailVerified || await boundedBootRead(
    () => hasPendingRegistrationSetup(user.uid), true, deadline
  );
  if (!isCurrentBoot(user.uid, attemptId)) return;
  publishIdentity(user, !needsVerification, set);
  if (!needsVerification) await hydrateUserSession(user, attemptId, set, get, deadline);
}

async function hydrateUserSession(
  user: User,
  attemptId: number,
  set: SetSession,
  get: () => SessionState,
  deadline = Date.now() + BOOT_TIMEOUT_MS
) {
  const { uid } = user;
  const storageKey = `@plant_live_active_device_${uid}`;
  const [membership, cachedId, prefs, avatar] = await Promise.all([
    boundedBootRead(async () => {
      const snapshot = await fbGet(ref(db, `users/${uid}/devices`));
      return snapshot.exists() ? snapshot.val() || {} : {};
    }, null, deadline),
    boundedBootRead(() => AsyncStorage.getItem(storageKey), null, deadline),
    boundedBootRead(async () => {
      const snapshot = await fbGet(ref(db, `users/${uid}/prefs`));
      return snapshot.exists() ? normalizePrefs(snapshot.val()) : DEFAULT_USER_PREFS;
    }, null, deadline),
    boundedBootRead(() => AsyncStorage.getItem(`@plant_live_avatar_${uid}`), null, deadline),
  ]);
  if (!isCurrentBoot(uid, attemptId)) return;

  const fallbackId = get().activeDeviceId || cachedId;
  const deviceIds = membership === null
    ? (fallbackId ? [fallbackId] : [])
    : Object.keys(membership).filter((id) => Boolean(membership[id]));
  let activeDeviceId = '';
  if (deviceIds.length) {
    activeDeviceId = useLiveDevice.getState().seedDeviceRecords(deviceIds, fallbackId);
  } else {
    useLiveDevice.getState().clearDeviceState();
    if (membership !== null) AsyncStorage.removeItem(storageKey).catch(() => {});
  }
  const pairingStatus = membership === null
    ? (activeDeviceId ? 'cached' : 'unavailable')
    : (activeDeviceId ? 'paired' : 'unpaired');

  const currentUser = get().user;
  set({
    user: currentUser && { ...currentUser, avatarUri: avatar ?? currentUser.avatarUri },
    activeDeviceId,
    pairingStatus,
    prefs: prefs ?? get().prefs,
    isLoading: false,
  });
}

const preferenceQueues = new Map<string, Promise<void>>();

function savePreference<T>(
  get: () => SessionState,
  field: string,
  read: (prefs: UserPrefs) => T,
  apply: (value: T) => void,
  next: (previous: T) => T,
  write: (uid: string, value: T) => Promise<void>
): Promise<void> {
  const uid = get().user?.uid || auth.currentUser?.uid;
  if (!uid) return Promise.reject(new Error('No authenticated user session'));
  const firebaseUser = auth.currentUser;
  const generation = currentBootAttempt;
  const isCurrent = () => currentBootAttempt === generation && auth.currentUser === firebaseUser &&
    (get().user?.uid || auth.currentUser?.uid) === uid;
  const key = JSON.stringify([uid, field]);
  const pending = (preferenceQueues.get(key) ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      if (!isCurrent()) return;
      const previous = read(get().prefs);
      const value = next(previous);
      apply(value);
      try {
        await write(uid, value);
      } catch (error) {
        if (isCurrent() && read(get().prefs) === value) apply(previous);
        throw error;
      }
    }).finally(() => {
      if (preferenceQueues.get(key) === pending) preferenceQueues.delete(key);
    });
  preferenceQueues.set(key, pending);
  return pending;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  isEmailVerified: false,
  isLoading: true,
  isAuthReady: false,
  hasResolvedAuth: false,
  pairingStatus: 'pending',
  activeDeviceId: '',
  prefs: DEFAULT_USER_PREFS,
  profileSyncError: null,
  verificationEmailDelivery: null,

  registerUser: (data) => registerUserWithEmail(data, {
    onVerificationEmailStatus: (uid, status) => {
      if (auth.currentUser?.uid === uid) set({ verificationEmailDelivery: { uid, status } });
    },
  }),

  setUser: (user) =>
    set({
      user,
      isEmailVerified: Boolean(user?.emailVerified ?? auth.currentUser?.emailVerified ?? false),
    }),

  setPrefs: (partial) => {
    set((state) => ({
      prefs: {
        ...state.prefs,
        ...partial,
        quietHours: {
          ...state.prefs.quietHours,
          ...(partial.quietHours || {}),
        },
        alerts: {
          ...state.prefs.alerts,
          ...(partial.alerts || {}),
        },
      },
    }));
  },

  updateTempUnit: (unit) => savePreference(get, 'units',
    (prefs) => prefs.units,
    (units) => get().setPrefs({ units }),
    () => unit,
    (uid, units) => update(ref(db, `users/${uid}/prefs`), { units }),
  ),

  toggleQuietHours: (enabled) => savePreference(get, 'quietHours',
    (prefs) => prefs.quietHours,
    (quietHours) => set((state) => ({ prefs: { ...state.prefs, quietHours } })),
    (previous) => ({ ...previous, enabled }),
    (uid, value) => update(ref(db, `users/${uid}/prefs/quietHours`), value),
  ),

  updateQuietHoursTimes: (start, end) => savePreference(get, 'quietHours',
    (prefs) => prefs.quietHours,
    (quietHours) => set((state) => ({ prefs: { ...state.prefs, quietHours } })),
    (previous) => ({ ...previous, start: start || previous.start, end: end || previous.end }),
    (uid, value) => update(ref(db, `users/${uid}/prefs/quietHours`), value),
  ),

  updateAlertPref: (key, enabled) => savePreference(get, `alerts/${key}`,
    (prefs) => prefs.alerts[key],
    (value) => set((state) => ({
      prefs: { ...state.prefs, alerts: { ...state.prefs.alerts, [key]: value } },
    })),
    () => enabled,
    (uid, value) => update(ref(db, `users/${uid}/prefs/alerts`), { [key]: value }),
  ),

  setAvatarUri: async (uri: string | null) => {
    const user = get().user;
    if (user?.uid) {
      try {
        const storageKey = `@plant_live_avatar_${user.uid}`;
        if (uri) {
          await AsyncStorage.setItem(storageKey, uri);
        } else {
          await AsyncStorage.removeItem(storageKey);
        }
      } catch (err) {
        console.warn('[Session] Failed to persist avatar to AsyncStorage:', err);
      }
    }
    set((state) => ({
      user: state.user ? { ...state.user, avatarUri: uri } : null,
    }));
  },

  updateUserDisplayName: async (displayName: string) => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user session');
    }
    const uid = auth.currentUser.uid;
    await updateProfile(auth.currentUser, { displayName });
    set((state) => ({
      user: state.user ? { ...state.user, displayName } : null,
      profileSyncError: null,
    }));
    try {
      await update(ref(db, `users/${uid}/profile`), {
        name: displayName,
        displayName,
      });
    } catch (err: any) {
      console.warn('[Session] RTDB profile mirror failed, auth displayName succeeded:', err);
      set({ profileSyncError: err?.message || 'Failed to sync display name to database.' });
      throw new Error('AUTH_DISPLAY_NAME_UPDATED_RTDB_FAILED');
    }
  },

  retrySyncProfileToRTDB: async () => {
    const user = get().user;
    const currentUser = auth.currentUser;
    if (!currentUser || !user?.uid) {
      throw new Error('No authenticated user session');
    }
    const name = currentUser.displayName || user.displayName || '';
    await update(ref(db, `users/${user.uid}/profile`), {
      name,
      displayName: name,
    });
    set({ profileSyncError: null });
  },

  updateUserPassword: async (currentPasswordOrNew: string, maybeNewPassword?: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No authenticated user session');
    }
    const currentPassword = maybeNewPassword !== undefined ? currentPasswordOrNew : '';
    const newPassword = maybeNewPassword !== undefined ? maybeNewPassword : currentPasswordOrNew;

    if (currentPassword) {
      const email = currentUser.email || get().user?.email;
      if (!email) {
        throw new Error('No email found for current user');
      }
      const credential = EmailAuthProvider.credential(email, currentPassword);
      await reauthenticateWithCredential(currentUser, credential);
    }
    await updatePassword(currentUser, newPassword);
  },

  sendPasswordResetEmail: async (email: string) => {
    const trimmed = email.trim();
    await fbSendPasswordResetEmail(auth, trimmed);
  },

  sendPasswordReset: async (email: string) => {
    const trimmed = email.trim();
    await fbSendPasswordResetEmail(auth, trimmed);
  },

  resendVerificationEmail: async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No authenticated user session');
    }
    await sendVerificationEmail(currentUser);
    const delivery = get().verificationEmailDelivery;
    if (auth.currentUser === currentUser && delivery?.uid === currentUser.uid && delivery.status === 'failed') {
      set({ verificationEmailDelivery: { uid: currentUser.uid, status: 'sent' } });
    }
  },

  retryRegistrationSetup: async () => {
    const user = auth.currentUser;
    if (!user || get().user?.uid !== user.uid) throw new Error('No authenticated user session');
    await ensureUserSetup(user);
  },

  refreshEmailVerification: async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) throw new Error('No authenticated user session');
    if (verificationCheck?.user === currentUser) return verificationCheck.promise;

    const attemptId = currentBootAttempt;
    const isCurrentSession = () =>
      attemptId === currentBootAttempt && auth.currentUser === currentUser &&
      get().user?.uid === currentUser.uid;
    const promise = (async () => {
      await currentUser.reload();
      if (!isCurrentSession()) return false;
      const verified = Boolean(currentUser.emailVerified);
      if (verified && selectSessionRoutingState(get()) === 'verification_pending') {
        await ensureUserSetup(currentUser);
        await currentUser.getIdToken(true);
        if (!isCurrentSession()) return false;
        publishIdentity(currentUser, true, set);
        await hydrateUserSession(currentUser, attemptId, set, get);
        return isCurrentSession();
      }
      set((state) => ({
        isEmailVerified: verified,
        user: state.user ? { ...state.user, emailVerified: verified } : null,
      }));
      return verified;
    })().finally(() => {
      if (verificationCheck?.promise === promise) verificationCheck = null;
    });
    verificationCheck = { user: currentUser, promise };
    return promise;
  },

  setActiveDeviceId: (deviceId: string) => {
    const user = get().user;
    const uid = user?.uid || auth.currentUser?.uid;
    if (uid) {
      if (deviceId) {
        AsyncStorage.setItem(`@plant_live_active_device_${uid}`, deviceId).catch((err) =>
          console.warn('[Session] Failed to persist activeDeviceId to AsyncStorage:', err)
        );
      } else {
        AsyncStorage.removeItem(`@plant_live_active_device_${uid}`).catch((err) =>
          console.warn('[Session] Failed to remove activeDeviceId from AsyncStorage:', err)
        );
      }
    }
    useLiveDevice.getState().setActiveDeviceId(deviceId);
    set({
      activeDeviceId: deviceId,
      ...(deviceId ? { pairingStatus: 'paired' } : {}),
    });
  },

  signOut: async () => {
    await fbSignOut(auth);
    ++currentBootAttempt;
    useLiveDevice.getState().clearDeviceState();
    triggerAlertSessionClear();
    set({
      user: null,
      isEmailVerified: false,
      activeDeviceId: '',
      isLoading: false,
      isAuthReady: true,
      hasResolvedAuth: true,
      pairingStatus: 'unpaired',
      prefs: DEFAULT_USER_PREFS,
      profileSyncError: null,
    });
  },

  initializeAuthListener: () => {
    if (authListenerUnsubscribe) {
      return authListenerUnsubscribe;
    }

    let listening = true;
    receivedAuthCallback = false;
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (!listening) return;
      receivedAuthCallback = true;
      const attemptId = ++currentBootAttempt;
      try {
        if (firebaseUser) {
          if (get().user?.uid !== firebaseUser.uid) {
            useLiveDevice.getState().clearDeviceState();
            triggerAlertSessionClear();
            set({
              isAuthReady: false, isEmailVerified: false, user: null, pairingStatus: 'pending',
              activeDeviceId: '', prefs: DEFAULT_USER_PREFS, profileSyncError: null,
            });
          }
          await resolveUserSession(firebaseUser, attemptId, set, get);
        } else {
          useLiveDevice.getState().clearDeviceState();
          triggerAlertSessionClear();
          if (attemptId === currentBootAttempt) {
            set({
              user: null,
              isEmailVerified: false,
              activeDeviceId: '',
              pairingStatus: 'unpaired',
              prefs: DEFAULT_USER_PREFS,
              profileSyncError: null,
              isLoading: false,
              isAuthReady: true,
              hasResolvedAuth: true,
            });
          }
        }
      } catch (fatalErr) {
        console.error('[Session] Fatal error in auth state listener:', fatalErr);
        if (attemptId === currentBootAttempt) {
          set({
            isLoading: false,
            isAuthReady: true,
            hasResolvedAuth: true,
            pairingStatus: 'unavailable',
          });
        }
      }
    });

    authListenerUnsubscribe = () => {
      if (!listening) return;
      listening = false;
      receivedAuthCallback = false;
      ++currentBootAttempt;
      unsubscribe();
      authListenerUnsubscribe = null;
    };

    return authListenerUnsubscribe;
  },

  retryBoot: async () => {
    if (!receivedAuthCallback) return;
    const attemptId = ++currentBootAttempt;
    set({ pairingStatus: 'pending', isLoading: true });
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        if (selectSessionRoutingState(get()) === 'verified' && get().user?.uid === currentUser.uid) {
          await hydrateUserSession(currentUser, attemptId, set, get);
        } else {
          await resolveUserSession(currentUser, attemptId, set, get);
        }
      } catch (err) {
        console.error('[Session] Retry boot hydration error:', err);
        if (attemptId === currentBootAttempt) {
          set({
            pairingStatus: 'unavailable',
            isLoading: false,
            isAuthReady: true,
            hasResolvedAuth: true,
          });
        }
      }
    } else {
      set({
        user: null,
        isEmailVerified: false,
        activeDeviceId: '',
        pairingStatus: 'unpaired',
        isAuthReady: true,
        hasResolvedAuth: true,
        isLoading: false,
      });
    }
  },
}));
