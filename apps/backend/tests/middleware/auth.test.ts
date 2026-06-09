import { describe, it, expect } from 'vitest';
import {
  hashToken,
  generateRefreshToken,
  validateBinding,
  hashBinding,
  type BindingFingerprint,
} from '../../src/middleware/auth.js';

describe('hashToken', () => {
  it('produces a 64-char hex string (SHA-256)', () => {
    const hash = hashToken('my-token-value');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic — same input produces same hash', () => {
    const a = hashToken('hello');
    const b = hashToken('hello');
    expect(a).toBe(b);
  });

  it('different inputs produce different hashes', () => {
    const a = hashToken('token-1');
    const b = hashToken('token-2');
    expect(a).not.toBe(b);
  });

  it('handles empty string', () => {
    const hash = hashToken('');
    expect(hash).toHaveLength(64);
  });

  it('handles unicode input', () => {
    const hash = hashToken('密码重置-token-🔐');
    expect(hash).toHaveLength(64);
  });
});

describe('generateRefreshToken', () => {
  it('produces a 64-char hex string (32 random bytes)', () => {
    const token = generateRefreshToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces unique tokens each call', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 100; i++) {
      tokens.add(generateRefreshToken());
    }
    expect(tokens.size).toBe(100);
  });

  it('is not empty', () => {
    expect(generateRefreshToken().length).toBeGreaterThan(0);
  });
});

describe('validateBinding', () => {
  const fingerprint: BindingFingerprint = {
    platform: 'Win32',
    cores: 8,
    screen: '1920x1080',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    deviceId: 'device-abc-123',
  };

  it('returns true when platform and cores match', () => {
    const stored = { bindingPlatform: 'Win32', bindingCores: 8 };
    expect(validateBinding(stored, fingerprint)).toBe(true);
  });

  it('returns false when platform differs', () => {
    const stored = { bindingPlatform: 'MacIntel', bindingCores: 8 };
    expect(validateBinding(stored, fingerprint)).toBe(false);
  });

  it('returns false when cores differ', () => {
    const stored = { bindingPlatform: 'Win32', bindingCores: 4 };
    expect(validateBinding(stored, fingerprint)).toBe(false);
  });

  it('returns false when both differ', () => {
    const stored = { bindingPlatform: 'Linux', bindingCores: 16 };
    expect(validateBinding(stored, fingerprint)).toBe(false);
  });
});

describe('hashBinding', () => {
  const fingerprint: BindingFingerprint = {
    platform: 'Win32',
    cores: 8,
    screen: '1920x1080',
    timezone: 'Asia/Shanghai',
    language: 'zh-CN',
    deviceId: 'device-abc-123',
  };

  it('produces a 64-char hex string', () => {
    const hash = hashBinding(fingerprint);
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic for same fingerprint', () => {
    const a = hashBinding(fingerprint);
    const b = hashBinding(fingerprint);
    expect(a).toBe(b);
  });

  it('changes when any field changes', () => {
    const base = hashBinding(fingerprint);

    const diff1 = hashBinding({ ...fingerprint, platform: 'MacIntel' });
    expect(diff1).not.toBe(base);

    const diff2 = hashBinding({ ...fingerprint, cores: 16 });
    expect(diff2).not.toBe(base);

    const diff3 = hashBinding({ ...fingerprint, screen: '2560x1440' });
    expect(diff3).not.toBe(base);

    const diff4 = hashBinding({ ...fingerprint, timezone: 'UTC' });
    expect(diff4).not.toBe(base);

    const diff5 = hashBinding({ ...fingerprint, language: 'en' });
    expect(diff5).not.toBe(base);

    const diff6 = hashBinding({ ...fingerprint, deviceId: 'other-device' });
    expect(diff6).not.toBe(base);
  });
});
