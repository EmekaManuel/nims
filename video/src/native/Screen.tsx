import { useEffect, useLayoutEffect, useRef } from 'react';
import { continueRender, delayRender, useCurrentFrame } from 'remotion';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
import { loadFont as loadFigtree } from '@remotion/google-fonts/Figtree';
import '../../../web/src/styles.css';
import type { GameState } from '../../../web/src/api';
import { IconSprite } from '../../../web/src/art/icons';
import { GameScreen } from '../../../web/src/game/GameScreen';
import { Login } from '../../../web/src/game/Login';
import { Loading } from '../../../web/src/game/Loading';
import { ServicesProvider, type Services } from '../../../web/src/lib/services';
import { DistrictMap3D, type VideoDrive } from '../../../web/src/game/Map3D';
import { SOURCE_STOP, STALL_STOP } from '../../../web/src/game/paths';
import { SCROLL, type Shot } from './model';

// The game's own fonts, so the screen looks exactly as it does in the browser.
loadFredoka('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'], ignoreTooManyRequestsWarning: true });
loadFigtree('normal', { weights: ['400', '500', '600', '700'], subsets: ['latin'], ignoreTooManyRequestsWarning: true });
try { localStorage.setItem('nims-sound', 'off'); } catch { /* the video makes its own sound */ }

// In a browser the game closes a tooltip when the page scrolls or resizes. The renderer can fire those while it takes a frame,
// so swallow them here (this listener is registered first, so the game's never runs).
for (const type of ['scroll', 'resize']) window.addEventListener(type, (e) => e.stopImmediatePropagation(), true);

const noop = () => {};
const act = new Proxy({}, { get: () => noop }) as never;

/** Recorded answers for the things the screen would ask a server for. Each holds the render until React has shown the answer. */
const servicesFor = (shot: Shot): Services => {
  const settled = <T,>(value: T): Promise<T> => {
    const h = delayRender('recorded answer');
    return Promise.resolve(value).then((v) => { setTimeout(() => continueRender(h), 120); return v; });
  };
  return {
    voice: () => settled({ text: shot.voiceText ?? null, audio: null }),
    gazette: () => settled(shot.gazette ?? null),
    chain: () => Promise.resolve(null),
  };
};

/** Scroll the open drawer so that the named section is at the top (the part a scene is about can sit below the fold). */
function ScrollTo({ name }: { name: string | undefined }) {
  useLayoutEffect(() => {
    if (!name) return;
    const el = document.querySelector<HTMLElement>(`[data-demo="${name}"]`);
    const body = document.querySelector<HTMLElement>('.drawer-body');
    if (el && body) body.scrollTop = Math.max(0, el.offsetTop - body.offsetTop - 14);
  });
  return null;
}

/** Pretend to hover a price (the game's own tooltip opens, with the recorded NEAR AI line), or stop hovering. */
function Hover({ keyName, expect }: { keyName: string | null; expect?: string }) {
  useEffect(() => {
    const h = delayRender('hover');
    let tries = 0;
    const tick = () => {
      const el = keyName ? document.querySelector<HTMLElement>(`[data-demo="${keyName}"]`) : null;
      if (keyName && el) el.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      if (!keyName) document.querySelectorAll<HTMLElement>('.tipwrap').forEach((e) => e.dispatchEvent(new MouseEvent('mouseout', { bubbles: true })));
      const bubble = document.querySelector('[role=tooltip]');
      const ok = keyName ? !!bubble && (!expect || (bubble.textContent ?? '').includes(expect.slice(0, 24))) : !bubble;
      if (ok || tries++ > 60) continueRender(h);
      else setTimeout(tick, 50);
    };
    tick();
  }, [keyName]);
  return null;
}

