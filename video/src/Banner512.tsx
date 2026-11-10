import { AbsoluteFill } from 'remotion';
import { TownCanvas } from './native/Screen';
import { shot } from './native/model';
import { BODY, C, Mark } from './ui';

/** A 1600x512 banner (for forms/round pages that want that aspect): same title as the README's Banner, tightened to fit.
 * Render: npx remotion still src/index.ts Banner512 out/banner-512.png */
const tags = ['AI merchants', 'Live multiplayer', 'NEP-245 goods', 'DAO record'];

export const Banner512: React.FC = () => (
  <AbsoluteFill style={{ background: C.navy, fontFamily: BODY }}>
    <TownCanvas shot={shot('town')} banners={false} width={1600} height={512} town={{ t: 42, camera: { position: [3.2, 6.1, 11.6], target: [2.2, 0.2, -1.6], fov: 34 }, dpr: 2 }} />
    <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(8,18,48,.96) 0%, rgba(8,18,48,.9) 34%, rgba(8,18,48,.45) 62%, rgba(8,18,48,.1) 100%)' }} />
    <div style={{ position: 'absolute', left: 80, top: 56, display: 'flex', alignItems: 'center', gap: 20 }}>
      <Mark size={110} />
      <div style={{ font: `700 112px/1 ${BODY}`, color: C.ink, letterSpacing: -4 }}>Nims</div>
    </div>
    <div style={{ position: 'absolute', left: 84, top: 204, font: `600 33px/1.3 ${BODY}`, color: C.ink, width: 760 }}>
      A market town run by AI merchants.<br /><span style={{ color: C.gold }}>The economy is the game.</span>
    </div>
    <div style={{ position: 'absolute', left: 84, top: 350, display: 'flex', gap: 10 }}>
      {tags.map((t) => <div key={t} style={{ padding: '8px 16px', borderRadius: 99, border: '1.5px solid rgba(127,176,255,.45)', background: 'rgba(9,18,46,.75)', font: `600 18px ${BODY}`, color: C.sky }}>{t}</div>)}
    </div>
    <div style={{ position: 'absolute', left: 84, bottom: 28, font: `600 15px ${BODY}`, color: C.mute, letterSpacing: 2.5 }}>NEAR · GAMES WITH REAL ECONOMIES · TESTNET</div>
  </AbsoluteFill>
);
