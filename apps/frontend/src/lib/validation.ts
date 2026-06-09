import { z } from 'zod';

// ── Password strength ──

export interface StrengthResult {
  score: number;
  color: string;
}

export function calcPasswordStrength(pwd: string): StrengthResult {
  if (!pwd) return { score: 0, color: '' };
  let score = 0;
  if (pwd.length >= 12) score++;
  if (pwd.length >= 16) score++;
  if (/[a-zA-Z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^a-zA-Z0-9]/.test(pwd)) score++;
  const colors: Record<number, string> = {
    0: 'bg-error',
    1: 'bg-error',
    2: 'bg-warning',
    3: 'bg-warning',
    4: 'bg-success',
  };
  const s = Math.min(score, 4);
  return { score: s, color: colors[s] };
}

// ── Shared password strength refiner (used by register, change password, password reset) ──

const PASSWORD_STRENGTH_MSG = 'Must contain letters, digits, and special characters';

function passwordRefinement(val: string): boolean {
  const hasLetter = /[a-zA-Z]/.test(val);
  const hasDigit = /\d/.test(val);
  const hasSpecial = /[^a-zA-Z0-9]/.test(val);
  return hasLetter && hasDigit && hasSpecial;
}

// ── Shared input classes ──

export function inputCls(hasError: boolean): string {
  return `mt-1 block w-full rounded-sm border bg-bg dark:bg-zinc-800 px-3 py-2 text-[15px] text-text-primary dark:text-zinc-100 placeholder-text-neutral focus:outline-none focus:ring-2 focus:ring-primary aria-invalid:border-error dark:aria-invalid:border-error ${
    hasError
      ? 'border-error dark:border-error'
      : 'border-border dark:border-zinc-700 focus:border-primary'
  }`;
}

/** aria attributes for inputs with validation errors */
export function ariaInvalid(hasError: boolean): Record<string, string | undefined> {
  return {
    'aria-invalid': hasError ? 'true' : undefined,
    'aria-describedby': hasError ? `${hasError}-error` : undefined,
  };
}

// ── Base schemas ──

export const loginSchema = z.object({
  identifier: z
    .string()
    .min(1, 'Required')
    .refine(
      (val) => /^[a-zA-Z0-9_]{3,30}$/.test(val) || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val),
      'Must be a valid username or email'
    ),
  password: z.string().min(1, 'Required'),
  captchaAnswer: z
    .string()
    .min(1, 'Required')
    .regex(/^\d+$/, 'Must be a number')
    .refine((v) => parseInt(v, 10) > 0, 'Answer must be positive'),
});

