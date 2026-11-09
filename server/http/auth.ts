/**
 * Sign-in without passwords, seed phrases or wallets: "Continue with Google", or play as a guest.
 *
 * A player is known by an identity string: their Google email, or a random guest identity (guestIdentity) that never
 * leaves the server. Sessions are signed, expiring tokens kept in an HttpOnly cookie.
 */
import { randomHex, signToken, verifyToken } from '../accounts/crypto';

const OAUTH_TTL_MS = 10 * 60_000;
const SESSION_TTL_MS = 30 * 24 * 3_600_000;

interface Payload {
  t: 'session' | 'oauth';
  e: string; // normalised email, or a guest identity
  x: number; // expiry (ms since epoch)
  n: string; // nonce
}

export const normaliseEmail = (e: string) => e.trim().toLowerCase();
export const looksLikeEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) && e.length <= 254;

/** Guests are known by a random identity on this made-up domain. It is never shown: the game shows "Guest" and a short code. */
export const GUEST_DOMAIN = 'guest.nims';
export const guestIdentity = () => `guest-${randomHex(6)}@${GUEST_DOMAIN}`;
export const isGuest = (identity: string) => identity.endsWith(`@${GUEST_DOMAIN}`);

export class Auth {
  constructor(
    private secretHex: string,
    private now: () => number = Date.now,
  ) {}

  /** A sign-in-with-a-provider attempt. The nonce also goes in a cookie, so only the browser that started it can finish it. */
  oauthState(): { state: string; nonce: string } {
    const nonce = randomHex(12);
    return { nonce, state: signToken({ t: 'oauth', e: '', x: this.now() + OAUTH_TTL_MS, n: nonce } satisfies Payload, this.secretHex) };
  }

  /** True only for an unexpired state we signed, whose nonce matches the one in the browser's cookie. */
  verifyOauthState(state: string | null | undefined, cookieNonce: string | undefined): boolean {
    if (!state || !cookieNonce) return false;
    const p = verifyToken<Payload>(state, this.secretHex);
    return !!p && p.t === 'oauth' && p.x >= this.now() && p.n === cookieNonce;
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
