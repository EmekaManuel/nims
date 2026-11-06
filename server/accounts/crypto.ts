/** Small crypto helpers: AES-256-GCM for player keys at rest, HMAC for login/session tokens. */
import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const keyOf = (hex: string) => {
  const k = Buffer.from(hex, 'hex');
  if (k.length !== 32) throw new Error('Secret must be 32 bytes of hex (64 chars)');
  return k;
};

/** Encrypt a secret string. Output: base64(iv | tag | ciphertext). */
export function encrypt(plain: string, masterKeyHex: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(masterKeyHex), iv);
  const body = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
}

export function decrypt(blob: string, masterKeyHex: string): string {
  const raw = Buffer.from(blob, 'base64');
  const d = createDecipheriv('aes-256-gcm', keyOf(masterKeyHex), raw.subarray(0, 12));
  d.setAuthTag(raw.subarray(12, 28));
  return Buffer.concat([d.update(raw.subarray(28)), d.final()]).toString('utf8');
}

const b64 = (b: Buffer | string) => Buffer.from(b).toString('base64url');

/** Sign a JSON payload: base64url(payload).base64url(hmac). */
export function signToken(payload: object, secretHex: string): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${b64(createHmac('sha256', keyOf(secretHex)).update(body).digest())}`;
}

/** Returns the payload, or null if the signature is wrong or the token is malformed. */
export function verifyToken<T>(token: string, secretHex: string): T | null {
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  const want = createHmac('sha256', keyOf(secretHex)).update(body).digest();
  const got = Buffer.from(sig, 'base64url');
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    return JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as T;
  } catch {
    return null;
  }
}

export const hmacHex = (data: string, secretHex: string) =>
  createHmac('sha256', keyOf(secretHex)).update(data).digest('hex');

export const randomHex = (bytes = 16) => randomBytes(bytes).toString('hex');
