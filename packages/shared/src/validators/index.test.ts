import { describe, it, expect } from 'vitest';
import {
  registerSchema,
  loginSchema,
  passwordResetRequestSchema,
  passwordResetConfirmSchema,
  refreshTokenSchema,
  updateProfileSchema,
  changePasswordSchema,
  createFolderSchema,
  updateFolderSchema,
  createDocumentSchema,
  updateDocumentSchema,
  moveDocumentSchema,
  grantPermissionSchema,
  batchGrantPermissionSchema,
  sendInvitationSchema,
  searchUsersSchema,
  pageSchema,
  backendRegisterSchema,
  backendLoginSchema,
} from './index.js';

// ── registerSchema ──

describe('registerSchema', () => {
  const valid = {
    username: 'testuser',
    email: 'test@example.com',
    phone: '1234567890',
    password: 'Abcd1234!@#$',
    confirmPassword: 'Abcd1234!@#$',
  };

  it('accepts valid input', () => {
    expect(() => registerSchema.parse(valid)).not.toThrow();
  });

  it('rejects username shorter than 3 chars', () => {
    const r = registerSchema.safeParse({ ...valid, username: 'ab' });
    expect(r.success).toBe(false);
  });

  it('rejects username with invalid characters', () => {
    const r = registerSchema.safeParse({ ...valid, username: 'user name!' });
    expect(r.success).toBe(false);
  });

  it('rejects email with invalid format', () => {
    const r = registerSchema.safeParse({ ...valid, email: 'not-email' });
    expect(r.success).toBe(false);
  });

  it('rejects phone shorter than 10 chars', () => {
    const r = registerSchema.safeParse({ ...valid, phone: '123' });
    expect(r.success).toBe(false);
  });

  it('rejects password shorter than 12 chars', () => {
    const r = registerSchema.safeParse({ ...valid, password: 'Short1!', confirmPassword: 'Short1!' });
    expect(r.success).toBe(false);
  });

  it('rejects password without uppercase', () => {
    const r = registerSchema.safeParse({ ...valid, password: 'abcd1234!@#$', confirmPassword: 'abcd1234!@#$' });
    expect(r.success).toBe(false);
  });

  it('rejects password without lowercase', () => {
    const r = registerSchema.safeParse({ ...valid, password: 'ABCD1234!@#$', confirmPassword: 'ABCD1234!@#$' });
    expect(r.success).toBe(false);
  });

  it('rejects password without digit', () => {
    const r = registerSchema.safeParse({ ...valid, password: 'Abcdefgh!@#$', confirmPassword: 'Abcdefgh!@#$' });
    expect(r.success).toBe(false);
  });

  it('rejects password without special char', () => {
    const r = registerSchema.safeParse({ ...valid, password: 'Abcd1234efgh', confirmPassword: 'Abcd1234efgh' });
    expect(r.success).toBe(false);
  });

  it('rejects mismatched confirmPassword', () => {
    const r = registerSchema.safeParse({ ...valid, confirmPassword: 'Different1!@#$' });
    expect(r.success).toBe(false);
  });
});

// ── loginSchema ──

describe('loginSchema', () => {
  it('accepts valid input', () => {
    expect(() => loginSchema.parse({ identifier: 'testuser', password: 'secret' })).not.toThrow();
  });

  it('rejects empty identifier', () => {
    const r = loginSchema.safeParse({ identifier: '', password: 'secret' });
    expect(r.success).toBe(false);
  });

  it('rejects empty password', () => {
    const r = loginSchema.safeParse({ identifier: 'testuser', password: '' });
    expect(r.success).toBe(false);
  });
});

// ── passwordResetRequestSchema ──

describe('passwordResetRequestSchema', () => {
  it('accepts valid email', () => {
    expect(() => passwordResetRequestSchema.parse({ email: 'user@example.com' })).not.toThrow();
  });

  it('rejects invalid email', () => {
    const r = passwordResetRequestSchema.safeParse({ email: 'not-email' });
    expect(r.success).toBe(false);
  });
});

// ── passwordResetConfirmSchema ──

describe('passwordResetConfirmSchema', () => {
  const valid = {
    token: 'abc123',
    newPassword: 'Abcd1234!@#$',
    confirmPassword: 'Abcd1234!@#$',
  };

  it('accepts valid input', () => {
    expect(() => passwordResetConfirmSchema.parse(valid)).not.toThrow();
  });

  it('rejects empty token', () => {
    const r = passwordResetConfirmSchema.safeParse({ ...valid, token: '' });
    expect(r.success).toBe(false);
  });

  it('rejects mismatched passwords', () => {
    const r = passwordResetConfirmSchema.safeParse({ ...valid, confirmPassword: 'Xxxx5678@#$!' });
    expect(r.success).toBe(false);
  });
});

// ── refreshTokenSchema ──

describe('refreshTokenSchema', () => {
  it('accepts valid refresh token', () => {
    expect(() => refreshTokenSchema.parse({ refreshToken: 'some-token' })).not.toThrow();
  });

  it('rejects empty refresh token', () => {
    const r = refreshTokenSchema.safeParse({ refreshToken: '' });
    expect(r.success).toBe(false);
  });
});

