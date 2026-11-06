/**
 * "Continue with Google". The player is sent to Google, comes back with a one-time code, and the server
 * exchanges it (server to server, over TLS) for the player's verified email. From there it is the same as the
 * emailed link: that email picks the account, so someone who signed in by email earlier gets the same account.
 *
 * Only a verified email is accepted. An unverified one could belong to someone else.
 */
export interface GoogleOptions {
  clientId: string;
  clientSecret: string;
  /** Must match the redirect URI registered in Google Cloud, e.g. https://your-app/auth/google/callback */
  redirectUri: string;
  fetchImpl?: typeof fetch;
}

export interface Google {
  /** Where to send the player's browser. */
  authUrl(state: string): string;
  /** Trade the one-time code for the player's verified email, or null if Google says no or the email is not verified. */
  emailFor(code: string): Promise<string | null>;
}

const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const USERINFO = 'https://openidconnect.googleapis.com/v1/userinfo';

export function createGoogle(o: GoogleOptions): Google {
  const f = o.fetchImpl ?? fetch;
  return {
    authUrl(state) {
      const q = new URLSearchParams({
        client_id: o.clientId,
        redirect_uri: o.redirectUri,
        response_type: 'code',
        scope: 'openid email',
        state,
        prompt: 'select_account',
      });
      return `${AUTH}?${q}`;
    },
    async emailFor(code) {
      try {
        const t = await f(TOKEN, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ code, client_id: o.clientId, client_secret: o.clientSecret, redirect_uri: o.redirectUri, grant_type: 'authorization_code' }),
          signal: AbortSignal.timeout(8_000),
        });
        if (!t.ok) return null;
        const { access_token } = (await t.json()) as { access_token?: string };
        if (!access_token) return null;
        const u = await f(USERINFO, { headers: { authorization: `Bearer ${access_token}` }, signal: AbortSignal.timeout(8_000) });
        if (!u.ok) return null;
        const info = (await u.json()) as { email?: string; email_verified?: boolean };
        return info.email && info.email_verified === true ? info.email : null;
      } catch {
        return null;
      }
    },
  };
}
