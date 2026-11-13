import { create } from 'zustand';
import {
  User,
  onAuthStateChanged,
  signOut as fbSignOut,
  updateProfile,
  updatePassword,
} from 'firebase/auth';
import { ref, get as fbGet } from 'firebase/database';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { auth, db } from '@/services/firebase';
import { useLiveDevice } from '@/store/useLiveDevice';

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

  setActiveDeviceId: (deviceId: string) => set({ activeDeviceId: deviceId }),

  signOut: async () => {
    try {
      await fbSignOut(auth);
    } catch (err) {
      console.warn('[Session] Sign out error:', err);
    }
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
              pairedDeviceId = deviceIds[0];
            }
          }
        } catch (err) {
          console.warn('[Session] Failed to hydrate user devices on launch:', err);
        }

        if (pairedDeviceId) {
          useLiveDevice.getState().setActiveDeviceId(pairedDeviceId);
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
        set({ user: null, activeDeviceId: '', isDemoMode: false, isLoading: false, isAuthReady: true });
      }
    });

    return unsubscribe;
  },
}));