/** Hold a checkbox on or off (the game keeps that in the panel's own state, which a frame-by-frame render can't carry from one frame to the next). */
function ForceCheck({ id, checked }: { id: string; checked: boolean | undefined }) {
  useEffect(() => {
    if (checked === undefined) return;
    const h = delayRender('checkbox');
    let tries = 0;
    const tick = () => {
      const el = document.getElementById(id);
      const on = () => el?.getAttribute('aria-checked') === 'true';
      if (el && on() !== checked) el.click();
      if ((el && on() === checked) || tries++ > 40) continueRender(h);
      else setTimeout(tick, 40);
    };
    tick();
  }, [checked, id]);
  return null;
}

export interface Camera { x: number; y: number; zoom: number }

/** The 3D town in a shot: where the camera is, and how many seconds into the scene it is (which moves the townsfolk, the rain, the truck). */
export interface Town { t: number; camera: VideoDrive["camera"]; dpr?: number; travel?: boolean }
/** Everyone shops at every stall and source for the whole video, so a walker's route never changes when the picture cuts to another shot. */
const WALK_STOPS = [...Object.values(STALL_STOP), ...Object.values(SOURCE_STOP)];
/** The video is set at night: the hour is moved into the dark (9pm to 3am), keeping each shot's own place in the story. */
export const nightHour = (hour: number) => 21 + (hour % 7);

const cameraBox = (camera?: Camera) => {
  const z = camera?.zoom ?? 1;
  return {
    z,
    tx: camera ? Math.min(0, Math.max(1920 - 1920 * z, 1920 / 2 - camera.x * z)) : 0,
    ty: camera ? Math.min(0, Math.max(1080 - 1080 * z, 1080 / 2 - camera.y * z)) : 0,
  };
};

/** The game's real sign-in screen: Google, or play as a guest. */
export const LoginScreen: React.FC<{ camera?: Camera }> = ({ camera }) => {
  const { z, tx, ty } = cameraBox(camera);
  return (
    <>
      <style>{`*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent; }`}</style>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, overflow: 'hidden', background: '#fff' }}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
          <IconSprite />
          <Login onIn={noop} showGoogle />
        </div>
      </div>
    </>
  );
};

/** The real game screen for one recorded shot, at 1920x1080, with an optional camera (zoom and pan on the real vector UI). */
export const Screen: React.FC<{ shot: Shot; camera?: Camera; hover?: boolean; haggle?: boolean; dealsTab?: 'deals' | 'jobs'; town?: Town; night?: boolean; drawerAge?: number }> = ({ shot, camera, hover, haggle, dealsTab, town, night, drawerAge }) => {
  // A drawer that has just opened slides in over a fifth of a second (the game's own animation is paused for the video).
  const slide = drawerAge === undefined ? 1 : Math.min(1, Math.max(0, drawerAge / 0.22));
  const slideEase = 1 - Math.pow(1 - slide, 3);
  const { z, tx, ty } = cameraBox(camera);
  // The tooltip is drawn outside the zoomed screen; scale it with the camera so it keeps its place and size relative to the UI.
  // (Capped: the game places the bubble assuming its normal size, so a big bubble near the right edge would run off the screen.)
  useLayoutEffect(() => { document.body.style.setProperty('--cam', String(Math.min(z, 1.3))); }, [z]);
  const raw = shot.state as GameState;
  const state = night ? { ...raw, hour: nightHour(raw.hour) } : raw;
  // The 3D town draws itself in a canvas. Hold each frame until it has been drawn, so the picture is never caught half-way.
  const frame = useCurrentFrame();
  const pending = useRef<number | null>(null);
  const current = useRef(frame);
  current.current = frame;
  useLayoutEffect(() => { if (town) pending.current = delayRender(`town ${frame}`); }, [frame, !!town]);
  const drive: VideoDrive | undefined = town ? {
    ...town,
    walkStops: WALK_STOPS,
    frameKey: frame,
    // only the signal from THIS frame's drawing may release the hold: a late one from an earlier frame would let a frame be captured with the wrong camera
    onDrawn: (key) => { if (key === current.current && pending.current !== null) { continueRender(pending.current); pending.current = null; } },
  } : undefined;
  return (
    <>
      <style>{`
        *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent; }
        /* room below the last section, so a drawer can be scrolled until the part the scene is about is at the top */
        .drawer-body::after { content: ''; display: block; min-height: 640px; }
        ${slide < 1 ? `.drawer { opacity: ${slideEase}; transform: translateX(${(1 - slideEase) * 70}px); }` : ''}
        .bubble { transform: scale(var(--cam, 1)); transform-origin: calc(var(--arrow, 18px) + 6px) 0; }
        .bubble.above { transform-origin: calc(var(--arrow, 18px) + 6px) 100%; }
      `}</style>
      <ServicesProvider value={servicesFor(shot)}>
        <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, overflow: 'hidden', background: '#fff' }}>
          <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transformOrigin: '0 0', transform: `translate(${tx}px, ${ty}px) scale(${z})` }}>
            <IconSprite />
            <GameScreen
              state={state}
              act={act}
              selected={shot.selected as never}
              onSelect={noop}
              tab={(shot.tab as never) ?? null}
              onTab={noop}
              onDrawerClose={noop}
              onFocus={noop}
              popups={[]}
              newsCount={0}
              sound
              onSound={noop}
              peakWorth={state.you.netWorth}
              onHelp={noop}
              onPickGoal={noop}
              dealsTab={dealsTab}
              toast={shot.toast ?? null}
              drive={drive}
            />
          </div>
        </div>
        <Hover keyName={hover ? shot.hover ?? null : null} expect={shot.voiceText} />
        <ForceCheck id="haggle" checked={haggle} />
        <ScrollTo name={SCROLL[shot.id]} />
      </ServicesProvider>
    </>
  );
};

