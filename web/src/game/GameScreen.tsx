import type { Actions } from './Panels';
import type { Focus, GameState } from '../api';
import { BusinessPanel, StallOffer } from './Business';
import { Confetti, Dock, Drawer, type Tab } from './Dock';
import { DealsDrawer, type Which } from './DealsDrawer';
import { Hud } from './Hud';
import { DistrictMap, type Popup, type Selection } from './Map';
import { Mission } from './Mission';
import { NewsFeed } from './NewsFeed';
import { SourcePanel, StallPanel } from './Panels';
import { PriceBoard } from './PriceBoard';

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
          <div className="mapscroll"><DistrictMap state={state} selected={p.selected} onSelect={p.onSelect} popups={p.popups} /></div>
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
