import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Auth, guestIdentity, isGuest } from '../http/auth';
import { AccountStore, accountIdFor } from './accounts';
import { decrypt, encrypt, randomHex, signToken, verifyToken } from './crypto';

const SECRET = randomHex(32);
const MASTER = randomHex(32);

describe('crypto', () => {
  it('round-trips an encrypted secret and rejects a wrong key or tampering', () => {
    const blob = encrypt('ed25519:abc', MASTER);
    expect(blob).not.toContain('abc');
    expect(decrypt(blob, MASTER)).toBe('ed25519:abc');
    expect(() => decrypt(blob, randomHex(32))).toThrow();
    const raw = Buffer.from(blob, 'base64');
    raw[raw.length - 1] ^= 1;
    expect(() => decrypt(raw.toString('base64'), MASTER)).toThrow();
  });

  it('rejects forged tokens', () => {
    const t = signToken({ a: 1 }, SECRET);
    expect(verifyToken(t, SECRET)).toEqual({ a: 1 });
    expect(verifyToken(t, randomHex(32))).toBeNull();
    expect(verifyToken(t.replace(/^./, 'x'), SECRET)).toBeNull();
    expect(verifyToken('garbage', SECRET)).toBeNull();
  });
});

describe('auth', () => {
  it('guest identities are random, private and recognisable', () => {
    const a = guestIdentity(), b = guestIdentity();
    expect(a).toMatch(/^guest-[0-9a-f]{12}@guest\.nims$/);
    expect(a).not.toBe(b);
    expect(isGuest(a)).toBe(true);
    expect(isGuest('ada@example.com')).toBe(false);
  });

  it('sessions verify; sign-in-with-Google state is not a session', () => {
    const a = new Auth(SECRET);
    expect(a.verifySession(a.oauthState().state)).toBeNull();
    expect(a.verifySession(a.sessionToken('a@b.co'))).toBe('a@b.co');
    expect(a.verifySession(undefined)).toBeNull();
  });
});

describe('accounts', () => {
  const file = join(mkdtempSync(join(tmpdir(), 'oja-')), 'accounts.json');

  it('derives a stable, non-reversible account id', () => {
    const id = accountIdFor('ada@example.com', 'oja-items.testnet', MASTER);
    expect(id).toBe(accountIdFor(' ADA@example.com', 'oja-items.testnet', MASTER));
    expect(id).toMatch(/^p-[0-9a-f]{12}\.oja-items\.testnet$/);
    expect(id).not.toContain('ada');
  });

  it('creates a key once, stores it encrypted, and survives a reload', () => {
    const s = new AccountStore(file, 'oja-items.testnet', MASTER);
    const a = s.getOrCreate('ada@example.com');
    expect(s.getOrCreate('ada@example.com')).toEqual(a);
    expect(a.encryptedSecret).not.toContain('ed25519:');
    const secret = s.secretKeyOf('ada@example.com');
    expect(secret.startsWith('ed25519:')).toBe(true);
    const reloaded = new AccountStore(file, 'oja-items.testnet', MASTER);
    expect(reloaded.secretKeyOf('ada@example.com')).toBe(secret);
  });
});
