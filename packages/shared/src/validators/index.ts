import { z } from 'zod';

// User registration schema
export const registerSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'),
  email: z.string().email('Invalid email format'),
  phone: z.string().min(10, 'Invalid phone number').max(20),
  password: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Login schema
export const loginSchema = z.object({
  identifier: z.string().min(1, 'Username, email, or phone is required'), // username, email, or phone
  password: z.string().min(1, 'Password is required'),
});

// Password reset request schema
export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
});

// Password reset confirm schema
export const passwordResetConfirmSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

// Token refresh schema
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// User profile update schema
export const updateProfileSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(30, 'Username must be at most 30 characters')
    .regex(/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores')
    .optional(),
  email: z.string().email('Invalid email format').optional(),
  phone: z.string().min(10, 'Invalid phone number').max(20).optional(),
});

// Password change schema
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(12, 'Password must be at least 12 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Password must contain at least one special character'),
  confirmNewPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmNewPassword, {
  message: 'Passwords do not match',
  path: ['confirmNewPassword'],
});

// Document schema
export const createDocumentSchema = z.object({
  title: z.string().min(1, 'Document title is required').max(255, 'Title too long'),
  content: z
    .unknown()
    .optional()
    .refine(
      (val) => !val || JSON.stringify(val).length < 5 * 1024 * 1024,
      'Content too large (max 5MB)'
    ),
});

export const updateDocumentSchema = z.object({
  title: z.string().min(1, 'Document title is required').max(255, 'Title too long').optional(),
  content: z.any().optional(),
});

// Permission schemas
export const grantPermissionSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  level: z.enum(['read-only', 'read-write']),
});

export const batchGrantPermissionSchema = z.object({
  permissions: z.array(grantPermissionSchema).min(1, 'At least one permission is required'),
});

// Contact invitation schema
export const sendInvitationSchema = z.object({
  inviteeId: z.string().min(1, 'Invitee ID is required'),
});

// User search schema
export const searchUsersSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(100, 'Query too long'),
});

// Pagination
export const pageSchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ── Backend auth schemas (PBKDF2 pre-hashed + CAPTCHA) ──
export const backendRegisterSchema = z
  .object({
    username: z.string().min(3).max(30).regex(/^[a-zA-Z0-9_]+$/),
    email: z.string().email(),
    phone: z.string().min(10).max(20).regex(/^\+?[0-9\s\-().]+$/),
    passwordHash: z.string().min(32),
    confirmPasswordHash: z.string().min(32),
    pbkdf2Salt: z.string().min(8),
    captchaId: z.string().min(1),
    captchaAnswer: z.number().int().positive(),
  })
  .refine((data) => data.passwordHash === data.confirmPasswordHash, {
    message: 'Passwords do not match',
    path: ['confirmPasswordHash'],
  });

export const backendLoginSchema = z.object({
  identifier: z.string().min(1),
  passwordHash: z.string().min(32),
  captchaId: z.string().min(1),
  captchaAnswer: z.number().int().positive(),
  fingerprint: z.object({
    platform: z.string(),
    cores: z.number().int().positive(),
    screen: z.string(),
    timezone: z.string(),
    language: z.string(),
    deviceId: z.string(),
  }),
});
