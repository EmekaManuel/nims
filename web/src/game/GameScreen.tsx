import { lazy, Suspense, useEffect, useState } from 'react';
import type { Actions } from './Panels';
import type { Focus, GameState } from '../api';
import { BusinessPanel, StallOffer } from './Business';
import { Confetti, Dock, Drawer, type Tab } from './Dock';
import { DealsDrawer, type Which } from './DealsDrawer';
import { Hud } from './Hud';
import { DistrictMap, type Popup, type Selection } from './Map';
import { Map3DBoundary } from './Map3DBoundary';
import { useSpeedCheck } from './speed';
import { readViewChoice, SLOW_KEY } from './view';
import { Mission } from './Mission';
import { NewsFeed } from './NewsFeed';
import { SourcePanel, StallPanel } from './Panels';
import { PriceBoard } from './PriceBoard';

const DistrictMap3D = lazy(() => import('./Map3D').then((m) => ({ default: m.DistrictMap3D })));
import type { VideoDrive } from './Map3D';

export interface ToastView { ok: boolean; text: string; line?: string }

export interface GameScreenProps {
  state: GameState;
  act: Actions;
  selected: Selection;
  onSelect: (s: Selection) => void;
  tab: Tab | null;
  onTab: (t: Tab) => void;
  /** Close the drawer: the app clears the selection first, then the tab. */
  onDrawerClose: () => void;
  onFocus: (f: Focus) => void;
  popups: Popup[];
  newsCount: number;
  sound: boolean;
  onSound: () => void;
  peakWorth: number;
  onHelp: () => void;
  onPickGoal: () => void;
  /** Pin the Deals drawer to one tab (the demo video uses this). */
  dealsTab?: Which;
  offline?: boolean;
  toast?: ToastView | null;
  confetti?: number;
  /** The demo video shows the 3D town and drives its time and camera from outside (see Map3D.tsx). Hides the 2D/3D switch. */
  drive?: VideoDrive;
  /** Modals (how to play, welcome back, goal picker) go here, on top of the screen. */
  children?: React.ReactNode;
}

/**
 * The whole play screen, drawn from a state and a handful of choices (what is selected, which tab is open).
 * It holds no game logic of its own: the app feeds it live state, and the demo video feeds it recorded state,
 * so the video shows the real screen.
 */
export function GameScreen(p: GameScreenProps) {
  const { state, act } = p;
  // 3D where it will work well (a wide screen, a mouse, WebGL, no reduced motion), 2D otherwise; the button and a remembered choice override that
  const [choice] = useState(readViewChoice);
  const [view3d, setView3d] = useState(choice.view3d);
  // If the game picked 3D (the player did not), watch the first seconds: on a machine that runs it slowly, drop to 2D, say so, and don't try again by itself.
  const [watching, setWatching] = useState(choice.auto && choice.view3d);
  const [slowNotice, setSlowNotice] = useState(false);
  useSpeedCheck(watching && view3d && !p.drive, () => {
    setView3d(false);
    setWatching(false);
    setSlowNotice(true);
    try { localStorage.setItem(SLOW_KEY, '1'); } catch { /* ignore */ }
  });
  useEffect(() => {
    if (!slowNotice) return;
    const id = setTimeout(() => setSlowNotice(false), 9000);
    return () => clearTimeout(id);
  }, [slowNotice]);
  // The button is the player's own choice: it is remembered, and never second-guessed
  const toggle3d = () => {
    setWatching(false);
    setSlowNotice(false);
    setView3d((v) => { try { localStorage.setItem('nims-3d', v ? '0' : '1'); } catch { /* ignore */ } return !v; });
  };
  const sel = p.selected;
  const stall = sel?.kind === 'stall' ? state.stalls.find((s) => s.id === sel.id) : undefined;

  // What the drawer shows: whatever you tapped on the map, otherwise the menu tab you opened.
  let drawer: { title: string; body: React.ReactNode } | null = null;
  if (stall) drawer = { title: stall.name, body: <StallPanel stall={stall} state={state} act={act} /> };
  else if (p.selected?.kind === 'source') drawer = { title: 'Collect goods', body: <SourcePanel item={p.selected.item} state={state} act={act} /> };
  else if (p.selected?.kind === 'plot') drawer = { title: 'A free plot', body: <section className="panel"><h2>A free plot</h2><StallOffer state={state} act={act} focus={p.selected.market} /></section> };
  else if (p.tab === 'deals') drawer = { title: 'Deals', body: <DealsDrawer state={state} act={act} onFocus={p.onFocus} forceTab={p.dealsTab} /> };
  else if (p.tab === 'prices') drawer = { title: 'Prices', body: <PriceBoard state={state} /> };
  else if (p.tab === 'business') drawer = { title: 'My business', body: <BusinessPanel state={state} act={act} onFocus={(id) => p.onSelect({ kind: 'stall', id })} /> };
  else if (p.tab === 'news') drawer = { title: 'News', body: <NewsFeed state={state} /> };

  return (
    <div className="shell">
      {p.offline && <div className="shock offline" role="alert">Lost touch with the game server. Reconnecting…</div>}
      <Hud state={state} act={act} onHelp={p.onHelp} sound={p.sound} onSound={p.onSound} peakWorth={p.peakWorth} />
      <main className="stage">
        <div className="viewport">
          <div className="mapscroll">
            {view3d || p.drive
              ? (
                <Map3DBoundary fallback={<DistrictMap state={state} selected={p.selected} onSelect={p.onSelect} popups={p.popups} />} onFail={() => setView3d(false)}>
                  <Suspense fallback={<div className="map map3d-loading">Loading 3D town…</div>}><DistrictMap3D state={state} selected={p.selected} onSelect={p.onSelect} popups={p.popups} drive={p.drive} /></Suspense>
                </Map3DBoundary>
              )
              : <DistrictMap state={state} selected={p.selected} onSelect={p.onSelect} popups={p.popups} />}
            {!p.drive && <button type="button" className="view-toggle" onClick={toggle3d} aria-pressed={view3d}>{view3d ? '2D map' : '3D view'}</button>}
            {slowNotice && <div className="view-notice" role="status">The 3D town runs slowly here, so this is the flat map. <button type="button" onClick={toggle3d}>Try 3D anyway</button></div>}
          </div>
          <Mission state={state} onFocus={p.onFocus} onPickGoal={p.onPickGoal} />
        </div>
        {drawer && <Drawer title={drawer.title} onClose={p.onDrawerClose}>{drawer.body}</Drawer>}
      </main>
      <Dock tab={p.selected ? null : p.tab} onTab={p.onTab} newsCount={p.newsCount} />
      <div className="aria-live" aria-live="polite">{p.toast?.text} {p.toast?.line}</div>
      {p.toast && <div className={`toast ${p.toast.ok ? 'good' : 'bad'}`}>{p.toast.text}{p.toast.line && <div className="toastline">{p.toast.line}</div>}</div>}
      {!!p.confetti && p.confetti > 0 && <Confetti key={p.confetti} />}
      {p.children}
    </div>
  );
}
