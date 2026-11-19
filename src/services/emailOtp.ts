import { mapOtpError, otpErrorMetadata } from '@/utils/otpErrors';
import { auth } from '@/services/firebase';

export interface SendOtpResult {
  success: boolean;
  message?: string;
  retryAfter?: number;
}

export interface VerifyOtpResult {
  success: boolean;
  verified?: boolean;
  attemptsRemaining?: number;
}

export function getOtpWorkerUrl(): string | undefined {
  return process.env.EXPO_PUBLIC_OTP_WORKER_URL?.trim();
}

export function isOtpWorkerConfigured(): boolean {
  const url = getOtpWorkerUrl();
  return Boolean(url && url.length > 0);
}

/**
 * Sends a 6-digit OTP verification code to the current signed-in user's verified email.
 * Includes fresh Firebase ID token in Authorization header.
 */
export async function sendEmailOtp(): Promise<SendOtpResult> {
  const baseUrl = getOtpWorkerUrl();
  if (!baseUrl) {
    throw new Error('OTP worker service is not configured');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('No authenticated user session');
  }

  const token = await currentUser.getIdToken(true);
  const cleanBase = baseUrl.replace(/\/+$/, '');

  const response = await fetch(`${cleanBase}/send-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const metadata = otpErrorMetadata(data || {});
    const details = { code: data?.code, status: response.status, ...metadata };
    const error = Object.assign(new Error(mapOtpError(details, 'Failed to send verification code. Please try again.')), details);
    throw error;
  }

  return data;
}

/**
 * Verifies a 6-digit OTP code against the Cloudflare Worker KV store.
 */
export async function verifyEmailOtp(code: string): Promise<VerifyOtpResult> {
  const baseUrl = getOtpWorkerUrl();
  if (!baseUrl) {
    throw new Error('OTP worker service is not configured');
  }

  const trimmedCode = code.trim();
  if (!trimmedCode || !/^\d{6}$/.test(trimmedCode)) {
    throw new Error('Please enter a valid 6-digit verification code.');
  }

  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error('No authenticated user session');
  }

  const token = await currentUser.getIdToken(true);
  const cleanBase = baseUrl.replace(/\/+$/, '');

  const response = await fetch(`${cleanBase}/verify-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code: trimmedCode }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const metadata = otpErrorMetadata(data || {});
    const details = { code: data?.code, status: response.status, ...metadata };
    const error = Object.assign(new Error(mapOtpError(details, 'Verification failed. Please try again.')), details);
    throw error;
  }

  return data;
}
