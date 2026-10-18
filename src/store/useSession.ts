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
  activeDeviceId: 'demo-leaf-01',

  setUser: (user) => set({ user }),

  enterDemoMode: () =>
    set({
      isDemoMode: true,
      isLoading: false,
      user: {
        uid: 'demo-user-123',
        email: 'demo@leaflink.local',
        displayName: 'Plant Parent (Demo)',
      },
      activeDeviceId: 'demo-leaf-01',
    }),

  exitDemoMode: () =>
    set({
      isDemoMode: false,
      user: null,
      activeDeviceId: 'leaf-node-01',
    }),

  setActiveDeviceId: (deviceId: string) => set({ activeDeviceId: deviceId }),

  signOut: async () => {
    if (get().isDemoMode) {
      get().exitDemoMode();
      return;
    }
    await fbSignOut(auth);
    set({ user: null });
  },

  initializeAuthListener: () => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: User | null) => {
      // Don't overwrite if in demo mode
      if (get().isDemoMode) {
        set({ isLoading: false });
        return;
      }

      if (firebaseUser) {
        set({
          user: {
            uid: firebaseUser.uid,
            email: firebaseUser.email,
            displayName: firebaseUser.displayName,
          },
          isLoading: false,
        });
      } else {
        set({ user: null, isLoading: false });
      }
    });

    return unsubscribe;
  },
}));
