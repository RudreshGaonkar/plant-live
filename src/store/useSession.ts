import { create } from 'zustand';
import { User, onAuthStateChanged, signOut as fbSignOut } from 'firebase/auth';
import { auth } from '@/services/firebase';

export interface UserProfile {
  uid: string;
  email: string | null;
  displayName: string | null;
}

interface SessionState {
  user: UserProfile | null;
  isLoading: boolean;
  isDemoMode: boolean;
  activeDeviceId: string;
  setUser: (user: UserProfile | null) => void;
  enterDemoMode: () => void;
  exitDemoMode: () => void;
  setActiveDeviceId: (deviceId: string) => void;
  signOut: () => Promise<void>;
  initializeAuthListener: () => () => void;
}

export const useSession = create<SessionState>((set, get) => ({
  user: null,
  isLoading: true,
  isDemoMode: false,
  activeDeviceId: '',

  setUser: (user) => set({ user, isDemoMode: false }),

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
    set({ user: null, activeDeviceId: '', isDemoMode: false });
  },

  initializeAuthListener: () => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      if (firebaseUser) {
        set({
          user: {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
          },
          isDemoMode: false,
          isLoading: false,
        });
      } else {
        set({ user: null, activeDeviceId: '', isDemoMode: false, isLoading: false });
      }
    });

    return unsubscribe;
  },
}));