// ── updateProfileSchema ──

describe('updateProfileSchema', () => {
  it('accepts empty object (all optional)', () => {
    expect(() => updateProfileSchema.parse({})).not.toThrow();
  });

  it('accepts partial fields', () => {
    expect(() => updateProfileSchema.parse({ username: 'newuser' })).not.toThrow();
    expect(() => updateProfileSchema.parse({ email: 'new@example.com' })).not.toThrow();
    expect(() => updateProfileSchema.parse({ phone: '1234567890' })).not.toThrow();
  });

  it('rejects invalid email', () => {
    const r = updateProfileSchema.safeParse({ email: 'bad' });
    expect(r.success).toBe(false);
  });

  it('rejects phone too short', () => {
    const r = updateProfileSchema.safeParse({ phone: '123' });
    expect(r.success).toBe(false);
  });
});

// ── changePasswordSchema ──

describe('changePasswordSchema', () => {
  const valid = {
    currentPassword: 'oldpass123',
    newPassword: 'NewPass1234!@',
    confirmNewPassword: 'NewPass1234!@',
  };

  it('accepts valid input', () => {
    expect(() => changePasswordSchema.parse(valid)).not.toThrow();
  });

  it('rejects empty currentPassword', () => {
    const r = changePasswordSchema.safeParse({ ...valid, currentPassword: '' });
    expect(r.success).toBe(false);
  });

  it('rejects weak newPassword', () => {
    const r = changePasswordSchema.safeParse({ ...valid, newPassword: 'weak', confirmNewPassword: 'weak' });
    expect(r.success).toBe(false);
  });

  it('rejects mismatched confirmNewPassword', () => {
    const r = changePasswordSchema.safeParse({ ...valid, confirmNewPassword: 'Mismatch1!@#' });
    expect(r.success).toBe(false);
  });
});

// ── createFolderSchema ──

describe('createFolderSchema', () => {
  it('accepts valid name', () => {
    expect(() => createFolderSchema.parse({ name: 'My Folder' })).not.toThrow();
  });

  it('rejects empty name', () => {
    const r = createFolderSchema.safeParse({ name: '' });
    expect(r.success).toBe(false);
  });

  it('accepts optional parentFolderId', () => {
    expect(() => createFolderSchema.parse({ name: 'Sub', parentFolderId: 'abc' })).not.toThrow();
    expect(() => createFolderSchema.parse({ name: 'Sub', parentFolderId: null })).not.toThrow();
  });
});

// ── updateFolderSchema ──

describe('updateFolderSchema', () => {
  it('accepts valid name', () => {
    expect(() => updateFolderSchema.parse({ name: 'Renamed' })).not.toThrow();
  });

  it('rejects empty name', () => {
    const r = updateFolderSchema.safeParse({ name: '' });
    expect(r.success).toBe(false);
  });
});

// ── createDocumentSchema ──

describe('createDocumentSchema', () => {
  it('accepts valid title', () => {
    expect(() => createDocumentSchema.parse({ title: 'My Doc' })).not.toThrow();
  });

  it('rejects empty title', () => {
    const r = createDocumentSchema.safeParse({ title: '' });
    expect(r.success).toBe(false);
  });

  it('accepts optional content', () => {
    expect(() => createDocumentSchema.parse({ title: 'Doc', content: { text: 'hello' } })).not.toThrow();
  });

  it('accepts optional parentFolderId', () => {
    expect(() => createDocumentSchema.parse({ title: 'Doc', parentFolderId: 'abc' })).not.toThrow();
    expect(() => createDocumentSchema.parse({ title: 'Doc', parentFolderId: null })).not.toThrow();
  });
});

// ── updateDocumentSchema ──

describe('updateDocumentSchema', () => {
  it('accepts all optional fields', () => {
    expect(() => updateDocumentSchema.parse({})).not.toThrow();
  });

  it('accepts partial title', () => {
    expect(() => updateDocumentSchema.parse({ title: 'Updated' })).not.toThrow();
  });

  it('rejects empty title when provided', () => {
    const r = updateDocumentSchema.safeParse({ title: '' });
    expect(r.success).toBe(false);
  });
});

// ── moveDocumentSchema ──

describe('moveDocumentSchema', () => {
  it('accepts null parentFolderId', () => {
    expect(() => moveDocumentSchema.parse({ parentFolderId: null })).not.toThrow();
  });

  it('accepts string parentFolderId', () => {
    expect(() => moveDocumentSchema.parse({ parentFolderId: 'folder-1' })).not.toThrow();
  });
});

// ── grantPermissionSchema ──

describe('grantPermissionSchema', () => {
  it('accepts read-only level', () => {
    expect(() => grantPermissionSchema.parse({ userId: 'user-1', level: 'read-only' })).not.toThrow();
  });

  it('accepts read-write level', () => {
    expect(() => grantPermissionSchema.parse({ userId: 'user-1', level: 'read-write' })).not.toThrow();
  });

  it('rejects empty userId', () => {
    const r = grantPermissionSchema.safeParse({ userId: '', level: 'read-only' });
    expect(r.success).toBe(false);
  });

  it('rejects invalid level', () => {
    const r = grantPermissionSchema.safeParse({ userId: 'user-1', level: 'admin' });
    expect(r.success).toBe(false);
  });
});

