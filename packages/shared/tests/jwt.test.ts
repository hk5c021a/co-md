import { describe, it, expect } from 'vitest';
import { verifyAccessToken } from '../src/jwt.js';
import { SignJWT } from 'jose';

// Use the same secret as configured in vitest.config.ts
const secret = new TextEncoder().encode('test-secret-with-at-least-32-chars!!');

async function signTestAccessToken(sub: string): Promise<string> {
  return new SignJWT({ sub, type: 'access' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('15m')
    .sign(secret);
}

async function signTestRefreshToken(sub: string): Promise<string> {
  return new SignJWT({ sub, type: 'refresh' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(secret);
}

describe('JWT utilities', () => {
  describe('verifyAccessToken', () => {
    it('should verify a valid access token', async () => {
      const token = await signTestAccessToken('user-1');
      const payload = await verifyAccessToken(token);
      expect(payload.sub).toBe('user-1');
      expect(payload.type).toBe('access');
    });

    it('should reject a refresh token used as access token', async () => {
      const token = await signTestRefreshToken('user-1');
      await expect(verifyAccessToken(token)).rejects.toThrow();
    });

    it('should reject a tampered token', async () => {
      const token = await signTestAccessToken('user-1');
      const tampered = token.slice(0, -5) + 'XXXXX';
      await expect(verifyAccessToken(tampered)).rejects.toThrow();
    });

    it('should reject token with missing sub', async () => {
      const token = await new SignJWT({ type: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(secret);
      await expect(verifyAccessToken(token)).rejects.toThrow();
    });

    it('should reject an expired token', async () => {
      const token = await new SignJWT({ sub: 'user-1', type: 'access' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('0s')
        .sign(secret);
      await expect(verifyAccessToken(token)).rejects.toThrow();
    });

    it('should reject token with tampered algorithm', async () => {
      // Create a valid HS256 token, then tamper the header to claim 'none'
      const token = await signTestAccessToken('user-1');
      const parts = token.split('.');
      const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      header.alg = 'none';
      const tampered = [Buffer.from(JSON.stringify(header)).toString('base64url'), parts[1], parts[2]].join('.');
      await expect(verifyAccessToken(tampered)).rejects.toThrow();
    });

    it('should reject token missing type claim', async () => {
      const token = await new SignJWT({ sub: 'user-1' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(secret);
      await expect(verifyAccessToken(token)).rejects.toThrow();
    });
  });
});
