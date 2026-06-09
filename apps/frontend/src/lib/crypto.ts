// PBKDF2 client-side password pre-hashing via Web Crypto API
// Prevents the raw password from being sent over the wire.
// Falls back to a legacy app-level salt for accounts created before per-user salts.

const PBKDF2_ITERATIONS = 600_000; // OWASP 2023 recommendation for SHA-256
const PBKDF2_HASH = 'SHA-256';
const PBKDF2_KEY_LEN = 32; // 256 bits
const LEGACY_SALT = 'co-md-pbkdf2-salt-v1';

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return hex;
}

/** Generate a random 16-byte PBKDF2 salt, returned as 32 hex chars.
 *  NOTE: The salt is passed as a hex STRING (not raw bytes) to PBKDF2.
 *  This is intentional and consistent with the backend — changing to
 *  raw-byte encoding would break all existing password hashes. */
export function generatePbkdf2Salt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

export async function preHashPassword(password: string, salt = LEGACY_SALT): Promise<string> {
  const enc = new TextEncoder();
  const keyMaterial = await self.crypto.subtle.importKey(
    'raw',
    enc.encode(password),
    'PBKDF2',
    false,
    ['deriveBits']
  );

  const saltBytes = enc.encode(salt);
  const derivedBits = await self.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: saltBytes,
      iterations: PBKDF2_ITERATIONS,
      hash: PBKDF2_HASH,
    },
    keyMaterial,
    PBKDF2_KEY_LEN * 8
  );

  return bytesToHex(new Uint8Array(derivedBits));
}
