/**
 * Passwordless email login. The player clicks a link; there is no password, seed phrase or wallet.
 *
 * Flow: requestLogin(email) -> emailed magic link -> verifyMagic(token) -> session token (cookie).
 * Magic links are short-lived and single-use. Sessions are signed, expiring tokens.
 */
import { randomHex, signToken, verifyToken } from '../accounts/crypto';

const MAGIC_TTL_MS = 15 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 3_600_000;

interface Payload {
  t: 'magic' | 'session';
  e: string; // normalised email
  x: number; // expiry (ms since epoch)
  n: string; // nonce
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();
export const looksLikeEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

export class Auth {
  /** Magic-link nonces already used. In-memory is fine for a single server process. */
  private used = new Set<string>();

  constructor(
    private secretHex: string,
    private now: () => number = Date.now,
  ) {}

  magicToken(email: string): string {
    return signToken({ t: 'magic', e: normaliseEmail(email), x: this.now() + MAGIC_TTL_MS, n: randomHex(8) } satisfies Payload, this.secretHex);
  }

  /** Spend a magic link. Returns the email once; null if expired, forged or already used. */
  verifyMagic(token: string): string | null {
    const p = verifyToken<Payload>(token, this.secretHex);
    if (!p || p.t !== 'magic' || p.x < this.now() || this.used.has(p.n)) return null;
    this.used.add(p.n);
    return p.e;
  }

  sessionToken(email: string): string {
    return signToken({ t: 'session', e: normaliseEmail(email), x: this.now() + SESSION_TTL_MS, n: randomHex(8) } satisfies Payload, this.secretHex);
  }

  /** Email for a valid session token, else null. */
  verifySession(token: string | undefined): string | null {
    if (!token) return null;
    const p = verifyToken<Payload>(token, this.secretHex);
    return p && p.t === 'session' && p.x >= this.now() ? p.e : null;
  }
}
