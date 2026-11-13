import { create } from 'zustand';
import {
  User,
  onAuthStateChanged,
  signOut as fbSignOut,
  updateProfile,
  updatePassword,
} from 'firebase/auth';
import { ref, get as fbGet, update } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '@/services/firebase';
import { useLiveDevice } from '@/store/useLiveDevice';
import { clearAlertSession } from '@/hooks/useAlertEngine';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
  avatarUri?: string | null;
}

interface SessionState {
  user: UserProfile | null;
  isLoading: boolean;
  isAuthReady: boolean;
  isDemoMode: boolean;
  activeDeviceId: string;
  setUser: (user: UserProfile | null) => void;
  setAvatarUri: (uri: string | null) => Promise<void>;
  updateUserDisplayName: (displayName: string) => Promise<void>;
  updateUserPassword: (newPassword: string) => Promise<void>;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  setActiveDeviceId: (deviceId: string) => void;
  signOut: () => Promise<void>;
  initializeAuthListener: () => () => void;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  isLoading: true,
  isAuthReady: false,
  isDemoMode: false,
  activeDeviceId: '',

  setUser: (user) => set({ user, isDemoMode: false }),

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
    if (auth.currentUser) {
      await updateProfile(auth.currentUser, { displayName });
      try {
        await update(ref(db, `users/${auth.currentUser.uid}/profile`), {
          name: displayName,
          displayName,
        });
      } catch (err) {
        console.warn('[Session] Failed to sync display name to RTDB:', err);
      }
    }
    set((state) => ({
      user: state.user ? { ...state.user, displayName } : null,
    }));
  },

  updateUserPassword: async (newPassword: string) => {
    if (!auth.currentUser) {
      throw new Error('No authenticated user session');
    }
    await updatePassword(auth.currentUser, newPassword);
  },

  enterDemoMode: () => {
    // Demo Mode disabled globally – no-op for backward compatibility
    set({ isDemoMode: false });
  },

  exitDemoMode: () => {
    set({
      isDemoMode: false,
      user: null,
      activeDeviceId: '',
    });
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
    set({ activeDeviceId: deviceId });
  },

  signOut: async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.warn('[Session] Sign out error:', err);
    }
    useLiveDevice.getState().clearDeviceState();
    clearAlertSession();
    set({ user: null, activeDeviceId: '', isDemoMode: false, isLoading: false, isAuthReady: true });
  },

  initializeAuthListener: () => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser: User | null) => {
      if (firebaseUser) {
        let avatarUri: string | null = null;
        try {
          const storedAvatar = await AsyncStorage.getItem(`@plant_live_avatar_${firebaseUser.uid}`);
          avatarUri = storedAvatar || firebaseUser.photoURL || null;
        } catch (err) {
          console.warn('[Session] Failed to read stored avatar:', err);
          avatarUri = firebaseUser.photoURL || null;
        }

        // Hydrate paired devices for this user
        let pairedDeviceId = '';
        try {
          const userDevRef = ref(db, `users/${firebaseUser.uid}/devices`);
          const devSnap = await fbGet(userDevRef);
          if (devSnap.exists()) {
            const val = devSnap.val();
            const deviceIds =
              typeof val === 'object' && val !== null
                ? Object.keys(val).filter((k) => Boolean(val[k]))
                : [];
            if (deviceIds.length > 0) {
              let storedActiveId: string | null = null;
              try {
                storedActiveId = await AsyncStorage.getItem(
                  `@plant_live_active_device_${firebaseUser.uid}`
                );
              } catch (storageErr) {
                console.warn('[Session] Failed to read stored activeDeviceId:', storageErr);
              }

              if (storedActiveId && deviceIds.includes(storedActiveId)) {
                pairedDeviceId = storedActiveId;
              } else {
                pairedDeviceId = deviceIds[0];
                AsyncStorage.setItem(
                  `@plant_live_active_device_${firebaseUser.uid}`,
                  pairedDeviceId
                ).catch(() => {});
              }
            }
          }
        } catch (err) {
          console.warn('[Session] Failed to hydrate user devices on launch:', err);
        }

        if (pairedDeviceId) {
          useLiveDevice.getState().setActiveDeviceId(pairedDeviceId);
        } else {
          useLiveDevice.getState().setActiveDeviceId('');
        }

        set({
          user: {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
            avatarUri,
          },
          activeDeviceId: pairedDeviceId,
          isDemoMode: false,
          isLoading: false,
          isAuthReady: true,
        });
      } else {
        useLiveDevice.getState().clearDeviceState();
        set({ user: null, activeDeviceId: '', isDemoMode: false, isLoading: false, isAuthReady: true });
      }
    });

    return unsubscribe;
  },
}));
