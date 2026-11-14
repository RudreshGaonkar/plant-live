import { triggerAlertSessionClear } from '@/store/alertSessionBus';
import { auth, db } from '@/services/firebase';
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
  sendEmailVerification as fbSendEmailVerification,
} from 'firebase/auth';
import { get as fbGet, ref, update } from 'firebase/database';
import { create } from 'zustand';

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
  setActiveDeviceId: (deviceId: string) => void;
  signOut: () => Promise<void>;
  initializeAuthListener: () => () => void;
  retryBoot: () => Promise<void>;
}

let currentBootAttempt = 0;
let lastResolvedUid: string | null = null;
let authListenerUnsubscribe: (() => void) | null = null;

async function hydrateUserSession(
  firebaseUser: User,
  attemptId: number,
  set: (partial: Partial<SessionState> | ((state: SessionState) => Partial<SessionState>)) => void,
  get: () => SessionState
) {
  // Reset pairingStatus if UID changed
  if (lastResolvedUid !== firebaseUser.uid) {
    lastResolvedUid = firebaseUser.uid;
    set({ pairingStatus: 'pending' });
  }

  // Hydrate user avatar asynchronously outside critical boot path
  AsyncStorage.getItem(`@plant_live_avatar_${firebaseUser.uid}`)
    .then((storedAvatar) => {
      if (storedAvatar && get().user?.uid === firebaseUser.uid) {
        set((state) => ({
          user: state.user ? { ...state.user, avatarUri: storedAvatar } : null,
        }));
      }
    })
    .catch((err) => {
      console.warn('[Session] Failed to read stored avatar:', err);
    });

  const storageKey = `@plant_live_active_device_${firebaseUser.uid}`;
  const cachedActiveIdPromise = AsyncStorage.getItem(storageKey).catch((storageErr) => {
    console.warn('[Session] Failed to read stored activeDeviceId:', storageErr);
    return null;
  });

  let timerHandle: ReturnType<typeof setTimeout> | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerHandle = setTimeout(() => {
      reject(new Error('Device hydration timed out'));
    }, 5000);
  });

  const userDevRef = ref(db, `users/${firebaseUser.uid}/devices`);
  const rtdbPromise = fbGet(userDevRef);
  const prefsRef = ref(db, `users/${firebaseUser.uid}/prefs`);
  const prefsPromise = fbGet(prefsRef).catch(() => null);

  let pairedDeviceId = '';
  let resolvedStatus: PairingStatus = 'pending';
  let resolvedPrefs: UserPrefs = { ...DEFAULT_USER_PREFS };

  try {
    const [cachedActiveId, devSnap, prefsSnap] = await Promise.all([
      cachedActiveIdPromise,
      Promise.race([rtdbPromise, timeoutPromise]),
      prefsPromise,
    ]);

    if (prefsSnap && prefsSnap.exists()) {
      const pVal = prefsSnap.val();
      resolvedPrefs = {
        units: pVal.units === 'F' ? 'F' : 'C',
        quietHours: {
          enabled: typeof pVal.quietHours?.enabled === 'boolean' ? pVal.quietHours.enabled : DEFAULT_USER_PREFS.quietHours.enabled,
          start: pVal.quietHours?.start || DEFAULT_USER_PREFS.quietHours.start,
          end: pVal.quietHours?.end || DEFAULT_USER_PREFS.quietHours.end,
        },
        alerts: {
          bottle: typeof pVal.alerts?.bottle === 'boolean' ? pVal.alerts.bottle : true,
          dry: typeof pVal.alerts?.dry === 'boolean' ? pVal.alerts.dry : true,
          wet: typeof pVal.alerts?.wet === 'boolean' ? pVal.alerts.wet : true,
          heat: typeof pVal.alerts?.heat === 'boolean' ? pVal.alerts.heat : true,
          offline: typeof pVal.alerts?.offline === 'boolean' ? pVal.alerts.offline : true,
        },
      };
    }

    if (devSnap.exists()) {
      const val = devSnap.val();
      const deviceIds =
        typeof val === 'object' && val !== null
          ? Object.keys(val).filter((k) => Boolean(val[k]))
          : [];

      if (deviceIds.length > 0) {
        const preferredId =
          cachedActiveId && deviceIds.includes(cachedActiveId) ? cachedActiveId : deviceIds[0];
        pairedDeviceId = useLiveDevice.getState().seedDeviceRecords(deviceIds, preferredId);
        resolvedStatus = 'paired';
      } else {
        // Confirmed successful empty snapshot: strictly unpaired
        useLiveDevice.getState().clearDeviceState();
        pairedDeviceId = '';
        resolvedStatus = 'unpaired';
        AsyncStorage.removeItem(storageKey).catch(() => {});
      }
    } else {
      // Confirmed snapshot does not exist in RTDB: strictly unpaired
      useLiveDevice.getState().clearDeviceState();
      pairedDeviceId = '';
      resolvedStatus = 'unpaired';
      AsyncStorage.removeItem(storageKey).catch(() => {});
    }
  } catch (err) {
    console.warn('[Session] RTDB device hydration failed or timed out, evaluating cached fallback:', err);
    let fallbackId: string | null = null;
    try {
      fallbackId = await cachedActiveIdPromise;
    } catch {
      fallbackId = null;
    }

    if (fallbackId) {
      pairedDeviceId = useLiveDevice.getState().seedDeviceRecords([fallbackId], fallbackId);
      resolvedStatus = 'cached';
    } else {
      useLiveDevice.getState().clearDeviceState();
      pairedDeviceId = '';
      resolvedStatus = 'unavailable';
    }
  } finally {
    if (timerHandle) {
      clearTimeout(timerHandle);
      timerHandle = null;
    }
  }

  // Guard async completion: verify attempt is still current and UID matches
  if (attemptId !== currentBootAttempt || auth.currentUser?.uid !== firebaseUser.uid) {
    return;
  }

  set({
    user: {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      avatarUri: firebaseUser.photoURL || null,
      emailVerified: Boolean(firebaseUser.emailVerified),
    },
    isEmailVerified: Boolean(firebaseUser.emailVerified),
    activeDeviceId: pairedDeviceId,
    pairingStatus: resolvedStatus,
    prefs: resolvedPrefs,
    profileSyncError: null,
    isLoading: false,
    isAuthReady: true,
    hasResolvedAuth: true,
  });
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

  updateTempUnit: async (unit: 'C' | 'F') => {
    const user = get().user;
    const uid = user?.uid || auth.currentUser?.uid;
    if (!uid) throw new Error('No authenticated user session');
    set((state) => ({
      prefs: { ...state.prefs, units: unit },
    }));
    await update(ref(db, `users/${uid}/prefs`), { units: unit });
  },

  toggleQuietHours: async (enabled: boolean) => {
    const user = get().user;
    const uid = user?.uid || auth.currentUser?.uid;
    if (!uid) throw new Error('No authenticated user session');
    const cur = get().prefs.quietHours;
    const next: UserQuietHours = {
      enabled,
      start: cur.start || '22:00',
      end: cur.end || '07:00',
    };
    set((state) => ({
      prefs: { ...state.prefs, quietHours: next },
    }));
    await update(ref(db, `users/${uid}/prefs/quietHours`), next);
  },

  updateQuietHoursTimes: async (start: string, end: string) => {
    const user = get().user;
    const uid = user?.uid || auth.currentUser?.uid;
    if (!uid) throw new Error('No authenticated user session');
    const cur = get().prefs.quietHours;
    const next: UserQuietHours = {
      enabled: cur.enabled,
      start: start || cur.start || '22:00',
      end: end || cur.end || '07:00',
    };
    set((state) => ({
      prefs: { ...state.prefs, quietHours: next },
    }));
    await update(ref(db, `users/${uid}/prefs/quietHours`), next);
  },

  updateAlertPref: async (key: keyof UserAlertPrefs, enabled: boolean) => {
    const user = get().user;
    const uid = user?.uid || auth.currentUser?.uid;
    if (!uid) throw new Error('No authenticated user session');
    set((state) => ({
      prefs: {
        ...state.prefs,
        alerts: { ...state.prefs.alerts, [key]: enabled },
      },
    }));
    await update(ref(db, `users/${uid}/prefs/alerts`), { [key]: enabled });
  },

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
    await fbSendEmailVerification(currentUser);
  },

  refreshEmailVerification: async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) {
      throw new Error('No authenticated user session');
    }
    await currentUser.reload();
    const verified = Boolean(currentUser.emailVerified);
    set((state) => ({
      isEmailVerified: verified,
      user: state.user ? { ...state.user, emailVerified: verified } : null,
    }));
    return verified;
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
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.warn('[Session] Sign out error:', err);
    }
    lastResolvedUid = null;
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

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      const attemptId = ++currentBootAttempt;
      try {
        if (firebaseUser) {
          await hydrateUserSession(firebaseUser, attemptId, set, get);
        } else {
          lastResolvedUid = null;
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
      unsubscribe();
      authListenerUnsubscribe = null;
    };

    return authListenerUnsubscribe;
  },

  retryBoot: async () => {
    const attemptId = ++currentBootAttempt;
    set({ pairingStatus: 'pending' });
    const currentUser = auth.currentUser;
    if (currentUser) {
      try {
        await hydrateUserSession(currentUser, attemptId, set, get);
      } catch (err) {
        console.error('[Session] Retry boot hydration error:', err);
        if (attemptId === currentBootAttempt) {
          set({
            pairingStatus: 'unavailable',
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
