import {
  changePasswordWithCurrentSchema,
  forgotPasswordSchema,
  isValidOtp,
  loginSchema,
  parseBottleCapacity,
  parsePumpFlow,
  registerSchema,
  validateDisplayName,
} from '../src/utils/authValidation';

describe('Form submission validation', () => {
  const email = 'Grower+plants@example.com';
  const password = '  leaves123  ';

  it('trims email and name while preserving passwords verbatim', () => {
    expect(loginSchema.parse({ email: ` ${email} `, password })).toEqual({ email, password });
    expect(forgotPasswordSchema.parse({ email: ` ${email} ` })).toEqual({ email });
    expect(registerSchema.parse({
      name: '  Léa Martin  ',
      email: ` ${email} `,
      password,
      confirmPassword: password,
    })).toEqual({ name: 'Léa Martin', email, password, confirmPassword: password });
    expect(changePasswordWithCurrentSchema.parse({
      currentPassword: ' legacy ',
      newPassword: password,
      confirmPassword: password,
    }).currentPassword).toBe(' legacy ');
  });

  it('rejects invalid trimmed names and compares raw confirmation values', () => {
    expect(validateDisplayName('    ').valid).toBe(false);
    expect(validateDisplayName(' 1st Plant ').valid).toBe(false);
    expect(changePasswordWithCurrentSchema.safeParse({
      currentPassword: 'legacy',
      newPassword: password,
      confirmPassword: password.trim(),
    }).success).toBe(false);
  });

  it('accepts exactly six ASCII digits, including leading zeros', () => {
    expect(isValidOtp('001234')).toBe(true);
    for (const value of ['01234', '0012345', '001234\n', '01234\n', ' 001234', '00-1234', '１２３４５６']) {
      expect(isValidOtp(value)).toBe(false);
    }
  });

  it('includes the capacity and flow endpoints and accepts decimal measurements', () => {
    expect(parseBottleCapacity('250')).toBe(250);
    expect(parseBottleCapacity(' 2000 ')).toBe(2000);
    expect(parsePumpFlow('50')).toBe(5);
    expect(parsePumpFlow('300')).toBe(30);
    expect(parsePumpFlow('152.5')).toBe(15.25);
  });

  it('rejects incomplete numbers, non-finite values, and values outside bounds', () => {
    for (const value of ['', ' ', '250mL', '0x100', '2e2', 'Infinity', 'NaN', '250,5', '9'.repeat(400)]) {
      expect(parseBottleCapacity(value)).toBeNull();
      expect(parsePumpFlow(value)).toBeNull();
    }
    expect(parseBottleCapacity('249.99')).toBeNull();
    expect(parseBottleCapacity('2000.01')).toBeNull();
    expect(parsePumpFlow('49.99')).toBeNull();
    expect(parsePumpFlow('300.01')).toBeNull();
  });
});
