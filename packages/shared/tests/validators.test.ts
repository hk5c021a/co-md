import { describe, it, expect } from 'vitest';
import {
  createDocumentSchema,
  updateDocumentSchema,
  backendRegisterSchema,
  backendLoginSchema,
} from '../src/validators/index.js';

describe('validators', () => {
  describe('backendRegisterSchema', () => {
    it('accepts valid password hashes', () => {
      const r = backendRegisterSchema.safeParse({
        username: 'testuser',
        email: 'a@b.com',
        phone: '+12345678901',
        passwordHash: 'x'.repeat(32),
        confirmPasswordHash: 'x'.repeat(32),
        pbkdf2Salt: 'x'.repeat(16),
        captchaId: '550e8400-e29b-41d4-a716-446655440000',
        captchaAnswer: 408,
      });
      expect(r.success).toBe(true);
    });

    it('rejects hash mismatch', () => {
      const r = backendRegisterSchema.safeParse({
        username: 'test',
        email: 'a@b.com',
        phone: '+12345678901',
        passwordHash: 'x'.repeat(32),
        confirmPasswordHash: 'y'.repeat(32),
      });
      expect(r.success).toBe(false);
    });
  });

  describe('backendLoginSchema', () => {
    it('validates with fingerprint and captcha', () => {
      const r = backendLoginSchema.safeParse({
        identifier: 'test',
        passwordHash: 'x'.repeat(32),
        captchaId: '550e8400-e29b-41d4-a716-446655440000',
        captchaAnswer: 408,
        fingerprint: {
          platform: 'Win32',
          cores: 8,
          screen: '1920x1080',
          timezone: 'UTC',
          language: 'en',
          deviceId: 'abc',
        },
      });
      expect(r.success).toBe(true);
    });

    it('rejects missing fingerprint', () => {
      const r = backendLoginSchema.safeParse({
        identifier: 'test',
        passwordHash: 'x'.repeat(32),
        captchaId: '550e8400-e29b-41d4-a716-446655440000',
        captchaAnswer: 408,
      });
      expect(r.success).toBe(false);
    });

    it('rejects missing captcha', () => {
      const r = backendLoginSchema.safeParse({
        identifier: 'test',
        passwordHash: 'x'.repeat(32),
        fingerprint: {
          platform: 'Win32',
          cores: 8,
          screen: '1920x1080',
          timezone: 'UTC',
          language: 'en',
          deviceId: 'abc',
        },
      });
      expect(r.success).toBe(false);
    });
  });

  describe('document schemas', () => {
    it('createDocumentSchema accepts valid input', () => {
      expect(createDocumentSchema.safeParse({ title: 'My Doc' }).success).toBe(true);
    });

    it('createDocumentSchema rejects empty title', () => {
      expect(createDocumentSchema.safeParse({ title: '' }).success).toBe(false);
    });

    it('updateDocumentSchema accepts partial update', () => {
      expect(updateDocumentSchema.safeParse({ title: 'New Title' }).success).toBe(true);
    });

    it('createDocumentSchema rejects content over 5MB', () => {
      const large = 'x'.repeat(5 * 1024 * 1024 + 1);
      const r = createDocumentSchema.safeParse({ title: 'Doc', content: large });
      expect(r.success).toBe(false);
    });
  });

});
