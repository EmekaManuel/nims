import { AbsoluteFill } from 'remotion';
import { BODY, C, Glass, Mark } from './ui';

/** The README banner (1600x640). Render: npx remotion still src/index.ts Banner ../docs/banner.png */
const tags = ['AI agent merchants', 'Email login', 'NEP-245 goods', 'Delivery orders'];
const cards = [
  { n: 'Mira\'s Greens', c: '#c2456f', p: 85, d: '▼', col: '#ff7a90', note: 'stock high, paying less' },
  { n: 'Lena\'s Textiles', c: '#27b36a', p: 1150, d: '▲', col: C.green, note: 'festive season, paying more' },
  { n: 'Anil Metals', c: '#e07a2f', p: 150, d: '●', col: C.sky, note: 'steady' },
];

export const Banner: React.FC = () => (
  <AbsoluteFill style={{ background: `radial-gradient(900px 600px at 12% 0%, #16328a 0%, transparent 60%), radial-gradient(800px 560px at 100% 100%, #1b3fb5 0%, transparent 55%), ${C.navy}`, fontFamily: BODY }}>
    <AbsoluteFill style={{ backgroundImage: 'linear-gradient(rgba(127,176,255,.07) 1px, transparent 1px), linear-gradient(90deg, rgba(127,176,255,.07) 1px, transparent 1px)', backgroundSize: '56px 56px', maskImage: 'radial-gradient(ellipse at 30% 50%, black 20%, transparent 80%)' }} />
    <div style={{ position: 'absolute', left: 90, top: 118, display: 'flex', alignItems: 'center', gap: 26 }}>
      <Mark size={150} />
      <div style={{ font: `700 150px/1 ${BODY}`, color: C.ink, letterSpacing: -5 }}>Nims</div>
    </div>
    <div style={{ position: 'absolute', left: 96, top: 322, font: `600 44px/1.25 ${BODY}`, color: C.ink, width: 800 }}>
      A market town run by AI merchants.<br /><span style={{ color: C.gold }}>The economy is the game.</span>
    </div>
    <div style={{ position: 'absolute', left: 96, top: 486, display: 'flex', gap: 12 }}>
      {tags.map((t) => <div key={t} style={{ padding: '10px 20px', borderRadius: 99, border: '1.5px solid rgba(127,176,255,.4)', background: 'rgba(9,18,46,.7)', font: `600 22px ${BODY}`, color: C.sky }}>{t}</div>)}
    </div>
    <div style={{ position: 'absolute', right: 80, top: 92, width: 520, display: 'flex', flexDirection: 'column', gap: 18 }}>
      {cards.map((m, i) => (
        <Glass key={m.n} style={{ padding: '20px 26px', display: 'flex', alignItems: 'center', gap: 20, marginLeft: i * -34, transform: `rotate(${(i - 1) * 1.2}deg)` }}>
          <div style={{ width: 58, height: 58, borderRadius: 58, background: m.c, display: 'grid', placeItems: 'center', font: `700 28px ${BODY}`, color: '#fff' }}>{m.n[0]}</div>
          <div style={{ flex: 1 }}>
            <div style={{ font: `700 26px ${BODY}`, color: C.ink }}>{m.n}</div>
            <div style={{ font: `500 18px ${BODY}`, color: C.mute }}>{m.note}</div>
          </div>
          <div style={{ font: `700 44px ${BODY}`, color: m.col }}>{m.p.toLocaleString('en-US')}<span style={{ fontSize: 24, marginLeft: 8 }}>{m.d}</span></div>
        </Glass>
      ))}
    </div>
    <div style={{ position: 'absolute', left: 96, bottom: 40, font: `600 18px ${BODY}`, color: C.mute, letterSpacing: 3 }}>NEAR · GAMES WITH REAL ECONOMIES · TESTNET</div>
  </AbsoluteFill>
);
