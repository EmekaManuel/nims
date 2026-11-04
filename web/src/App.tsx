import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ActionResponse, api, Focus, GameState, GoalKind } from './api';
import { DistrictMap, Selection } from './Map';
import { SourcePanel, StallPanel, Actions } from './Panels';
import { Deals, Mission } from './Mission';
import { AwayModal, GoalPicker, HowToPlay } from './Modals';
import { BusinessPanel, StallOffer } from './Business';
import { Hud } from './Hud';
import { PriceBoard } from './PriceBoard';
import { IconSprite } from './icons';
import { FastForwardPage } from './Fastforward';

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
      <p className="muted small">Buy low, carry it, sell high. No password, no wallet — just your email.</p>
      <a className="simlink" href="#sim">Or watch a week of the market unfold →</a>
    </main>
  );
}

/** Tiny hash router: "#sim" is the open fast-forward dashboard; anything else is the game. */
function useHash() {
  const [hash, setHash] = useState(() => location.hash);
  useEffect(() => {
    const on = () => setHash(location.hash);
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return hash;
}

export function App() {
  const hash = useHash();
  return (
    <>
      <IconSprite />
      {hash === '#sim' ? <FastForwardPage /> : <Game />}
    </>
  );
}

function Game() {
  const [state, setState] = useState<GameState | null>(null);
  const [checked, setChecked] = useState(false);
  const [selected, setSelected] = useState<Selection>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const timer = useRef<number>();
  const [help, setHelp] = useState(() => {
    try { return !localStorage.getItem('oja-seen-help'); } catch { return true; }
  });
  const [goalOpen, setGoalOpen] = useState(false);
  const asked = useRef(false);
  const closeHelp = () => {
    setHelp(false);
    try { localStorage.setItem('oja-seen-help', '1'); } catch { /* private mode: fine */ }
  };

  // Ask for a goal once when there isn't one (or when the last one is done).
  const needGoal = !!state && (state.goal === null || state.goal.done);
  useEffect(() => {
    if (needGoal && !asked.current) { asked.current = true; setGoalOpen(true); }
    if (!needGoal) asked.current = false;
  }, [needGoal]);

  const [offline, setOffline] = useState(false);
  const refresh = useCallback(async () => {
    try {
      setState(await api.state());
      setOffline(false);
    } catch {
      setOffline(true); // keep whatever we last showed; polling retries every 2s
    }
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
    buyShares: (m, n) => run(api.buyShares(m, n)),
    sellShares: (m, n) => run(api.sellShares(m, n)),
    contribute: (m, amount) => run(api.contribute(m, amount)),
    openStall: (market) => run(api.openStall(market)),
    stallStock: (i, u) => run(api.stallStock(i, u)),
    stallTake: (i, u) => run(api.stallTake(i, u)),
    stallPrice: (i, b, s) => run(api.stallPrice(i, b, s)),
    stallDeposit: (n) => run(api.stallDeposit(n)),
    stallWithdraw: (n) => run(api.stallWithdraw(n)),
    ack: () => run(api.ack()),
  };

  const focusOn = (f: Focus) => setSelected(!f ? null : f.kind === 'stall' ? { kind: 'stall', id: f.id } : { kind: 'source', item: f.id as never });
  const pickGoal = (k: GoalKind) => { run(api.goal(k)); setGoalOpen(false); };

  if (!checked) return <main className="login"><p className="muted">Opening the market…</p></main>;
  if (offline && !state) {
    return (
      <main className="login">
        <h1>Oja</h1>
        <p className="note warn" role="alert">The market is closed for now: we can’t reach the game server. It will open automatically as soon as it’s back.</p>
        <p className="muted small">Running it yourself? Start everything with <code>npm run dev</code>.</p>
      </main>
    );
  }
  if (!state) return <Login onIn={refresh} />;

  const stall = selected?.kind === 'stall' ? state.stalls.find((s) => s.id === selected.id) : undefined;

  return (
    <div className="game">
      {offline && <div className="shock" role="alert">Lost touch with the game server. Reconnecting…</div>}
      <Hud state={state} act={act} onHelp={() => setHelp(true)} />
      <Mission state={state} onFocus={focusOn} onPickGoal={() => setGoalOpen(true)} />
      <div className="aria-live" aria-live="polite">{toast?.text}</div>
      {toast && <div className={`toast ${toast.ok ? 'good' : 'bad'}`}>{toast.text}</div>}
      <div className="layout">
        <div className="mapcol">
          <div className="mapscroll"><DistrictMap state={state} selected={selected} onSelect={setSelected} /></div>
          <section className="panel feed" aria-label="What's happening">
            <h2>Around town</h2>
            {state.events.length === 0 ? <p className="muted">All quiet so far.</p> : (
              <ul>{state.events.map((e, i) => <li key={i}><span className="muted">Day {Math.floor(e.hour / 24) + 1}, {String(e.hour % 24).padStart(2, '0')}:00</span> {e.text}</li>)}</ul>
            )}
          </section>
        </div>
        <div className="sidecol">
          {stall && <StallPanel stall={stall} state={state} act={act} />}
          {selected?.kind === 'source' && <SourcePanel item={selected.item} state={state} act={act} />}
          {selected?.kind === 'plot' && (
            <section className="panel ledger"><h2>A free plot</h2><StallOffer state={state} act={act} focus={selected.market} /></section>
          )}
          <Deals deals={state.deals} onFocus={focusOn} />
          <BusinessPanel state={state} act={act} onFocus={(id) => setSelected({ kind: 'stall', id })} />
          <PriceBoard state={state} />
        </div>
      </div>
      {help && <HowToPlay onClose={closeHelp} />}
      {!help && state.away && <AwayModal away={state.away} onClose={() => act.ack()} />}
      {!help && !state.away && goalOpen && <GoalPicker goals={state.goals} current={state.goal?.kind} onPick={pickGoal} onClose={() => setGoalOpen(false)} />}
    </div>
  );
}