export const registerSchema = z
  .object({
    username: z
      .string()
      .min(1, 'Required')
      .min(3, '3-30 characters')
      .max(30, '3-30 characters')
      .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, underscores only'),
    countryCode: z.string().min(1),
    phone: z
      .string()
      .min(1, 'Required')
      .min(7, 'Invalid phone number')
      .max(15, 'Invalid phone number'),
    email: z.string().min(1, 'Required').email('Invalid email format'),
    password: z
      .string()
      .min(12, 'At least 12 characters')
      .refine(passwordRefinement, PASSWORD_STRENGTH_MSG),
    confirmPassword: z.string().min(1, 'Required'),
    captchaAnswer: z
      .string()
      .min(1, 'Required')
      .regex(/^\d+$/, 'Must be a number')
      .refine((v) => parseInt(v, 10) > 0, 'Answer must be positive'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

export const forgotPasswordSchema = z.object({
  email: z.string().min(1, 'Required').email('Invalid email format'),
  captchaAnswer: z
    .string()
    .min(1, 'Required')
    .regex(/^\d+$/, 'Must be a number')
    .refine((v) => parseInt(v, 10) > 0, 'Answer must be positive'),
});

export const profileSchema = z.object({
  username: z
    .string()
    .min(1, 'Required')
    .min(3, '3-30 characters')
    .max(30, '3-30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Letters, numbers, underscores only'),
  email: z.string().min(1, 'Required').email('Invalid email format'),
  phone: z
    .string()
    .min(1, 'Required')
    .min(7, 'Invalid phone number')
    .max(20, 'Invalid phone number'),
});

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Required'),
    newPassword: z
      .string()
      .min(12, 'At least 12 characters')
      .refine(passwordRefinement, PASSWORD_STRENGTH_MSG),
    confirmNewPassword: z.string().min(1, 'Required'),
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    message: 'New password must differ from current password',
    path: ['newPassword'],
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: 'Passwords do not match',
    path: ['confirmNewPassword'],
  });

export const passwordResetSchema = z
  .object({
    password: z
      .string()
      .min(12, 'At least 12 characters')
      .refine(passwordRefinement, PASSWORD_STRENGTH_MSG),
    confirmPassword: z.string().min(1, 'Required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

// ── Inferred types ──

export type LoginFormValues = z.infer<typeof loginSchema>;
export type RegisterFormValues = z.infer<typeof registerSchema>;
export type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;
export type ProfileFormValues = z.infer<typeof profileSchema>;
export type ChangePasswordFormValues = z.infer<typeof changePasswordSchema>;
export type PasswordResetFormValues = z.infer<typeof passwordResetSchema>;

// ── Zod error message translator ──

const ZOD_ERROR_MAP: Record<string, string> = {
  Required: 'auth.validationRequired',
  'At least 12 characters': 'auth.validationMinLength12',
  'Must contain letters, digits, and special characters': 'auth.validationPasswordComposition',
  '3-30 characters': 'auth.validationUsernameFormat',
  'Letters, numbers, underscores only': 'auth.validationUsernameFormat',
  'Invalid phone number': 'auth.validationPhoneFormat',
  'Invalid email format': 'auth.validationEmailFormat',
  'Passwords do not match': 'auth.validationPasswordMismatch',
  'New password must differ from current password': 'auth.passwordNotDifferent',
  'Must be a valid username or email': 'auth.validationIdentifierFormat',
  'Must be a number': 'auth.validationCaptchaNumber',
  'Answer must be positive': 'auth.validationCaptchaPositive',
};

export function translateZodError(msg: string | undefined, t: (key: string) => string): string {
  if (!msg) return '';
  const key = ZOD_ERROR_MAP[msg];
  return key ? t(key) : msg;
}

// Backend error code → i18n key
const API_ERROR_MAP: Record<string, string> = {
  INVALID_CREDENTIALS: 'auth.loginError',
  USERNAME_TAKEN: 'auth.asyncUsernameTaken',
  EMAIL_TAKEN: 'auth.asyncEmailTaken',
  PHONE_TAKEN: 'auth.asyncPhoneTaken',
  PASSWORDS_DO_NOT_MATCH: 'auth.validationPasswordMismatch',
  CSRF_INVALID: 'auth.csrfInvalid',
  INVALID_JSON: 'auth.invalidRequest',
  VALIDATION_ERROR: 'auth.invalidInput',
  SESSION_NOT_FOUND: 'auth.sessionExpired',
  CHECK_FAILED: 'auth.checkFailed',
  CAPTCHA_EXPIRED: 'auth.captchaExpired',
  INVALID_PASSWORD: 'auth.invalidPassword',
  PASSWORD_NOT_DIFFERENT: 'auth.passwordNotDifferent',
};

export interface ApiErrorData {
  code?: string;
  message?: string;
}

// Reactive error state: stores a descriptor, resolved at render time with t()
export type ErrorState = { key: string } | { raw: string } | null;

export function resolveErrorText(state: ErrorState, t: (key: string) => string): string {
  if (!state) return '';
  if ('key' in state) return t(state.key);
  return state.raw;
}

export function apiErrorState(
  data: ApiErrorData | null | undefined,
  fallbackKey: string
): ErrorState {
  if (data?.code) {
    const key = API_ERROR_MAP[data.code];
    if (key) return { key };
  }
  if (data?.message) return { raw: data.message };
  return { key: fallbackKey };
}

export function i18nError(key: string): ErrorState {
  return { key };
}