// ── batchGrantPermissionSchema ──

describe('batchGrantPermissionSchema', () => {
  it('accepts non-empty permissions array', () => {
    expect(() =>
      batchGrantPermissionSchema.parse({
        permissions: [{ userId: 'user-1', level: 'read-only' }],
      })
    ).not.toThrow();
  });

  it('rejects empty permissions array', () => {
    const r = batchGrantPermissionSchema.safeParse({ permissions: [] });
    expect(r.success).toBe(false);
  });
});

// ── sendInvitationSchema ──

describe('sendInvitationSchema', () => {
  it('accepts valid inviteeId', () => {
    expect(() => sendInvitationSchema.parse({ inviteeId: 'user-2' })).not.toThrow();
  });

  it('rejects empty inviteeId', () => {
    const r = sendInvitationSchema.safeParse({ inviteeId: '' });
    expect(r.success).toBe(false);
  });
});

// ── searchUsersSchema ──

describe('searchUsersSchema', () => {
  it('accepts valid query', () => {
    expect(() => searchUsersSchema.parse({ query: 'john' })).not.toThrow();
  });

  it('rejects empty query', () => {
    const r = searchUsersSchema.safeParse({ query: '' });
    expect(r.success).toBe(false);
  });

  it('rejects query longer than 100 chars', () => {
    const r = searchUsersSchema.safeParse({ query: 'x'.repeat(101) });
    expect(r.success).toBe(false);
  });
});

// ── pageSchema ──

describe('pageSchema', () => {
  it('provides default values', () => {
    const result = pageSchema.parse({});
    expect(result.limit).toBe(50);
    expect(result.offset).toBe(0);
  });

  it('coerces string values to numbers', () => {
    const result = pageSchema.parse({ limit: '10', offset: '5' });
    expect(result.limit).toBe(10);
    expect(result.offset).toBe(5);
  });

  it('rejects limit over 200', () => {
    const r = pageSchema.safeParse({ limit: '300' });
    expect(r.success).toBe(false);
  });

  it('rejects negative offset', () => {
    const r = pageSchema.safeParse({ offset: '-1' });
    expect(r.success).toBe(false);
  });
});

// ── backendRegisterSchema ──

describe('backendRegisterSchema', () => {
  const valid = {
    username: 'testuser',
    email: 'test@example.com',
    phone: '1234567890',
    passwordHash: 'a'.repeat(32),
    confirmPasswordHash: 'a'.repeat(32),
    pbkdf2Salt: 'salt-v1-abcdef',
    captchaId: 'captcha-123',
    captchaAnswer: 42,
  };

  it('accepts valid input', () => {
    expect(() => backendRegisterSchema.parse(valid)).not.toThrow();
  });

  it('rejects mismatched password hashes', () => {
    const r = backendRegisterSchema.safeParse({
      ...valid,
      confirmPasswordHash: 'b'.repeat(32),
    });
    expect(r.success).toBe(false);
  });

  it('rejects short passwordHash', () => {
    const r = backendRegisterSchema.safeParse({ ...valid, passwordHash: 'short' });
    expect(r.success).toBe(false);
  });

  it('rejects negative captchaAnswer', () => {
    const r = backendRegisterSchema.safeParse({ ...valid, captchaAnswer: -1 });
    expect(r.success).toBe(false);
  });

  it('rejects float captchaAnswer', () => {
    const r = backendRegisterSchema.safeParse({ ...valid, captchaAnswer: 3.14 });
    expect(r.success).toBe(false);
  });
});

// ── backendLoginSchema ──

describe('backendLoginSchema', () => {
  const validFingerprint = {
    platform: 'Win32',
    cores: 8,
    screen: '1920x1080',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    deviceId: 'device-abc-123',
  };

  const valid = {
    identifier: 'testuser',
    passwordHash: 'a'.repeat(32),
    captchaId: 'captcha-1',
    captchaAnswer: 7,
    fingerprint: validFingerprint,
  };

  it('accepts valid input', () => {
    expect(() => backendLoginSchema.parse(valid)).not.toThrow();
  });

  it('rejects empty identifier', () => {
    const r = backendLoginSchema.safeParse({ ...valid, identifier: '' });
    expect(r.success).toBe(false);
  });

  it('rejects short passwordHash', () => {
    const r = backendLoginSchema.safeParse({ ...valid, passwordHash: 'short' });
    expect(r.success).toBe(false);
  });

  it('rejects missing fingerprint', () => {
    const { fingerprint, ...rest } = valid;
    const r = backendLoginSchema.safeParse(rest);
    expect(r.success).toBe(false);
  });

  it('rejects fingerprint with negative cores', () => {
    const r = backendLoginSchema.safeParse({
      ...valid,
      fingerprint: { ...validFingerprint, cores: -1 },
    });
    expect(r.success).toBe(false);
  });
});
