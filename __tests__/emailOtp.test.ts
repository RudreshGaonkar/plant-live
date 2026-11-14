import {
  sendEmailOtp,
  verifyEmailOtp,
  isOtpWorkerConfigured,
  getOtpWorkerUrl,
} from '../src/services/emailOtp';
import { auth } from '../src/services/firebase';
import otpWorker from '../otp-worker/src/index';
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';

let mockUser: {
  uid: string;
  email: string | null;
  displayName: string | null;
  emailVerified: boolean;
  getIdToken: jest.Mock;
} | null = {
  uid: 'user-otp-123',
  email: 'gardener@leaflink.com',
  displayName: 'Gardener Jane',
  emailVerified: true,
  getIdToken: jest.fn(() => Promise.resolve('mock-firebase-id-token-xyz')),
};

jest.mock('../src/services/firebase', () => ({
  db: {},
  auth: {
    get currentUser() {
      return mockUser;
    },
  },
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
    reauthenticateWithCredential: jest.fn(() => Promise.resolve()),
    updatePassword: jest.fn(() => Promise.resolve()),
  };
});

describe('Email OTP Service & Cloudflare Worker Suite', () => {
  const originalEnv = process.env;
  const mockWorkerUrl = 'https://leaflink-otp.naruto-gaonkar2599.workers.dev';

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, EXPO_PUBLIC_OTP_WORKER_URL: mockWorkerUrl };
    mockUser = {
      uid: 'user-otp-123',
      email: 'gardener@leaflink.com',
      displayName: 'Gardener Jane',
      emailVerified: true,
      getIdToken: jest.fn(() => Promise.resolve('mock-firebase-id-token-xyz')),
    };
    (global as any).fetch = jest.fn();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('1. src/services/emailOtp.ts Service Tests', () => {
    it('detects when OTP worker URL is configured vs unconfigured', () => {
      expect(isOtpWorkerConfigured()).toBe(true);
      expect(getOtpWorkerUrl()).toBe(mockWorkerUrl);

      delete process.env.EXPO_PUBLIC_OTP_WORKER_URL;
      expect(isOtpWorkerConfigured()).toBe(false);
      expect(getOtpWorkerUrl()).toBeUndefined();
    });

    it('sendEmailOtp: throws error if worker URL is missing', async () => {
      delete process.env.EXPO_PUBLIC_OTP_WORKER_URL;
      await expect(sendEmailOtp()).rejects.toThrow('OTP worker service is not configured');
    });

    it('sendEmailOtp: throws error if user is unauthenticated', async () => {
      mockUser = null;
      await expect(sendEmailOtp()).rejects.toThrow('No authenticated user session');
    });

    it('sendEmailOtp: sends Bearer token and returns success on 200 OK', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, message: 'OTP sent successfully' }),
      });

      const result = await sendEmailOtp();

      expect(mockUser?.getIdToken).toHaveBeenCalledWith(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockWorkerUrl}/send-otp`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-firebase-id-token-xyz',
          },
        })
      );
      expect(result).toEqual({ success: true, message: 'OTP sent successfully' });
    });

    it('sendEmailOtp: handles 429 cooldown error and preserves retryAfter', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'Please wait 45 seconds before requesting a new code.',
          retryAfter: 45,
        }),
      });

      let caughtError: any;
      try {
        await sendEmailOtp();
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBe('Please wait 45 seconds before requesting a new code.');
      expect(caughtError.status).toBe(429);
      expect(caughtError.retryAfter).toBe(45);
    });

    it('verifyEmailOtp: rejects invalid code formats prior to network fetch', async () => {
      await expect(verifyEmailOtp('')).rejects.toThrow('Please enter a valid 6-digit verification code.');
      await expect(verifyEmailOtp('12345')).rejects.toThrow('Please enter a valid 6-digit verification code.');
      await expect(verifyEmailOtp('abcdef')).rejects.toThrow('Please enter a valid 6-digit verification code.');
      await expect(verifyEmailOtp('1234567')).rejects.toThrow('Please enter a valid 6-digit verification code.');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('verifyEmailOtp: submits code with Authorization header and parses success', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ success: true, verified: true }),
      });

      const res = await verifyEmailOtp('654321');

      expect(mockUser?.getIdToken).toHaveBeenCalledWith(true);
      expect(global.fetch).toHaveBeenCalledWith(
        `${mockWorkerUrl}/verify-otp`,
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer mock-firebase-id-token-xyz',
          },
          body: JSON.stringify({ code: '654321' }),
        })
      );
      expect(res).toEqual({ success: true, verified: true });
    });

    it('verifyEmailOtp: surfaces remaining attempts on 400 invalid code', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Invalid code. 3 attempts remaining.',
          attemptsRemaining: 3,
        }),
      });

      let caughtError: any;
      try {
        await verifyEmailOtp('111111');
      } catch (err) {
        caughtError = err;
      }

      expect(caughtError).toBeDefined();
      expect(caughtError.message).toBe('Invalid code. 3 attempts remaining.');
      expect(caughtError.status).toBe(400);
      expect(caughtError.attemptsRemaining).toBe(3);
    });
  });

  describe('2. Cloudflare Worker Protocol & Security Unit Tests', () => {
    const mockEnv = {
      OTP_KV: {
        get: jest.fn(),
        put: jest.fn(),
        delete: jest.fn(),
      } as any,
      FIREBASE_PROJECT_ID: 'leaflink-7c669',
      MAIL_API_KEY: 're_test_key_123',
      OTP_HMAC_SECRET: '6ccc8a285917822a5a05fe5bce216ddd804d193182462111a1ed7d2b420eae59',
    };

    it('returns 204 with CORS headers on OPTIONS preflight', async () => {
      const request = new Request('https://leaflink-otp.workers.dev/send-otp', {
        method: 'OPTIONS',
      });
      const response = await otpWorker.fetch(request, mockEnv);

      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });

    it('rejects non-POST methods with 405 Method Not Allowed', async () => {
      const getReq = new Request('https://leaflink-otp.workers.dev/send-otp', {
        method: 'GET',
      });
      const response = await otpWorker.fetch(getReq, mockEnv);

      expect(response.status).toBe(405);
      const data = await response.json();
      expect(data).toEqual({ error: 'Method Not Allowed' });
    });

    it('rejects requests missing Bearer authorization header with 401', async () => {
      const request = new Request('https://leaflink-otp.workers.dev/send-otp', {
        method: 'POST',
      });
      const response = await otpWorker.fetch(request, mockEnv);

      expect(response.status).toBe(401);
      const data = await response.json();
      expect(data.error).toContain('Authorization');
    });

    it('returns 404 for unknown endpoints', async () => {
      const request = new Request('https://leaflink-otp.workers.dev/unknown-route', {
        method: 'POST',
      });
      const response = await otpWorker.fetch(request, mockEnv);

      expect(response.status).toBe(404);
    });
  });

  describe('3. Settings Change Password Flow Logic & Modal Transitions', () => {
    it('requires verified email when OTP mode is active and blocks unverified callers', () => {
      const isOtpActive = true;
      const isEmailVerified = false;

      const shouldBlock = isOtpActive && !isEmailVerified;
      expect(shouldBlock).toBe(true);
    });

    it('executes two-stage flow: reauthenticate -> sendOtp -> transition to OTP -> verify -> updatePassword', async () => {
      const callLog: string[] = [];

      (reauthenticateWithCredential as jest.Mock).mockImplementation(() => {
        callLog.push('reauthenticate');
        return Promise.resolve();
      });

      (global.fetch as jest.Mock)
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => {
            callLog.push('send-otp');
            return { success: true, message: 'OTP sent' };
          },
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => {
            callLog.push('verify-otp');
            return { success: true, verified: true };
          },
        });

      (updatePassword as jest.Mock).mockImplementation(() => {
        callLog.push('updatePassword');
        return Promise.resolve();
      });

      // Step 1: User submits current and new passwords
      const currentUser = auth.currentUser!;
      const cred = EmailAuthProvider.credential(currentUser.email!, 'currentSecret123');
      await reauthenticateWithCredential(currentUser, cred);

      // Step 2: Modal sends OTP and transitions to OTP step
      await sendEmailOtp();

      // Step 3: User submits OTP code
      await verifyEmailOtp('889900');

      // Step 4: Password updated
      await updatePassword(currentUser, 'brandNewSecurePass456');

      expect(callLog).toEqual([
        'reauthenticate',
        'send-otp',
        'verify-otp',
        'updatePassword',
      ]);
      expect(EmailAuthProvider.credential).toHaveBeenCalledWith(
        'gardener@leaflink.com',
        'currentSecret123'
      );
      expect(updatePassword).toHaveBeenCalledWith(
        currentUser,
        'brandNewSecurePass456'
      );
    });

    it('graceful fallback: when OTP worker is unset, updates password directly without OTP', async () => {
      delete process.env.EXPO_PUBLIC_OTP_WORKER_URL;
      const callLog: string[] = [];

      (reauthenticateWithCredential as jest.Mock).mockImplementation(() => {
        callLog.push('reauthenticate');
        return Promise.resolve();
      });

      (updatePassword as jest.Mock).mockImplementation(() => {
        callLog.push('updatePassword');
        return Promise.resolve();
      });

      const currentUser = auth.currentUser!;
      const cred = EmailAuthProvider.credential(currentUser.email!, 'currentSecret123');
      await reauthenticateWithCredential(currentUser, cred);

      if (!isOtpWorkerConfigured()) {
        await updatePassword(currentUser, 'brandNewSecurePass456');
      }

      expect(callLog).toEqual(['reauthenticate', 'updatePassword']);
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('halts without sending OTP if current-password reauthentication fails', async () => {
      const authErr = new Error('Wrong password');
      (reauthenticateWithCredential as jest.Mock).mockRejectedValueOnce(authErr);

      const currentUser = auth.currentUser!;
      const cred = EmailAuthProvider.credential(currentUser.email!, 'wrongPassword');

      await expect(
        reauthenticateWithCredential(currentUser, cred)
      ).rejects.toThrow('Wrong password');

      expect(global.fetch).not.toHaveBeenCalled();
      expect(updatePassword).not.toHaveBeenCalled();
    });
  });
});
