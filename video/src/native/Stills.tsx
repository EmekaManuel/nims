import { AbsoluteFill, getInputProps } from 'remotion';
import { Record } from '../cards';
import { BODY, C, Mark } from '../ui';
import { Background } from './Background';
import { shot } from './model';
import { SimDashboard } from './Sim';
import { Screen, TownCanvas } from './Screen';
import type { V3 } from './town';

interface Props {
  kind: 'app' | 'hero' | 'town' | 'dashboard' | 'dao';
  /** app: which recorded shot, and what to change about it */
  shot?: string; tab?: string | null; selected?: null; hover?: boolean;
  pos?: V3; look?: V3; fov?: number; t?: number;
  /** dashboard */
  hour?: number; scroll?: number;
}

/** Still pictures of the real game for the README and for posts: `npx remotion still src/index.ts Img out/x.jpg --props='{"kind":"app",...}'`. */
export const Stills: React.FC = () => {
  const p = getInputProps() as unknown as Props;
  const camera = { position: p.pos ?? [0, 9.5, 11], target: p.look ?? [0, 0, -0.5], fov: p.fov ?? 38 };
  const town = { t: p.t ?? 40, camera, dpr: 2 };
  if (p.kind === 'dashboard') return <SimDashboard hour={p.hour ?? 167} scroll={p.scroll ?? 0} />;
  if (p.kind === 'town') return <TownCanvas shot={shot('town')} town={town} />;
  if (p.kind === 'dao') return <AbsoluteFill><Background /><Record /></AbsoluteFill>;
  if (p.kind === 'hero') {
    return (
      <AbsoluteFill>
        <TownCanvas shot={shot('town')} town={town} />
        <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(8,18,48,.35) 0%, rgba(8,18,48,.55) 55%, rgba(8,18,48,.8) 100%)' }} />
        <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 34, marginBottom: 30 }}>
            <Mark size={205} />
            <div style={{ font: `700 190px/1 ${BODY}`, color: C.ink, letterSpacing: -4 }}>Nims</div>
          </div>
          <div style={{ font: `600 56px ${BODY}`, color: C.ink }}>A market town run by AI merchants.</div>
          <div style={{ font: `700 56px ${BODY}`, color: C.gold, marginTop: 8 }}>The economy is the game.</div>
        </AbsoluteFill>
      </AbsoluteFill>
    );
  }
  const base = shot(p.shot ?? 'town');
  const sh = { ...base, tab: p.tab === undefined ? base.tab : p.tab, selected: p.selected === undefined ? base.selected : p.selected };
  return <Screen shot={sh} night town={town} hover={p.hover} />;
};
