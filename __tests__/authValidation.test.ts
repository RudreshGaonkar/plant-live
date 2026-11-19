import {
  validateEmail,
  validateDisplayName,
  mapAuthError,
  loginSchema,
  registerSchema,
  changePasswordSchema,
  changePasswordWithCurrentSchema,
  mapChangePasswordError,
  forgotPasswordSchema,
  mapPasswordResetError,
  PASSWORD_RESET_CONFIRMATION_MESSAGE,
} from '../src/utils/authValidation';

describe('authValidation', () => {
  describe('validateEmail', () => {
    it('rejects repeated domain endings on registration', () => {
      const res1 = validateEmail('test@gmail.com.com', true);
      expect(res1.valid).toBe(false);
      expect(res1.error).toBe(
        'Check the end of your email address. It looks like .com was entered twice.'
      );

      const res2 = validateEmail('test@gmail.COM.com', true);
      expect(res2.valid).toBe(false);
      expect(res2.error).toBe(
        'Check the end of your email address. It looks like .com was entered twice.'
      );

      const res3 = validateEmail('gardener@plant.org.org', true);
      expect(res3.valid).toBe(false);
      expect(res3.error).toBe(
        'Check the end of your email address. It looks like .org was entered twice.'
      );
    });

    it('allows repeated endings on sign-in for backward compatibility', () => {
      const res = validateEmail('test@gmail.com.com', false);
      expect(res.valid).toBe(true);
    });

    it('accepts multi-part endings and plus addressing', () => {
      const res1 = validateEmail('name+plants@example.co.uk', true);
      expect(res1.valid).toBe(true);

      const res2 = validateEmail('user.name+tag@sub.domain.org', true);
      expect(res2.valid).toBe(true);

      const res3 = validateEmail('gardener@leaflink.local', false);
      expect(res3.valid).toBe(true);
    });

    it('trims surrounding whitespace before validating', () => {
      const res = validateEmail('   gardener@example.com   ', true);
      expect(res.valid).toBe(true);
      expect(res.value).toBe('gardener@example.com');
    });

    it('rejects internal whitespace', () => {
      const res1 = validateEmail('user name@example.com', true);
      expect(res1.valid).toBe(false);
      expect(res1.error).toBe('Email address cannot contain spaces');

      const res2 = validateEmail('username@exam ple.com', true);
      expect(res2.valid).toBe(false);
      expect(res2.error).toBe('Email address cannot contain spaces');
    });

    it('rejects missing or multiple @ signs', () => {
      const res1 = validateEmail('userexample.com', true);
      expect(res1.valid).toBe(false);
      expect(res1.error).toBe("Please include an '@' in the email address");

      const res2 = validateEmail('user@@example.com', true);
      expect(res2.valid).toBe(false);
      expect(res2.error).toBe("Email address can only contain one '@' symbol");
    });

    it('rejects empty local or domain parts', () => {
      const res1 = validateEmail('@example.com', true);
      expect(res1.valid).toBe(false);

      const res2 = validateEmail('user@', true);
      expect(res2.valid).toBe(false);
    });

    it('rejects empty domain labels and leading/trailing hyphens', () => {
      const res1 = validateEmail('user@example..com', true);
      expect(res1.valid).toBe(false);
      expect(res1.error).toBe('Email domain contains an empty section between dots');

      const res2 = validateEmail('user@-example.com', true);
      expect(res2.valid).toBe(false);
      expect(res2.error).toBe('Domain sections cannot begin or end with a hyphen');

      const res3 = validateEmail('user@example-.com', true);
      expect(res3.valid).toBe(false);
      expect(res3.error).toBe('Domain sections cannot begin or end with a hyphen');
    });
  });

  describe('validateDisplayName', () => {
    it('accepts valid names including Unicode, spaces, hyphens, and apostrophes', () => {
      expect(validateDisplayName('Jane Doe').valid).toBe(true);
      expect(validateDisplayName("Mary-Jane O'Connor").valid).toBe(true);
      expect(validateDisplayName('René François').valid).toBe(true);
      expect(validateDisplayName('田中太郎').valid).toBe(true);
      expect(validateDisplayName('Al').valid).toBe(true);
    });

    it('rejects names shorter than 2 characters after trimming', () => {
      expect(validateDisplayName('A').valid).toBe(false);
      expect(validateDisplayName('  A  ').valid).toBe(false);
      expect(validateDisplayName('   ').valid).toBe(false);
      expect(validateDisplayName('').valid).toBe(false);
    });

    it('rejects invalid characters (e.g. symbols, numbers)', () => {
      expect(validateDisplayName('User123').valid).toBe(false);
      expect(validateDisplayName('Plant$$$').valid).toBe(false);
    });
  });

  describe('mapAuthError', () => {
    it('maps unknown accounts and wrong passwords to the same message', () => {
      const userNotFound = mapAuthError({ code: 'auth/user-not-found' });
      const wrongPassword = mapAuthError({ code: 'auth/wrong-password' });
      const invalidCred = mapAuthError({ code: 'auth/invalid-credential' });
      const invalidLogin = mapAuthError({ code: 'auth/invalid-login-credentials' });

      expect(userNotFound).toBe(wrongPassword);
      expect(userNotFound).toBe(invalidCred);
      expect(userNotFound).toBe(invalidLogin);
      expect(userNotFound).toBe(
        'Invalid email or password. Please check your credentials and try again.'
      );
    });

    it('maps other known Firebase error codes gracefully', () => {
      expect(mapAuthError({ code: 'auth/email-already-in-use' })).toContain(
        'already exists'
      );
      expect(mapAuthError({ code: 'auth/network-request-failed' })).toContain(
        'Network error'
      );
    });
  });

  describe('Zod schemas', () => {
    it('loginSchema validates successfully with valid user credentials', () => {
      const parseResult = loginSchema.safeParse({
        email: 'gardener@leaflink.com',
        password: 'leaflink123',
      });
      expect(parseResult.success).toBe(true);
    });

    it('registerSchema rejects repeated endings', () => {
      const parseResult = registerSchema.safeParse({
        name: 'Gardener Jane',
        email: 'jane@example.com.com',
        password: 'securepassword123',
        confirmPassword: 'securepassword123',
      });
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        expect(parseResult.error.issues[0].message).toContain('was entered twice');
      }
    });

    it('registerSchema requires passwords to match', () => {
      const parseResult = registerSchema.safeParse({
        name: 'Gardener Jane',
        email: 'jane@example.com',
        password: 'securepassword123',
        confirmPassword: 'differentpassword',
      });
      expect(parseResult.success).toBe(false);
      if (!parseResult.success) {
        expect(parseResult.error.issues[0].message).toBe('Passwords do not match');
      }
    });

    it('changePasswordSchema validates password matching and minimum length', () => {
      const failShort = changePasswordSchema.safeParse({
        newPassword: '123',
        confirmPassword: '123',
      });
      expect(failShort.success).toBe(false);

      const failMismatch = changePasswordSchema.safeParse({
        newPassword: 'newpassword123',
        confirmPassword: 'different123',
      });
      expect(failMismatch.success).toBe(false);

      const pass = changePasswordSchema.safeParse({
        newPassword: 'newpassword123',
        confirmPassword: 'newpassword123',
      });
      expect(pass.success).toBe(true);
    });

    it('changePasswordWithCurrentSchema requires current password, minimum length, and matching passwords', () => {
      const missingCurrent = changePasswordWithCurrentSchema.safeParse({
        currentPassword: '',
        newPassword: 'newpassword123',
        confirmPassword: 'newpassword123',
      });
      expect(missingCurrent.success).toBe(false);
      if (!missingCurrent.success) {
        expect(missingCurrent.error.issues[0].message).toBe('Current password is required');
      }

      const invalidLength = changePasswordWithCurrentSchema.safeParse({
        currentPassword: 'oldpassword123',
        newPassword: 'short',
        confirmPassword: 'short',
      });
      expect(invalidLength.success).toBe(false);

      const valid = changePasswordWithCurrentSchema.safeParse({
        currentPassword: 'oldpassword123',
        newPassword: 'newpassword123',
        confirmPassword: 'newpassword123',
      });
      expect(valid.success).toBe(true);
    });

    it('forgotPasswordSchema validates email input correctly', () => {
      const emptyEmail = forgotPasswordSchema.safeParse({ email: '' });
      expect(emptyEmail.success).toBe(false);

      const invalidEmail = forgotPasswordSchema.safeParse({ email: 'not-an-email' });
      expect(invalidEmail.success).toBe(false);

      const validEmail = forgotPasswordSchema.safeParse({ email: 'gardener@leaflink.com' });
      expect(validEmail.success).toBe(true);
    });
  });

  describe('mapChangePasswordError', () => {
    it('maps wrong-password and invalid-credential to "Current password is incorrect."', () => {
      expect(mapChangePasswordError({ code: 'auth/wrong-password' })).toBe(
        'Current password is incorrect.'
      );
      expect(mapChangePasswordError({ code: 'auth/invalid-credential' })).toBe(
        'Current password is incorrect.'
      );
      expect(mapChangePasswordError({ code: 'auth/invalid-login-credentials' })).toBe(
        'Current password is incorrect.'
      );
    });

    it('maps requires-recent-login gracefully', () => {
      expect(mapChangePasswordError({ code: 'auth/requires-recent-login' })).toBe(
        'For security reasons, please log out and sign back in before modifying your password.'
      );
    });

    it('falls back to default or general auth error message for other codes', () => {
      expect(mapChangePasswordError({ code: 'auth/weak-password' })).toBe(
        'Password is too weak. Please use at least 6 characters.'
      );
      expect(mapChangePasswordError(new Error('Random error'), 'Failed to change password.')).toBe(
        'Failed to change password.'
      );
    });
  });

  describe('mapPasswordResetError', () => {
    it('returns non-enumerating confirmation message for auth/user-not-found', () => {
      const res = mapPasswordResetError({ code: 'auth/user-not-found' });
      expect(res).toBe(PASSWORD_RESET_CONFIRMATION_MESSAGE);
      expect(res).toBe(
        'If an account exists for that email, a password reset link has been sent.'
      );
    });

    it('maps invalid email, network failures, and rate limits correctly', () => {
      expect(mapPasswordResetError({ code: 'auth/invalid-email' })).toBe(
        'Please enter a valid email address.'
      );
      expect(mapPasswordResetError({ code: 'auth/network-request-failed' })).toBe(
        'Network error. Please check your internet connection and try again.'
      );
      expect(mapPasswordResetError({ code: 'auth/too-many-requests' })).toBe(
        'Too many unsuccessful attempts. Please try again later.'
      );
    });
  });
});


 describe('Safe password errors', () => {
  test.each(['{"error":{"message":"provider secret"}}', '<html>upstream error</html>', 'Brevo failed: {"code":401}', 'Firebase: raw diagnostic'])('hides %s', message => {
    expect(mapChangePasswordError(new Error(message), 'Please try again.')).toBe('Please try again.');
  });
 });
