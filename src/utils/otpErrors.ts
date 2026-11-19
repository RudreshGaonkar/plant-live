const positiveInteger = (value: unknown, max: number): number | undefined =>
  typeof value === 'number' && Number.isInteger(value) && value > 0 && value <= max ? value : undefined;

export function otpErrorMetadata(data: { retryAfter?: unknown; attemptsRemaining?: unknown }) {
  return { retryAfter: positiveInteger(data.retryAfter, 60), attemptsRemaining: positiveInteger(data.attemptsRemaining, 4) };
}

export function mapOtpError(error: unknown, fallback: string): string {
  if (!error || typeof error !== 'object') return fallback;
  const e = error as { code?: unknown; status?: unknown; retryAfter?: unknown; attemptsRemaining?: unknown };
  const meta = otpErrorMetadata(e);
  if (e.status === 429 && meta.retryAfter) return `Please wait ${meta.retryAfter} seconds before requesting a new code.`;
  if (e.code === 'OTP_INVALID' && meta.attemptsRemaining) return `Invalid code. ${meta.attemptsRemaining} attempt${meta.attemptsRemaining === 1 ? '' : 's'} remaining.`;
  const messages: Record<string, string> = {
    OTP_DELIVERY_FAILED: 'Unable to send the verification code. Please try again later.',
    OTP_EXPIRED: 'Verification code expired or not found. Please request a new one.',
    OTP_INVALID: 'Please enter a valid 6-digit verification code.',
    OTP_ATTEMPTS_EXCEEDED: 'Too many invalid attempts. Please request a new code.',
    OTP_AUTH_REQUIRED: 'Please sign in again with a verified email address.',
  };
  return typeof e.code === 'string' ? messages[e.code] || fallback : fallback;
}