/** The real full-screen loading animation, driven by the video clock (the game's CSS animations are paused and set to `t` seconds in). */
export const LoadingScreen: React.FC<{ t: number; scale?: number }> = ({ t, scale = 1.6 }) => (
  <>
    <style>{`
      .loading, .loading * { animation-play-state: paused !important; }
      .loading .hop, .loading .ground, .loading .c1, .loading .loading-bar i, .loading .dots i:nth-child(1) { animation-delay: ${-t}s !important; }
      .loading .c2 { animation-delay: ${0.7 - t}s !important; }
      .loading .c3 { animation-delay: ${1.4 - t}s !important; }
      .loading .dots i:nth-child(2) { animation-delay: ${0.2 - t}s !important; }
      .loading .dots i:nth-child(3) { animation-delay: ${0.4 - t}s !important; }
    `}</style>
    <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, overflow: 'hidden' }}>
      <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, transform: `scale(${scale})`, transformOrigin: '50% 50%' }}>
        <Loading />
      </div>
    </div>
  </>
);

/**
 * The 3D town on its own, filling the picture (no game screen around it): used behind the title cards.
 * Holds each frame until the canvas has drawn it.
 */
export const TownCanvas: React.FC<{ shot: Shot; town: Town; night?: boolean; width?: number; height?: number; banners?: boolean }> = ({ shot, town, night = true, width = 1920, height = 1080, banners = true }) => {
  const frame = useCurrentFrame();
  const pending = useRef<number | null>(null);
  const current = useRef(frame);
  current.current = frame;
  useLayoutEffect(() => { pending.current = delayRender(`backdrop ${frame}`); }, [frame]);
  const raw = shot.state as GameState;
  const state = night ? { ...raw, hour: nightHour(raw.hour) } : raw;
  const drive: VideoDrive = { ...town, walkStops: WALK_STOPS, banners, frameKey: frame, onDrawn: (key) => { if (key === current.current && pending.current !== null) { continueRender(pending.current); pending.current = null; } } };
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width, height, overflow: 'hidden' }}>
      <style>{`.townfill, .townfill > .map3d { width: ${width}px; height: ${height}px; }`}</style>
      <div className="townfill"><DistrictMap3D state={state} selected={null} onSelect={noop} popups={[]} drive={drive} /></div>
    </div>
  );
};
