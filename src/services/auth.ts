import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  updateProfile,
  User,
} from 'firebase/auth';
import { ref, get, set, serverTimestamp } from 'firebase/database';
import { auth, db } from '@/services/firebase';
import { RegisterFormData } from '@/utils/authValidation';

export const completeUserSetup = async (uid: string, name: string, email: string) => {
  const userRef = ref(db, `users/${uid}`);
  let existingProfile: Record<string, unknown> = {};
  let existingPrefs: Record<string, unknown> = {};

  try {
    const snap = await get(userRef);
    if (snap.exists()) {
      const val = snap.val() || {};
      if (val.profile && typeof val.profile === 'object') {
        existingProfile = val.profile;
      }
      if (val.prefs && typeof val.prefs === 'object') {
        existingPrefs = val.prefs;
      }
    }
  } catch {
    // Continue even if pre-fetch fails
  }

  await set(userRef, {
    profile: {
      name,
      displayName: name,
      email,
      createdAt: serverTimestamp(),
      ...existingProfile,
    },
    prefs: {
      units: 'C',
      quietHours: { enabled: true, start: '22:00', end: '07:00' },
      alerts: {
        bottle: true,
        dry: true,
        wet: true,
        heat: true,
        offline: true,
        watered: true,
      },
      ...existingPrefs,
    },
  });
};

export const registerUserWithEmail = async (
  data: RegisterFormData,
  deps?: {
    setupUser?: typeof completeUserSetup;
  }
): Promise<User> => {
  const trimmedEmail = data.email.trim();
  const trimmedName = data.name.trim();

  // 1. Create new Auth account
  const userCredential = await createUserWithEmailAndPassword(
    auth,
    trimmedEmail,
    data.password
  );
  const currentUser = userCredential.user;

  // 2. Call sendEmailVerification (treating transient failure as non-fatal)
  try {
    await sendEmailVerification(currentUser);
  } catch (sendErr) {
    console.warn('[Register] Failed to send verification email (non-fatal):', sendErr);
  }

  // 3. Update auth profile and mirror setup in RTDB
  await updateProfile(currentUser, { displayName: trimmedName });
  const setupFn = deps?.setupUser || completeUserSetup;
  await setupFn(currentUser.uid, trimmedName, trimmedEmail);

  return currentUser;
};
