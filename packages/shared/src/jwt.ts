import * as jose from 'jose';

const JWT_SECRET_RAW = process.env.JWT_SECRET;
if (!JWT_SECRET_RAW || JWT_SECRET_RAW.length < 32) {
  throw new Error('JWT_SECRET must be at least 32 characters');
}
const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_RAW);

export interface JWTPayload {
  sub: string; // userId
  sessionId?: string;
  exp: number;
  iat: number;
  type: 'access';
}

export async function verifyAccessToken(token: string): Promise<JWTPayload> {
  const { payload } = await jose.jwtVerify(token, JWT_SECRET, {
    algorithms: ['HS256'],
  });

  if (payload.type !== 'access') {
    throw new Error('Invalid token type: expected access token');
  }

  if (!payload.sub || typeof payload.sub !== 'string') {
    throw new Error('Invalid token: missing or invalid sub claim');
  }

  return payload as unknown as JWTPayload;
}
