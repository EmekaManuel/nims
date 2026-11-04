import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { ActionResponse, api, ChainProof, coins, Focus, GameState, GoalKind } from './api';
import { DistrictMap, Popup, Selection, spotOf } from './Map';
import { Confetti, Dock, Drawer, Tab } from './Dock';
import { rankOf } from './rank';
import { setSound, sfx, soundOn } from './sfx';
import { SourcePanel, StallPanel, Actions } from './Panels';
import { Deals, Mission } from './Mission';
import { AwayModal, GoalPicker, HowToPlay } from './Modals';
import { BusinessPanel, StallOffer } from './Business';
import { Hud } from './Hud';
import { PriceBoard } from './PriceBoard';
import { IconSprite } from './icons';
import { Mascot } from './Mascot';
import { TextField } from './ui';
import { FastForwardPage } from './Fastforward';

function Login({ onIn }: { onIn: () => void }) {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
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

/** Where an action happened, so a floating number can appear there. */
type At = { kind: 'stall' | 'source'; id: string };

function NewsFeed({ state }: { state: GameState }) {
  // Optional proof for the curious. The game never waits for, or depends on, any of this.
  const [proof, setProof] = useState<ChainProof | null>(null);
  useEffect(() => { let live = true; void api.chain().then((p) => live && setProof(p)); return () => { live = false; }; }, []);
  return (
    <section className="panel feed" aria-label="What's happening">
      <h2>Around town</h2>
      {state.events.length === 0 ? <p className="muted">All quiet so far.</p> : (
        <ul>{state.events.map((e, i) => <li key={i}><span className="muted">Day {Math.floor(e.hour / 24) + 1}, {String(e.hour % 24).padStart(2, '0')}:00</span> {e.text}</li>)}</ul>
      )}
      {proof && <p className="small muted">Your goods and coins are real. <a href={proof.explorer} target="_blank" rel="noreferrer">See them on the public ledger →</a></p>}
      <p className="small"><a href="#sim">Watch a whole week of the market unfold →</a></p>
    </section>
  );
}

function Game() {
  const [state, setState] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  stateRef.current = state;
  const [checked, setChecked] = useState(false);
  const [selected, setSelected] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);
  const [popups, setPopups] = useState<Popup[]>([]);
  const [confetti, setConfetti] = useState(0);
  const [sound, setSoundState] = useState(soundOn());
  const [newsSeen, setNewsSeen] = useState<number | null>(null);
  /** The highest net worth you've reached. Rank follows it, so a rank never goes down when you sell into a flooded market. */
  const [peak, setPeak] = useState(0);
  const peakRef = useRef(0);
  const timer = useRef<number>();
  const popId = useRef(0);
  const [help, setHelp] = useState(() => {
    try { return !localStorage.getItem('nims-seen-help'); } catch { return true; }
  });
  const [goalOpen, setGoalOpen] = useState(false);
  const asked = useRef(false);
  const closeHelp = () => {
    setHelp(false);
    try { localStorage.setItem('nims-seen-help', '1'); } catch { /* private mode: fine */ }
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

  // Remember the peak (silently on arrival, so reaching the game never fires a celebration).
  useEffect(() => {
    if (state && state.you.netWorth > peakRef.current) { peakRef.current = state.you.netWorth; setPeak(state.you.netWorth); }
  }, [state]);

  // Everything already in the news when you arrive counts as read.
  useEffect(() => {
    if (state && newsSeen === null) setNewsSeen(Math.max(-1, ...state.events.map((e) => e.hour)));
  }, [state, newsSeen]);

  const addPopup = useCallback((x: number, y: number, text: string, tone: Popup['tone']) => {
    const id = ++popId.current;
    setPopups((p) => [...p, { id, x, y, text, tone }]);
    window.setTimeout(() => setPopups((p) => p.filter((q) => q.id !== id)), 1800);
  }, []);

  /** Apply an action's result: update the game, show floating numbers where it happened, play a sound, celebrate. */
  const run = useCallback((p: Promise<ActionResponse>, at?: At) => {
    void p.then((r) => {
      const before = stateRef.current;
      let gained = 0;
      if (r.state) {
        const after = r.state;
        if (r.ok && before) {
          const spot = at ? spotOf(after, at) : null;
          gained = after.you.cash - before.you.cash;
          const carried = after.you.carrying - before.you.carrying;
          if (spot && gained > 0) addPopup(spot[0], spot[1], `+${coins(gained)}`, 'gain');
          else if (spot && gained < 0) addPopup(spot[0], spot[1], `−${coins(-gained)}`, 'spend');
          else if (spot && carried > 0) addPopup(spot[0], spot[1], `+${carried} collected`, 'info');
          const rankUp = rankOf(after.you.netWorth).level > rankOf(peakRef.current).level;
          if ((!before.goal?.done && after.goal?.done) || rankUp) {
            setConfetti((c) => c + 1);
            sfx.win();
            addPopup(430, 330, rankUp ? `Rank up: ${rankOf(after.you.netWorth).title}!` : 'Goal reached!', 'gain');
          }
        }
        setState(after);
      }
      if (!r.ok) sfx.error();
      else if (gained > 0) sfx.coin();
      else sfx.pop();
      setToast({ ok: r.ok, text: r.message });
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setToast(null), 5000);
    });
  }, [addPopup]);

  const act: Actions = {
    sell: (m, i, u, h) => run(api.sell(m, i, u, h), { kind: 'stall', id: m }),
    buy: (m, i, u, h) => run(api.buy(m, i, u, h), { kind: 'stall', id: m }),
    gather: (i) => run(api.gather(i), { kind: 'source', id: i }),
    upgrade: (to) => run(api.upgrade(to)),
    buyShares: (m, n) => run(api.buyShares(m, n), { kind: 'stall', id: m }),
    sellShares: (m, n) => run(api.sellShares(m, n), { kind: 'stall', id: m }),
    contribute: (m, amount) => run(api.contribute(m, amount), { kind: 'stall', id: m }),
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
  const toggleSound = () => { const next = !sound; setSound(next); setSoundState(next); if (next) sfx.pop(); };
  const openTab = (t: Tab) => {
    setSelected(null);
    setTab((cur) => (cur === t ? null : t));
    if (t === 'news' && state) setNewsSeen(Math.max(-1, ...state.events.map((e) => e.hour)));
  };

  if (!checked) return <main className="login"><Mascot size={72} /><p className="muted">Opening the market…</p></main>;
  if (offline && !state) {
    return (
      <main className="login">
        <Mascot size={72} />
        <h1>Nims</h1>
        <p className="note warn" role="alert">The market is closed for now: we can’t reach the game server. It will open automatically as soon as it’s back.</p>
        <p className="muted small">Running it yourself? Start everything with <code>npm run dev</code>.</p>
      </main>
    );
  }
  if (!state) return <Login onIn={refresh} />;

  const stall = selected?.kind === 'stall' ? state.stalls.find((s) => s.id === selected.id) : undefined;
  const newsCount = newsSeen === null ? 0 : state.events.filter((e) => e.hour > newsSeen).length;

  // What the drawer shows: whatever you tapped on the map, otherwise the menu tab you opened.
  let drawer: { title: string; body: React.ReactNode } | null = null;
  if (stall) drawer = { title: stall.name, body: <StallPanel stall={stall} state={state} act={act} /> };
  else if (selected?.kind === 'source') drawer = { title: 'Collect goods', body: <SourcePanel item={selected.item} state={state} act={act} /> };
  else if (selected?.kind === 'plot') drawer = { title: 'A free plot', body: <section className="panel"><h2>A free plot</h2><StallOffer state={state} act={act} focus={selected.market} /></section> };
  else if (tab === 'deals') drawer = { title: 'Deals', body: <Deals deals={state.deals} onFocus={focusOn} /> };
  else if (tab === 'prices') drawer = { title: 'Prices', body: <PriceBoard state={state} /> };
  else if (tab === 'business') drawer = { title: 'My business', body: <BusinessPanel state={state} act={act} onFocus={(id) => setSelected({ kind: 'stall', id })} /> };
  else if (tab === 'news') drawer = { title: 'News', body: <NewsFeed state={state} /> };

  return (
    <div className="shell">
      {offline && <div className="shock offline" role="alert">Lost touch with the game server. Reconnecting…</div>}
      <Hud state={state} act={act} onHelp={() => setHelp(true)} sound={sound} onSound={toggleSound} peakWorth={peak} />
      <main className="stage">
        <div className="viewport">
          <div className="mapscroll"><DistrictMap state={state} selected={selected} onSelect={(s) => { setSelected(s); }} popups={popups} /></div>
          <Mission state={state} onFocus={focusOn} onPickGoal={() => setGoalOpen(true)} />
        </div>
        {drawer && <Drawer title={drawer.title} onClose={() => (selected ? setSelected(null) : setTab(null))}>{drawer.body}</Drawer>}
      </main>
      <Dock tab={selected ? null : tab} onTab={openTab} newsCount={newsCount} />
      <div className="aria-live" aria-live="polite">{toast?.text}</div>
      {toast && <div className={`toast ${toast.ok ? 'good' : 'bad'}`}>{toast.text}</div>}
      {confetti > 0 && <Confetti key={confetti} />}
      {help && <HowToPlay onClose={closeHelp} />}
      {!help && state.away && <AwayModal away={state.away} onClose={() => act.ack()} />}
      {!help && !state.away && goalOpen && <GoalPicker goals={state.goals} current={state.goal?.kind} onPick={pickGoal} onClose={() => setGoalOpen(false)} />}
    </div>
  );
}
