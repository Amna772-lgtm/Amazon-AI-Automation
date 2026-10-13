import { createCipheriv, createDecipheriv, createHash, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * AES-256-GCM envelope for secrets at rest (integration API keys, SMTP passwords, OAuth tokens).
 * Format: "v1:<iv b64>:<auth tag b64>:<ciphertext b64>".
 */
const VERSION = 'v1';

export function loadEncryptionKey(b64 = process.env.ENCRYPTION_KEY): Buffer {
  if (!b64) throw new Error('ENCRYPTION_KEY is not set');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  return key;
}

export function encryptString(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv.toString('base64'), tag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptString(payload: string, key: Buffer): string {
  const [version, ivB64, tagB64, dataB64] = payload.split(':');
  if (version !== VERSION || !ivB64 || !tagB64 || dataB64 === undefined) {
    throw new Error('Unsupported ciphertext format');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]).toString('utf8');
}

export function encryptJson(value: unknown, key: Buffer): string {
  return encryptString(JSON.stringify(value), key);
}

export function decryptJson<T = unknown>(payload: string, key: Buffer): T {
  return JSON.parse(decryptString(payload, key)) as T;
}

/** "sk-abc...wxyz" → "••••wxyz" — safe to show in the UI. */
export function maskSecret(secret: string): string {
  if (!secret) return '';
  return `••••${secret.slice(-4)}`;
}

export function sha256Hex(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

/** URL-safe random token (for invitations, refresh tokens). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
