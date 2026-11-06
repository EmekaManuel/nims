import { useEffect, useLayoutEffect } from 'react';
import { continueRender, delayRender } from 'remotion';
import { loadFont as loadFredoka } from '@remotion/google-fonts/Fredoka';
import { loadFont as loadFigtree } from '@remotion/google-fonts/Figtree';
import '../../../web/src/styles.css';
import type { GameState } from '../../../web/src/api';
import { IconSprite } from '../../../web/src/art/icons';
import { GameScreen } from '../../../web/src/game/GameScreen';
import { ServicesProvider, type Services } from '../../../web/src/lib/services';
import type { Shot } from './model';

// The game's own fonts, so the screen looks exactly as it does in the browser.
loadFredoka('normal', { weights: ['400', '500', '600', '700'] });
loadFigtree('normal', { weights: ['400', '500', '600', '700'] });
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

export interface Camera { x: number; y: number; zoom: number }

/** The real game screen for one recorded shot, at 1920x1080, with an optional camera (zoom and pan on the real vector UI). */
export const Screen: React.FC<{ shot: Shot; camera?: Camera; hover?: boolean }> = ({ shot, camera, hover }) => {
  const z = camera?.zoom ?? 1;
  const tx = camera ? Math.min(0, Math.max(1920 - 1920 * z, 1920 / 2 - camera.x * z)) : 0;
  const ty = camera ? Math.min(0, Math.max(1080 - 1080 * z, 1080 / 2 - camera.y * z)) : 0;
  // The tooltip is drawn outside the zoomed screen; scale it with the camera so it keeps its place and size relative to the UI.
  useLayoutEffect(() => { document.body.style.setProperty('--cam', String(z)); }, [z]);
  const state = shot.state as GameState;
  return (
    <>
      <style>{`
        *, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent; }
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
              toast={shot.toast ?? null}
            />
          </div>
        </div>
        <Hover keyName={hover ? shot.hover ?? null : null} expect={shot.voiceText} />
      </ServicesProvider>
    </>
  );
};
