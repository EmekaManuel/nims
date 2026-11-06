import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionResponse, api, coins, Focus, GameState, GoalKind } from './api';
import { Popup, Selection, spotOf } from './game/Map';
import { Tab } from './game/Dock';
import { merchantReaction } from './lib/haggle';
import { rankOf } from './lib/rank';
import { setSound, sfx, soundOn } from './lib/sfx';
import { Actions } from './game/Panels';
import { AwayModal, GoalPicker, HowToPlay } from './game/Modals';
import { GameScreen } from './game/GameScreen';
import { IconSprite } from './art/icons';
import { Mascot } from './art/Mascot';
import { Login } from './game/Login';
import { FastForwardPage } from './sim/Fastforward';

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

function Game() {
  const [state, setState] = useState<GameState | null>(null);
  const stateRef = useRef<GameState | null>(null);
  stateRef.current = state;
  const [checked, setChecked] = useState(false);
  const [selected, setSelected] = useState<Selection>(null);
  const [tab, setTab] = useState<Tab | null>(null);
  const [toast, setToast] = useState<{ ok: boolean; text: string; line?: string } | null>(null);
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
      // Won a haggle? The merchant reacts in their own words, a moment later. The plain result above never waits for it.
      if (r.ok && r.haggled) {
        void merchantReaction(r.haggled, api.haggle).then((line) => {
          if (!line) return;
          setToast((t) => (t ? { ...t, line } : t));
          window.clearTimeout(timer.current);
          timer.current = window.setTimeout(() => setToast(null), 7000);
        });
      }
    });
  }, [addPopup]);

  const act: Actions = {
    sell: (m, i, u, h) => run(api.sell(m, i, u, h), { kind: 'stall', id: m }),
    buy: (m, i, u, h) => run(api.buy(m, i, u, h), { kind: 'stall', id: m }),
    order: (m, i, u, price) => run(api.order(m, i, u, price), { kind: 'stall', id: m }),
    cancelOrder: (id) => run(api.cancelOrder(id)),
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
    scavenge: () => run(api.scavenge()),
    takeJob: (id) => run(api.takeJob(id)),
    deliverJob: () => run(api.deliverJob()),
    dropJob: () => run(api.dropJob()),
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

  const newsCount = newsSeen === null ? 0 : state.events.filter((e) => e.hour > newsSeen).length;

  return (
    <GameScreen
      state={state}
      act={act}
      selected={selected}
      onSelect={setSelected}
      tab={tab}
      onTab={openTab}
      onDrawerClose={() => (selected ? setSelected(null) : setTab(null))}
      onFocus={focusOn}
      popups={popups}
      newsCount={newsCount}
      sound={sound}
      onSound={toggleSound}
      peakWorth={peak}
      onHelp={() => setHelp(true)}
      onPickGoal={() => setGoalOpen(true)}
      offline={offline}
      toast={toast}
      confetti={confetti}
    >
      {help && <HowToPlay onClose={closeHelp} />}
      {!help && state.away && <AwayModal away={state.away} onClose={() => act.ack()} />}
      {!help && !state.away && goalOpen && <GoalPicker goals={state.goals} current={state.goal?.kind} onPick={pickGoal} onClose={() => setGoalOpen(false)} />}
    </GameScreen>
  );
}
