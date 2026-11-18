import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
  sendPasswordResetEmail,
  sendEmailVerification,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import { useSession } from '../src/store/useSession';
import {
  mapChangePasswordError,
  mapPasswordResetError,
  PASSWORD_RESET_CONFIRMATION_MESSAGE,
  validateEmail,
  changePasswordWithCurrentSchema,
} from '../src/utils/authValidation';
import { registerUserWithEmail } from '../src/services/auth';

let mockCurrentUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  reload: jest.Mock;
} | null = {
  uid: 'user-123',
  email: 'gardener@leaflink.com',
  displayName: 'Gardener Jane',
  emailVerified: false,
  reload: jest.fn(() => Promise.resolve()),
};

jest.mock('react-native', () => ({
  Platform: { OS: 'ios' },
}));

jest.mock('expo-device', () => ({}));

jest.mock('expo-router', () => ({
  router: {
    replace: jest.fn(),
    push: jest.fn(),
  },
}));

jest.mock('expo-splash-screen', () => ({
  hideAsync: jest.fn(() => Promise.resolve()),
  preventAutoHideAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock('@expo/vector-icons/Ionicons', () => 'Ionicons');

jest.mock('../src/theme', () => ({
  useAppTheme: () => ({
    colors: {
      background: '#FFFFFF',
      surface: '#FFFFFF',
      text: '#1F2A21',
      textMuted: '#666666',
      border: '#E0E0E0',
      palette: {
        blush: '#F8D7DA',
        forest: '#5A8A5C',
        sage: '#80B07F',
        mint: '#AEE09A',
        lime: '#CEEA9F',
        ink: '#1F2A21',
        mist: '#F6FAF2',
        white: '#FFFFFF',
        warningText: '#C0505E',
        warningBorder: '#C0505E',
        critical: '#C0505E',
      },
    },
    radii: { hero: 20, sm: 8, md: 12, card: 16 },
    spacing: { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 },
  }),
}));

jest.mock('../src/components', () => ({
  LegalPoliciesModal: () => null,
}));

jest.mock('../src/services/firebase', () => ({
  db: {},
  auth: {
    get currentUser() {
      return mockCurrentUser;
    },
  },
}));

jest.mock('firebase/database', () => ({
  ref: jest.fn((database, path) => ({ path })),
  set: jest.fn(() => Promise.resolve()),
  update: jest.fn(() => Promise.resolve()),
  get: jest.fn(() => Promise.resolve({ exists: () => false, val: () => null })),
  runTransaction: jest.fn(() => Promise.resolve()),
  serverTimestamp: jest.fn(() => 123456789),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(() => Promise.resolve(null)),
  setItem: jest.fn(() => Promise.resolve()),
  removeItem: jest.fn(() => Promise.resolve()),
  clear: jest.fn(() => Promise.resolve()),
}));

jest.mock('firebase/auth', () => {
  const credentialFn = jest.fn((email: string, password: string) => ({
    email,
    password,
    providerId: 'password',
  }));

  return {
    EmailAuthProvider: {
      credential: credentialFn,
    },
    reauthenticateWithCredential: jest.fn(),
    updatePassword: jest.fn(),
    sendPasswordResetEmail: jest.fn(),
    sendEmailVerification: jest.fn(() => Promise.resolve()),
    createUserWithEmailAndPassword: jest.fn((auth, email, password) => {
      const createdUser = {
        uid: 'user-new-id',
        email,
        displayName: null,
        emailVerified: false,
        reload: jest.fn(() => Promise.resolve()),
      };
      return Promise.resolve({ user: createdUser });
    }),
    signOut: jest.fn(),
    onAuthStateChanged: jest.fn(() => jest.fn()),
    updateProfile: jest.fn(() => Promise.resolve()),
  };
});

describe('Auth Password Flows: Unit & Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCurrentUser = {
      uid: 'user-123',
      email: 'gardener@leaflink.com',
      displayName: 'Gardener Jane',
      emailVerified: false,
      reload: jest.fn(() => Promise.resolve()),
    };
    useSession.setState({
      user: {
        uid: mockCurrentUser.uid,
        email: mockCurrentUser.email,
        displayName: mockCurrentUser.displayName,
        emailVerified: false,
      },
      isEmailVerified: false,
    });
  });

  describe('Change Password Flow', () => {
    it('validates current password, new password length, and matching confirmation', () => {
      const missingCurrent = changePasswordWithCurrentSchema.safeParse({
        currentPassword: '',
        newPassword: 'validPassword123',
        confirmPassword: 'validPassword123',
      });
      expect(missingCurrent.success).toBe(false);

      const mismatched = changePasswordWithCurrentSchema.safeParse({
        currentPassword: 'currentPassword123',
        newPassword: 'newPassword123',
        confirmPassword: 'differentPassword123',
      });
      expect(mismatched.success).toBe(false);

      const valid = changePasswordWithCurrentSchema.safeParse({
        currentPassword: 'currentPassword123',
        newPassword: 'newPassword123',
        confirmPassword: 'newPassword123',
      });
      expect(valid.success).toBe(true);
    });

    it('calls EmailAuthProvider.credential and reauthenticateWithCredential BEFORE updatePassword', async () => {
      const callOrder: string[] = [];

      (EmailAuthProvider.credential as jest.Mock).mockImplementation((email, pass) => {
        callOrder.push('credential');
        return { email, pass };
      });

      (reauthenticateWithCredential as jest.Mock).mockImplementation(() => {
        callOrder.push('reauthenticate');
        return Promise.resolve();
      });

      (updatePassword as jest.Mock).mockImplementation(() => {
        callOrder.push('updatePassword');
        return Promise.resolve();
      });

      await useSession.getState().updateUserPassword('currentPass123', 'newPass123');

      expect(EmailAuthProvider.credential).toHaveBeenCalledWith(
        'gardener@leaflink.com',
        'currentPass123'
      );
      expect(reauthenticateWithCredential).toHaveBeenCalledWith(
        mockCurrentUser,
        { email: 'gardener@leaflink.com', pass: 'currentPass123' }
      );
      expect(updatePassword).toHaveBeenCalledWith(mockCurrentUser, 'newPass123');
      expect(callOrder).toEqual(['credential', 'reauthenticate', 'updatePassword']);
    });

    it('surfaces an error and halts execution without calling updatePassword when current password is wrong', async () => {
      const authError = {
        code: 'auth/wrong-password',
        message: 'The password is invalid.',
      };

      (reauthenticateWithCredential as jest.Mock).mockRejectedValueOnce(authError);

      let caughtError: any = null;
      try {
        await useSession.getState().updateUserPassword('wrongPass', 'newPass123');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toEqual(authError);
      expect(updatePassword).not.toHaveBeenCalled();

      // Verify the error maps to the exact required inline error message
      const inlineError = mapChangePasswordError(caughtError);
      expect(inlineError).toBe('Current password is incorrect.');
    });

    it('surfaces an error when reauthentication fails with auth/invalid-credential', async () => {
      const authError = {
        code: 'auth/invalid-credential',
        message: 'Invalid credentials provided.',
      };

      (reauthenticateWithCredential as jest.Mock).mockRejectedValueOnce(authError);

      let caughtError: any = null;
      try {
        await useSession.getState().updateUserPassword('badCreds', 'newPass123');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toEqual(authError);
      expect(updatePassword).not.toHaveBeenCalled();
      expect(mapChangePasswordError(caughtError)).toBe('Current password is incorrect.');
    });

    it('maps auth/requires-recent-login gracefully if session expires', async () => {
      const authError = {
        code: 'auth/requires-recent-login',
        message: 'This operation requires recent login.',
      };

      (reauthenticateWithCredential as jest.Mock).mockRejectedValueOnce(authError);

      try {
        await useSession.getState().updateUserPassword('pass123', 'newPass123');
      } catch (err) {
        expect(mapChangePasswordError(err)).toBe(
          'For security reasons, please log out and sign back in before modifying your password.'
        );
      }
    });
  });

  describe('Forgot Password Flow', () => {
    it('validates email input format and trims input', () => {
      const emptyCheck = validateEmail('', false);
      expect(emptyCheck.valid).toBe(false);

      const invalidCheck = validateEmail('not-an-email', false);
      expect(invalidCheck.valid).toBe(false);

      const trimmedCheck = validateEmail('   gardener@leaflink.com   ', false);
      expect(trimmedCheck.valid).toBe(true);
      expect(trimmedCheck.value).toBe('gardener@leaflink.com');
    });

    it('calls sendPasswordResetEmail with trimmed email and confirms state', async () => {
      (sendPasswordResetEmail as jest.Mock).mockResolvedValueOnce(undefined);

      const rawEmail = '   gardener@leaflink.com   ';
      const validation = validateEmail(rawEmail, false);
      expect(validation.valid).toBe(true);

      const trimmed = rawEmail.trim();
      await useSession.getState().sendPasswordResetEmail(trimmed);

      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        expect.anything(),
        'gardener@leaflink.com'
      );

      // Verify non-enumerating confirmation message
      expect(PASSWORD_RESET_CONFIRMATION_MESSAGE).toBe(
        'If an account exists for that email, a password reset link has been sent.'
      );
    });

    it('returns non-enumerating confirmation state even when user-not-found is returned', async () => {
      const userNotFoundErr = { code: 'auth/user-not-found' };
      (sendPasswordResetEmail as jest.Mock).mockRejectedValueOnce(userNotFoundErr);

      let caughtErr: any = null;
      try {
        await useSession.getState().sendPasswordResetEmail('unknown@leaflink.com');
      } catch (err) {
        caughtErr = err;
      }

      const displayMessage = mapPasswordResetError(caughtErr);
      expect(displayMessage).toBe(
        'If an account exists for that email, a password reset link has been sent.'
      );
    });

    it('handles rate-limiting (auth/too-many-requests) with plain-language feedback', () => {
      const rateLimitErr = { code: 'auth/too-many-requests' };
      const displayMessage = mapPasswordResetError(rateLimitErr);
      expect(displayMessage).toBe('Too many unsuccessful attempts. Please try again later.');
    });

    it('handles network failure (auth/network-request-failed) with plain-language feedback', () => {
      const networkErr = { code: 'auth/network-request-failed' };
      const displayMessage = mapPasswordResetError(networkErr);
      expect(displayMessage).toBe(
        'Network error. Please check your internet connection and try again.'
      );
    });

    it('handles invalid email (auth/invalid-email) with plain-language feedback', () => {
      const invalidEmailErr = { code: 'auth/invalid-email' };
      const displayMessage = mapPasswordResetError(invalidEmailErr);
      expect(displayMessage).toBe('Please enter a valid email address.');
    });
  });

  describe('Email Verification Flow', () => {
    describe('Registration Email Verification', () => {
      it('calls sendEmailVerification after successful createUserWithEmailAndPassword on registration', async () => {
        const registrationData = {
          name: 'Flora Green',
          email: 'flora@leaflink.com',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        };

        const resultUser = await registerUserWithEmail(registrationData);

        expect(createUserWithEmailAndPassword).toHaveBeenCalledWith(
          expect.anything(),
          'flora@leaflink.com',
          'Password123!'
        );
        expect(sendEmailVerification).toHaveBeenCalledWith(resultUser);
      });

      it('treats transient sendEmailVerification failure as non-fatal on registration', async () => {
        (sendEmailVerification as jest.Mock).mockRejectedValueOnce(
          new Error('Transient network timeout sending verification email')
        );

        const registrationData = {
          name: 'Flora Green',
          email: 'flora@leaflink.com',
          password: 'Password123!',
          confirmPassword: 'Password123!',
        };

        // Must resolve without throwing, despite sendEmailVerification transient rejection
        const resultUser = await registerUserWithEmail(registrationData);

        expect(createUserWithEmailAndPassword).toHaveBeenCalled();
        expect(sendEmailVerification).toHaveBeenCalledWith(resultUser);
        expect(resultUser.email).toBe('flora@leaflink.com');
      });
    });

    describe('resendVerificationEmail Action', () => {
      it('calls sendEmailVerification for current user', async () => {
        await useSession.getState().resendVerificationEmail();

        expect(sendEmailVerification).toHaveBeenCalledWith(mockCurrentUser);
      });

      it('throws error when no authenticated user session exists', async () => {
        const savedUser = mockCurrentUser;
        mockCurrentUser = null;

        await expect(useSession.getState().resendVerificationEmail()).rejects.toThrow(
          'No authenticated user session'
        );

        mockCurrentUser = savedUser;
      });
    });

    describe('refreshEmailVerification Action', () => {
      it('calls reload() on currentUser and updates isEmailVerified in session store when verified', async () => {
        expect(useSession.getState().isEmailVerified).toBe(false);

        if (mockCurrentUser) {
          mockCurrentUser.emailVerified = true;
        }

        const verified = await useSession.getState().refreshEmailVerification();

        expect(mockCurrentUser?.reload).toHaveBeenCalled();
        expect(verified).toBe(true);
        expect(useSession.getState().isEmailVerified).toBe(true);
      });

      it('reloads current user and preserves isEmailVerified as false when unverified', async () => {
        if (mockCurrentUser) {
          mockCurrentUser.emailVerified = false;
        }

        const verified = await useSession.getState().refreshEmailVerification();

        expect(mockCurrentUser?.reload).toHaveBeenCalled();
        expect(verified).toBe(false);
        expect(useSession.getState().isEmailVerified).toBe(false);
      });

      it('throws error when no authenticated user session exists', async () => {
        const savedUser = mockCurrentUser;
        mockCurrentUser = null;

        await expect(useSession.getState().refreshEmailVerification()).rejects.toThrow(
          'No authenticated user session'
        );

        mockCurrentUser = savedUser;
      });
    });
  });
});
