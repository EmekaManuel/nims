import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ActionResponse, api, GameState } from './api';
import { DistrictMap, Selection } from './Map';
import { Hint, SourcePanel, StallPanel, Actions } from './Panels';
import { Hud } from './Hud';
import { PriceBoard } from './PriceBoard';

function Login({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [devLink, setDevLink] = useState('');

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const r = await api.requestLogin(email);
    setBusy(false);
    if (r.error) return setMsg(r.error);
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
      <h1>Oja</h1>
      <p className="lede">A Lagos market district where every trader runs on their own. Start with a wheelbarrow. Read the market. End up with a share in half the stalls.</p>
      <form onSubmit={submit}>
        <label>
          Your email
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
        </label>
        <button className="primary" disabled={busy || !email}>Send me a link</button>
      </form>
      {devLink && <button onClick={open}>Open my link (development)</button>}
      {msg && <p role="status" className="note">{msg}</p>}
      <p className="muted small">No password, no wallet — just your email.</p>
    </main>
  );
}

export function App() {
  const [state, setState] = useState<GameState | null>(null);
  const [checked, setChecked] = useState(false);
  const [selected, setSelected] = useState<Selection>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<number>();

  const refresh = useCallback(async () => {
    const s = await api.state().catch(() => null);
    setState(s);
    setChecked(true);
  }, []);

  useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 2000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const run = useCallback((p: Promise<ActionResponse>) => {
    void p.then((r) => {
      if (r.state) setState(r.state);
      setToast({ ok: r.ok, text: r.message });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), 5000);
    });
  }, []);

  const act: Actions = {
    sell: (m, i, u, h) => run(api.sell(m, i, u, h)),
    buy: (m, i, u, h) => run(api.buy(m, i, u, h)),
    gather: (i) => run(api.gather(i)),
    upgrade: (to) => run(api.upgrade(to)),
  };

  if (!checked) return <main className="login"><p className="muted">Opening the market…</p></main>;
  if (!state) return <Login onIn={refresh} />;

  const stall = selected?.kind === 'stall' ? state.stalls.find((s) => s.id === selected.id) : undefined;

  return (
    <div className="game">
      <Hud state={state} act={act} />
      <div className="aria-live" aria-live="polite">{toast?.text}</div>
      {toast && <div className={`toast ${toast.ok ? 'good' : 'bad'}`}>{toast.text}</div>}
      <div className="layout">
        <div className="mapcol">
          <DistrictMap state={state} selected={selected} onSelect={setSelected} />
          <section className="panel feed" aria-label="What's happening">
            <h2>Around town</h2>
            {state.events.length === 0 ? <p className="muted">All quiet so far.</p> : (
              <ul>{state.events.map((e, i) => <li key={i}><span className="muted">Day {Math.floor(e.hour / 24) + 1}, {String(e.hour % 24).padStart(2, '0')}:00</span> {e.text}</li>)}</ul>
            )}
          </section>
        </div>
        <div className="sidecol">
          {stall ? <StallPanel stall={stall} state={state} act={act} /> : selected?.kind === 'source' ? <SourcePanel item={selected.item} state={state} act={act} /> : <Hint />}
          <PriceBoard state={state} />
        </div>
      </div>
    </div>
  );
}
