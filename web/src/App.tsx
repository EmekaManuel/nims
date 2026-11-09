import { useCallback, useEffect, useRef, useState } from 'react';
import { ActionResponse, api, coins, Focus, GameState, GoalKind } from './api';
import { Popup, Selection, spotOf } from './game/Map';
import { Tab } from './game/Dock';
import { merchantReaction } from './lib/haggle';
import { rankOf } from './lib/rank';
import { setSound, sfx, soundOn } from './lib/sfx';
import { Actions } from './game/Panels';
import { AwayModal, GoalPicker, HowToPlay } from './game/Modals';
import { AvatarCreator } from './game/AvatarCreator';
import { GameScreen } from './game/GameScreen';
import { Loading } from './game/Loading';
import { IconSprite } from './art/icons';
import { Mascot } from './art/Mascot';
import { Login } from './game/Login';
import { FastForwardPage } from './sim/Fastforward';
import { TownBoard } from './town/TownBoard';

/** A friend's invite code from the link (?invite=CODE), kept until this player has signed in and it has been redeemed. */
const INVITE_KEY = 'nims-invite';
try {
  const code = new URLSearchParams(location.search).get('invite');
  if (code && /^[0-9a-z]{4,16}$/i.test(code)) localStorage.setItem(INVITE_KEY, code);
} catch { /* private mode: the invite is simply not remembered */ }

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
      {hash === '#sim' ? <FastForwardPage /> : hash === '#town' ? <TownBoard /> : <Game />}
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
  // A new player creates their trader first (look and name), then picks a goal.
  const needAvatar = !!state && state.you.avatar === null;
  const needGoal = !!state && !needAvatar && (state.goal === null || state.goal.done);
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

  // Setting off on a journey closes whatever drawer is open: nothing in it can be used on the road.
  const onRoad = !!state?.realm?.journey;
  useEffect(() => {
    if (onRoad) { setSelected(null); setTab(null); }
  }, [onRoad]);

  // Once signed in, redeem a friend's invite code from the link, once.
  const invited = useRef(false);
  useEffect(() => {
    if (!state || invited.current) return;
    invited.current = true;
    let code: string | null = null;
    try { code = localStorage.getItem(INVITE_KEY); localStorage.removeItem(INVITE_KEY); } catch { /* nothing to redeem */ }
    if (code) void api.redeemInvite(code).then((r) => setToast({ ok: r.ok, text: r.message }));
  }, [state]);

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
    setName: (name) => run(api.setName(name)),
    setAvatar: (a) => run(api.setAvatar(a)),
    travel: (realm) => run(api.travel(realm)),
    claimQuest: (id) => run(api.claimQuest(id)),
    claimDaily: () => run(api.claimDaily()),
    buyShares: (m, n) => run(api.buyShares(m, n), { kind: 'stall', id: m }),
    sellShares: (m, n) => run(api.sellShares(m, n), { kind: 'stall', id: m }),
    contribute: (m, amount) => run(api.contribute(m, amount), { kind: 'stall', id: m }),
    openStall: (market) => run(api.openStall(market)),
    councilPropose: (market, lever, to) => run(api.councilPropose(market, lever, to)),
    councilVote: (market, yes) => run(api.councilVote(market, yes)),
    stallStock: (i, u, shop) => run(api.stallStock(i, u, shop)),
    stallTake: (i, u, shop) => run(api.stallTake(i, u, shop)),
    stallPrice: (i, b, s, shop) => run(api.stallPrice(i, b, s, shop)),
    stallDeposit: (n, shop) => run(api.stallDeposit(n, shop)),
    stallWithdraw: (n, shop) => run(api.stallWithdraw(n, shop)),
    buyLand: (plot) => run(api.buyLand(plot)),
    listLand: (plot, price) => run(api.listLand(plot, price)),
    build: (plot, name) => run(api.build(plot, name)),
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

  if (!checked) return <Loading />;
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
      {!help && !state.away && needAvatar && <AvatarCreator first initial={null} name={state.you.name} onSave={(a, name) => { act.setAvatar(a); if (name) act.setName(name); }} />}
      {!help && !state.away && !needAvatar && goalOpen && <GoalPicker goals={state.goals} current={state.goal?.kind} onPick={pickGoal} onClose={() => setGoalOpen(false)} />}
    </GameScreen>
  );
}
