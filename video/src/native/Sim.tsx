import { IconSprite } from '../../../web/src/art/icons';
import type { FastForward } from '../../../web/src/api';
import { FastForwardPage } from '../../../web/src/sim/Fastforward';
import ffrun from '../data/ffrun.json';

const DATA = ffrun as unknown as FastForward;

/** The fast-forward dashboard, drawn from a run of the real engine, frozen at `hour` and scrolled `scroll` pixels down. */
export const SimDashboard: React.FC<{ hour: number; scroll: number }> = ({ hour, scroll }) => (
  <div style={{ position: 'absolute', left: 0, top: 0, width: 1920, height: 1080, overflow: 'hidden', background: '#fff' }}>
    <style>{`*, *::before, *::after { animation: none !important; transition: none !important; }`}</style>
    <div style={{ width: 1920, transform: `translateY(${-scroll}px)` }}>
      <IconSprite />
      <FastForwardPage replay={{ data: DATA, cursor: Math.max(0, Math.min(DATA.hours - 1, Math.round(hour))) }} />
    </div>
  </div>
);
export const SIM_HOURS = DATA.hours;
