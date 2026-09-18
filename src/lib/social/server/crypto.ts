import 'server-only';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * AES-256-GCM for tokens at rest. The key comes from SOCIAL_ENCRYPTION_KEY
 * (any string; it is hashed to 32 bytes so a base64/hex key and a long
 * passphrase both work). Rotating the key invalidates stored tokens, which
 * simply means "connect Facebook again".
 */

function key(): Buffer {
  const raw = process.env.SOCIAL_ENCRYPTION_KEY;
  if (!raw || raw.length < 16) {
    throw new Error('SOCIAL_ENCRYPTION_KEY חסר או קצר מדי (לפחות 16 תווים).');
  }
  return createHash('sha256').update(raw).digest();
}

export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key(), iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64')}:${tag.toString('base64')}:${ct.toString('base64')}`;
}

export function decrypt(payload: string): string {
  const [v, ivB64, tagB64, ctB64] = payload.split(':');
  if (v !== 'v1' || !ivB64 || !tagB64 || !ctB64) throw new Error('פורמט טוקן מוצפן לא תקין.');
  const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}

/** HMAC used to sign the OAuth state cookie. */
export function sign(value: string): string {
  return createHmac('sha256', key()).update(value).digest('hex');
}

export function verifySignature(value: string, signature: string): boolean {
  const expected = Buffer.from(sign(value));
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString('hex');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}
