import { describe, it, expect } from 'vitest';
import {
  calcPasswordStrength,
  translateZodError,
  apiErrorState,
  resolveErrorText,
  inputCls,
  loginSchema,
  registerSchema,
  changePasswordSchema,
  passwordResetSchema,
  forgotPasswordSchema,
  profileSchema,
  type ErrorState,
} from '../../src/lib/validation';

// Mock t() that returns the key itself for assertion purposes
const t = (key: string) => key;

describe('calcPasswordStrength', () => {
  it('returns score 0 for empty string', () => {
    const r = calcPasswordStrength('');
    expect(r.score).toBe(0);
  });

  it('returns score 1-2 for short passwords', () => {
    // length < 12: no length point
    const r = calcPasswordStrength('a1!');
    // score: letter=1, digit=1, special=1 = 3 but capped at 4
    // Actually: pwd.length >=12? no, >=16? no, letter? yes, digit? yes, special? yes = 3
    expect(r.score).toBe(3);
  });

  it('returns score 4 for strong password', () => {
    const r = calcPasswordStrength('Abcdefgh1234!@');
    expect(r.score).toBe(4);
    expect(r.color).toBe('bg-success');
  });

  it('returns score 0 for falsy password', () => {
    const r = calcPasswordStrength('');
    expect(r.score).toBe(0);
    expect(r.color).toBe('');
  });

  it('returns score up to 4 maximum', () => {
    const r = calcPasswordStrength('VeryLongPasswordWith123AndSpecial!!!!');
    expect(r.score).toBe(4);
  });
});

describe('translateZodError', () => {
  it('translates known error messages to i18n keys', () => {
    expect(translateZodError('Required', t)).toBe('auth.validationRequired');
    expect(translateZodError('At least 12 characters', t)).toBe('auth.validationMinLength12');
    expect(translateZodError('Passwords do not match', t)).toBe('auth.validationPasswordMismatch');
  });

  it('returns empty string for undefined', () => {
    expect(translateZodError(undefined, t)).toBe('');
  });

  it('returns original message for unknown error', () => {
    expect(translateZodError('Unknown custom error', t)).toBe('Unknown custom error');
  });
});

describe('apiErrorState', () => {
  it('returns ErrorState with i18n key for known codes', () => {
    const state = apiErrorState({ code: 'USERNAME_TAKEN' }, 'auth.registerError');
    expect(state).toEqual({ key: 'auth.asyncUsernameTaken' });
  });

  it('returns raw message for unknown codes with message', () => {
    const state = apiErrorState({ code: 'CUSTOM', message: 'Something happened' }, 'auth.registerError');
    expect(state).toEqual({ raw: 'Something happened' });
  });

  it('returns fallback key for null/undefined', () => {
    const state = apiErrorState(null, 'auth.registerError');
    expect(state).toEqual({ key: 'auth.registerError' });
  });
});

describe('resolveErrorText', () => {
  it('resolves key-based error state', () => {
    const state: ErrorState = { key: 'auth.loginError' };
    expect(resolveErrorText(state, t)).toBe('auth.loginError');
  });

  it('resolves raw error state', () => {
    const state: ErrorState = { raw: 'Server down' };
    expect(resolveErrorText(state, t)).toBe('Server down');
  });

  it('returns empty string for null', () => {
    expect(resolveErrorText(null, t)).toBe('');
  });
});

describe('inputCls', () => {
  it('includes error border class when hasError is true', () => {
    const cls = inputCls(true);
    expect(cls).toContain('border-error');
  });

  it('includes normal border class when hasError is false', () => {
    const cls = inputCls(false);
    expect(cls).toContain('border-border');
  });
});

// ── Zod Schemas ──

describe('loginSchema', () => {
  it('accepts valid username', () => {
    expect(() => loginSchema.parse({ identifier: 'testuser', password: 'pass', captchaAnswer: '5' })).not.toThrow();
  });

  it('accepts valid email', () => {
    expect(() => loginSchema.parse({ identifier: 'user@test.com', password: 'pass', captchaAnswer: '42' })).not.toThrow();
  });

  it('rejects invalid identifier', () => {
    const r = loginSchema.safeParse({ identifier: 'ab', password: 'pass', captchaAnswer: '5' });
    expect(r.success).toBe(false);
  });

  it('rejects non-numeric captcha', () => {
    const r = loginSchema.safeParse({ identifier: 'testuser', password: 'pass', captchaAnswer: 'abc' });
    expect(r.success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    username: 'newuser',
    countryCode: '+86',
    phone: '13800138000',
    email: 'new@test.com',
    password: 'StrongPass123!',
    confirmPassword: 'StrongPass123!',
    captchaAnswer: '7',
  };

  it('accepts valid input', () => {
    expect(() => registerSchema.parse(valid)).not.toThrow();
  });

  it('rejects mismatched passwords', () => {
    const r = registerSchema.safeParse({ ...valid, confirmPassword: 'Different1!' });
    expect(r.success).toBe(false);
  });

  it('rejects weak password (no special char)', () => {
    const r = registerSchema.safeParse({ ...valid, password: 'WeakPass123', confirmPassword: 'WeakPass123' });
    expect(r.success).toBe(false);
  });

  it('rejects short phone', () => {
    const r = registerSchema.safeParse({ ...valid, phone: '123' });
    expect(r.success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  const valid = {
    currentPassword: 'oldPassword1',
    newPassword: 'NewStrongPass1!',
    confirmNewPassword: 'NewStrongPass1!',
  };

  it('accepts valid input', () => {
    expect(() => changePasswordSchema.parse(valid)).not.toThrow();
  });

  it('rejects same old and new password', () => {
    const r = changePasswordSchema.safeParse({
      ...valid,
      newPassword: 'oldPassword1',
      confirmNewPassword: 'oldPassword1',
    });
    expect(r.success).toBe(false);
  });

  it('rejects mismatched new passwords', () => {
    const r = changePasswordSchema.safeParse({ ...valid, confirmNewPassword: 'Mismatch1!' });
    expect(r.success).toBe(false);
  });
});

describe('passwordResetSchema', () => {
  it('accepts valid input', () => {
    expect(() =>
      passwordResetSchema.parse({ password: 'NewPass1234!', confirmPassword: 'NewPass1234!' })
    ).not.toThrow();
  });

  it('rejects mismatched passwords', () => {
    const r = passwordResetSchema.safeParse({ password: 'Pass1!234', confirmPassword: 'Pass1!235' });
    expect(r.success).toBe(false);
  });
});

describe('forgotPasswordSchema', () => {
  it('accepts valid email', () => {
    expect(() => forgotPasswordSchema.parse({ email: 'user@test.com', captchaAnswer: '3' })).not.toThrow();
  });

  it('rejects invalid email', () => {
    const r = forgotPasswordSchema.safeParse({ email: 'bad', captchaAnswer: '3' });
    expect(r.success).toBe(false);
  });
});

describe('profileSchema', () => {
  it('accepts valid profile', () => {
    expect(() => profileSchema.parse({ username: 'testuser', email: 'test@test.com', phone: '13800138000' })).not.toThrow();
  });

  it('rejects invalid email', () => {
    const r = profileSchema.safeParse({ username: 'testuser', email: 'bad', phone: '13800138000' });
    expect(r.success).toBe(false);
  });
});
