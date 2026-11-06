import { FormEvent, useState } from 'react';
import { api } from '../api';
import { Mascot } from '../art/Mascot';
import { TextField } from '../ui';

/** The sign-in screen. `presetEmail` (used by the demo video) shows a fixed email instead of what is typed. */
export function Login({ onIn, presetEmail }: { onIn: () => void; presetEmail?: string }) {
  const [typed, setEmail] = useState('');
  const email = presetEmail ?? typed;
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(() => (new URLSearchParams(location.search).get('login') === 'expired' ? 'That link has expired or was already used. Ask for a new one.' : ''));
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

/** Tiny hash router: "#sim" is the open fast-forward dashboard; anything else is the game. */
