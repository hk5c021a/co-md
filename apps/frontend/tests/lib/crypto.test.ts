import { describe, it, expect } from 'vitest';
import { generatePbkdf2Salt, preHashPassword } from '../../src/lib/crypto';

describe('generatePbkdf2Salt', () => {
  it('returns a 32-char hex string (16 bytes)', () => {
    const salt = generatePbkdf2Salt();
    expect(salt).toHaveLength(32);
    expect(salt).toMatch(/^[a-f0-9]{32}$/);
  });

  it('produces unique salts each call', () => {
    const salts = new Set<string>();
    for (let i = 0; i < 50; i++) {
      salts.add(generatePbkdf2Salt());
    }
    // With 16 random bytes, the chance of collision across 50 calls is negligible
    expect(salts.size).toBe(50);
  });

  it('produces only hexadecimal characters', () => {
    for (let i = 0; i < 10; i++) {
      const salt = generatePbkdf2Salt();
      expect(salt).toMatch(/^[0-9a-f]+$/);
    }
  });
});

describe('preHashPassword', () => {
  it('returns a 64-char hex string (32 bytes)', async () => {
    const hash = await preHashPassword('MySecretPassword123!');
    expect(hash).toHaveLength(64);
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is deterministic with the same password and same salt', async () => {
    const salt = 'test-salt-16bytes!!';
    const a = await preHashPassword('same-password', salt);
    const b = await preHashPassword('same-password', salt);
    expect(a).toBe(b);
  });

  it('produces different hashes for different passwords', async () => {
    const salt = 'fixed-salt-for-test';
    const a = await preHashPassword('password-one', salt);
    const b = await preHashPassword('password-two', salt);
    expect(a).not.toBe(b);
  });

  it('produces different hashes for same password with different salts', async () => {
    const a = await preHashPassword('mypassword', 'salt-aaaaaa-0001');
    const b = await preHashPassword('mypassword', 'salt-bbbbbb-0002');
    expect(a).not.toBe(b);
  });

  it('handles empty password', async () => {
    const hash = await preHashPassword('');
    expect(hash).toHaveLength(64);
  });

  it('handles unicode passwords', async () => {
    const hash = await preHashPassword('密码🔐测试');
    expect(hash).toHaveLength(64);
  });

  it('uses legacy salt when no salt provided', async () => {
    const hash1 = await preHashPassword('test-password');
    const hash2 = await preHashPassword('test-password');
    // Same password + default legacy salt = same hash
    expect(hash1).toBe(hash2);
  });

  it('is consistent with a known salt', async () => {
    const salt = 'co-md-pbkdf2-salt-v1';
    const a = await preHashPassword('hello', salt);
    const b = await preHashPassword('hello', salt);
    expect(a).toBe(b);
  });
});
