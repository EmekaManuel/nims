import { AbsoluteFill } from 'remotion';
import { TownCanvas } from './native/Screen';
import { shot } from './native/model';
import { BODY, C, Mark } from './ui';

/** The README banner (1600x640): the real 3D town at night, with the title over a dark wash on the left. Render: npx remotion still src/index.ts Banner out/banner.png */
const tags = ['AI merchants', 'Player-run council', 'NEP-245 goods', 'DAO record'];

export const Banner: React.FC = () => (
  <AbsoluteFill style={{ background: C.navy, fontFamily: BODY }}>
    <TownCanvas shot={shot('town')} banners={false} width={1600} height={640} town={{ t: 42, camera: { position: [3.2, 6.4, 12.6], target: [2.2, 0.2, -1.6], fov: 34 }, dpr: 2 }} />
    <AbsoluteFill style={{ background: 'linear-gradient(90deg, rgba(8,18,48,.96) 0%, rgba(8,18,48,.9) 34%, rgba(8,18,48,.45) 62%, rgba(8,18,48,.1) 100%)' }} />
    <div style={{ position: 'absolute', left: 90, top: 110, display: 'flex', alignItems: 'center', gap: 26 }}>
      <Mark size={150} />
      <div style={{ font: `700 150px/1 ${BODY}`, color: C.ink, letterSpacing: -5 }}>Nims</div>
    </div>
    <div style={{ position: 'absolute', left: 96, top: 318, font: `600 44px/1.25 ${BODY}`, color: C.ink, width: 800 }}>
      A market town run by AI merchants.<br /><span style={{ color: C.gold }}>The economy is the game.</span>
    </div>
    <div style={{ position: 'absolute', left: 96, top: 486, display: 'flex', gap: 12 }}>
      {tags.map((t) => <div key={t} style={{ padding: '10px 20px', borderRadius: 99, border: '1.5px solid rgba(127,176,255,.45)', background: 'rgba(9,18,46,.75)', font: `600 22px ${BODY}`, color: C.sky }}>{t}</div>)}
    </div>
    <div style={{ position: 'absolute', left: 96, bottom: 40, font: `600 18px ${BODY}`, color: C.mute, letterSpacing: 3 }}>NEAR · GAMES WITH REAL ECONOMIES · TESTNET</div>
  </AbsoluteFill>
);
