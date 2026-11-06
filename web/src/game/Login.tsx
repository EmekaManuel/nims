import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';
import { Mascot } from '../art/Mascot';
import { TextField } from '../ui';

/** The sign-in screen. `presetEmail` and `showGoogle` (used by the demo video) show a fixed email and force the Google button instead of asking the server. */
export function Login({ onIn, presetEmail, showGoogle }: { onIn: () => void; presetEmail?: string; showGoogle?: boolean }) {
  const [typed, setEmail] = useState('');
  const email = presetEmail ?? typed;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(() => {
    const why = new URLSearchParams(location.search).get('login');
    return why === 'expired' ? 'That link has expired or was already used. Ask for a new one.' : why === 'failed' ? 'Google sign-in did not work. Try again, or use your email.' : '';
  });
  const [asked, setGoogle] = useState(false);
  const google = showGoogle ?? asked;
  useEffect(() => {
    if (showGoogle !== undefined) return;
    let live = true;
    void api.providers().then((p) => live && setGoogle(p.google));
    return () => { live = false; };
  }, [showGoogle]);
  /** Something wrong with the email itself, shown on the field. */
  const [error, setError] = useState('');
  const [devLink, setDevLink] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    setError('');
    const r = await api.requestLogin(email);
    setBusy(false);
    if (r.error) return setError(r.error);
    if (r.devLink) setDevLink(r.devLink);
    else setMsg('Check your email — we sent you a link to come in.');
  }

  async function open() {
    const r = await api.openLink(devLink);
    if (r.error) setMsg(r.error);
    else onIn();
  }

  return (
    <main className="login">
      <Mascot size={84} mood="cheer" />
      <h1>Nims</h1>
      <p className="lede">A market town where every trader runs on their own. Start with a wheelbarrow. Read the market. End up with a share in half the stalls.</p>
      {google && (
        <>
          <a className="google" href="/auth/google"><GoogleMark />Continue with Google</a>
          <p className="or muted small">or use your email</p>
        </>
      )}
      <form onSubmit={submit}>
        <TextField label="Your email" type="email" required autoComplete="email" value={email} onChange={(v) => { setEmail(v); setError(''); }} placeholder="you@example.com" error={error || undefined} />
        <button className="primary" disabled={busy || !email}>Send me a link</button>
      </form>
      {devLink && <button onClick={open}>Open my link (development)</button>}
      {msg && <p role="status" className="note">{msg}</p>}
      <p className="muted small">Buy low, carry it, sell high. No password, no wallet — just your email.</p>
      <a className="simlink" href="#sim">Or watch a week of the market unfold →</a>
    </main>
  );
}

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.5 5.8c4.4-4.1 7.1-10.1 7.1-17.5z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.5-5.8c-2.1 1.4-4.9 2.3-8.4 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

/** Tiny hash router: "#sim" is the open fast-forward dashboard; anything else is the game. */
