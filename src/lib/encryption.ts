import { createCipheriv, createDecipheriv, createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 16;
const SALT_LENGTH = 32;

function deriveKey(secret: string, salt: Buffer): Buffer {
  return scryptSync(secret, salt, KEY_LENGTH);
}

export function encrypt(plaintext: string): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY environment variable is not set');

  const salt = randomBytes(SALT_LENGTH);
  const iv = randomBytes(IV_LENGTH);
  const key = deriveKey(secret, salt);

  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  // Format: salt:iv:tag:encrypted (all hex)
  return [
    salt.toString('hex'),
    iv.toString('hex'),
    tag.toString('hex'),
    encrypted.toString('hex'),
  ].join(':');
}

export function decrypt(ciphertext: string): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY environment variable is not set');

  const parts = ciphertext.split(':');
  if (parts.length !== 4) throw new Error('Invalid ciphertext format');

  const [saltHex, ivHex, tagHex, encryptedHex] = parts;
  const salt = Buffer.from(saltHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');

  const key = deriveKey(secret, salt);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

const SESSION_HMAC_PREFIX = 'v1:';

/** Signs session payload with HMAC-SHA256. Returns "v1:<payload>.<signature>" */
export function signSession(payload: string): string {
  const secret = process.env.ENCRYPTION_KEY;
  if (!secret) throw new Error('ENCRYPTION_KEY environment variable is not set');
  const sig = createHmac('sha256', secret).update(payload).digest('hex');
  return `${SESSION_HMAC_PREFIX}${payload}.${sig}`;
}

/** Verifies HMAC signature and returns the original payload, or null on failure. */
export function verifySession(token: string): string | null {
  try {
    const secret = process.env.ENCRYPTION_KEY;
    if (!secret) return null;
    if (!token.startsWith(SESSION_HMAC_PREFIX)) return null;
    const withoutPrefix = token.slice(SESSION_HMAC_PREFIX.length);
    const lastDot = withoutPrefix.lastIndexOf('.');
    if (lastDot === -1) return null;
    const payload = withoutPrefix.slice(0, lastDot);
    const sig = withoutPrefix.slice(lastDot + 1);
    const expected = createHmac('sha256', secret).update(payload).digest('hex');
    if (!timingSafeEqual(Buffer.from(sig, 'hex'), Buffer.from(expected, 'hex'))) return null;
    return payload;
  } catch {
    return null;
  }
}
