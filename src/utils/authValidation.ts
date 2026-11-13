import { z } from 'zod';

export interface ValidationResult {
  valid: boolean;
  error: string | null;
  value?: string;
}

/**
 * Validates an email address.
 * 
 * Rules:
 * - Trims surrounding whitespace before validation.
 * - Local part and password preserved verbatim.
 * - Missing or multiple '@' signs rejected.
 * - Internal whitespace in local or domain rejected.
 * - Domain must have at least two labels separated by dots (e.g. example.com).
 * - Empty domain labels (e.g. example..com) rejected.
 * - Leading or trailing hyphens in domain labels rejected.
 * - Plus addressing allowed (e.g. name+plants@example.co.uk).
 * - For registration only (isRegistration = true):
 *   Compares the last two domain labels case-insensitively and rejects repeated endings
 *   (e.g. test@gmail.com.com or test@gmail.COM.com) with:
 *   "Check the end of your email address. It looks like .<tld> was entered twice."
 */
export function validateEmail(
  rawEmail: string,
  isRegistration: boolean = false
): ValidationResult {
  if (!rawEmail || typeof rawEmail !== 'string') {
    return { valid: false, error: 'Email address is required' };
  }

  const email = rawEmail.trim();

  if (email.length === 0) {
    return { valid: false, error: 'Email address is required' };
  }

  // Reject internal whitespace
  if (/\s/.test(email)) {
    return { valid: false, error: 'Email address cannot contain spaces' };
  }

  // Check '@' symbol occurrences
  const atParts = email.split('@');
  if (atParts.length === 1) {
    return { valid: false, error: "Please include an '@' in the email address" };
  }
  if (atParts.length > 2) {
    return { valid: false, error: "Email address can only contain one '@' symbol" };
  }

  const [localPart, domainPart] = atParts;

  if (!localPart || localPart.length === 0) {
    return { valid: false, error: "Please enter the part of your email before '@'" };
  }

  if (!domainPart || domainPart.length === 0) {
    return { valid: false, error: "Please enter a domain after '@'" };
  }

  // Local part character validation (allows standard RFC 5322 characters including +)
  const localPartRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/;
  if (!localPartRegex.test(localPart)) {
    return { valid: false, error: 'Email address contains invalid characters before the @' };
  }

  // Domain structure checks
  if (domainPart.startsWith('.') || domainPart.endsWith('.')) {
    return { valid: false, error: 'Email domain cannot begin or end with a dot' };
  }

  const domainLabels = domainPart.split('.');
  if (domainLabels.length < 2) {
    return { valid: false, error: 'Email address must include a valid top-level domain (e.g. .com)' };
  }

  // Check for empty domain labels (e.g. example..com)
  for (const label of domainLabels) {
    if (label.length === 0) {
      return { valid: false, error: 'Email domain contains an empty section between dots' };
    }
    // Check leading or trailing hyphens in domain labels
    if (label.startsWith('-') || label.endsWith('-')) {
      return { valid: false, error: 'Domain sections cannot begin or end with a hyphen' };
    }
    // Check for valid domain label characters (alphanumeric and hyphens)
    if (!/^[a-zA-Z0-9-]+$/.test(label)) {
      return { valid: false, error: 'Domain name contains invalid characters' };
    }
  }

  // Top level domain (last label) must be at least 2 characters (e.g. .co, .com, .local)
  const lastLabel = domainLabels[domainLabels.length - 1];
  if (!/^[a-zA-Z]{2,}$/.test(lastLabel)) {
    return { valid: false, error: 'Email domain has an invalid top-level domain extension' };
  }

  // Repeated ending check (only applied on registration)
  if (isRegistration) {
    const secondLastLabel = domainLabels[domainLabels.length - 2];
    if (lastLabel.toLowerCase() === secondLastLabel.toLowerCase()) {
      return {
        valid: false,
        error: `Check the end of your email address. It looks like .${lastLabel.toLowerCase()} was entered twice.`,
      };
    }
  }

  return { valid: true, error: null, value: email };
}

/**
 * Validates a display name.
 * 
 * Rules:
 * - Trim display names before checking for blank input.
 * - Minimum 2 characters.
 * - Supports Unicode letters, spaces, hyphens, and apostrophes.
 */
export function validateDisplayName(rawName: string): ValidationResult {
  if (!rawName || typeof rawName !== 'string') {
    return { valid: false, error: 'Name must be at least 2 characters' };
  }

  const trimmed = rawName.trim();
  if (trimmed.length < 2) {
    return { valid: false, error: 'Name must be at least 2 characters' };
  }

  // Support Unicode letters (\p{L}), marks/accents (\p{M}), spaces (\s), hyphens (-), and apostrophes (')
  const nameRegex = /^[\p{L}\p{M}\s'-]{2,}$/u;
  if (!nameRegex.test(trimmed)) {
    return {
      valid: false,
      error: 'Name may only contain letters, spaces, hyphens, and apostrophes',
    };
  }

  return { valid: true, error: null, value: trimmed };
}

/**
 * Firebase Auth error mapper to plain-language, privacy-respecting messages.
 * Uses the same sign-in message for unknown accounts and wrong passwords to prevent enumeration.
 */
export function mapAuthError(
  error: unknown,
  fallback: string = 'An unexpected error occurred. Please try again.'
): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : typeof error === 'string'
        ? error
        : '';

  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
      return 'Invalid email or password. Please check your credentials and try again.';
    case 'auth/email-already-in-use':
      return 'An account with this email address already exists. Please sign in instead.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password is too weak. Please use at least 6 characters.';
    case 'auth/network-request-failed':
      return 'Network error. Please check your internet connection and try again.';
    case 'auth/too-many-requests':
      return 'Too many unsuccessful attempts. Please try again later.';
    case 'auth/user-disabled':
      return 'This user account has been disabled. Please contact support.';
    case 'auth/requires-recent-login':
      return 'For security reasons, please log out and sign back in before modifying your password.';
    default:
      if (
        typeof error === 'object' &&
        error !== null &&
        'message' in error &&
        typeof (error as { message?: unknown }).message === 'string'
      ) {
        return (error as { message: string }).message;
      }
      return fallback;
  }
}

/**
 * Zod schema for login form.
 * Applies basic email and required-field checks; preserves compatibility with existing accounts.
 */
export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email address is required')
    .superRefine((val, ctx) => {
      const res = validateEmail(val, false);
      if (!res.valid) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: res.error || 'Please enter a valid email address',
        });
      }
    }),
  password: z.string().min(1, 'Password is required'),
});

export type LoginFormData = z.infer<typeof loginSchema>;

/**
 * Zod schema for registration form.
 * Applies strict domain validation, repeated-ending checks, Unicode name rules, and matching passwords.
 */
export const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, 'Name is required')
      .superRefine((val, ctx) => {
        const res = validateDisplayName(val);
        if (!res.valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: res.error || 'Please enter a valid name',
          });
        }
      }),
    email: z
      .string()
      .min(1, 'Email address is required')
      .superRefine((val, ctx) => {
        const res = validateEmail(val, true);
        if (!res.valid) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: res.error || 'Please enter a valid email address',
          });
        }
      }),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterFormData = z.infer<typeof registerSchema>;

/**
 * Zod schema for settings change password form.
 */
export const changePasswordSchema = z
  .object({
    newPassword: z.string().min(6, 'New password must be at least 6 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your new password'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;
