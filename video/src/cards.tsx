import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { BODY, C, HEAD, MONO, Mark, clamp, fmt, useRamp } from './ui';
import { FPS, scene } from './timeline';
import chain from './data/chain.json';
import session from './data/session.json';
import { TownCanvas } from './native/Screen';
import { shot as getShot } from './native/model';
import { townCamAt, type CamKey } from './native/town';

/** The town at night behind a title card, drifting slowly, under a dark wash so the words stay easy to read. */
export const TownBackdrop: React.FC<{ from: number; scene: string; cam: CamKey[]; wash?: number }> = ({ from, scene: key, cam, wash = 0.5 }) => {
  const f = useCurrentFrame();
  const s = scene(key as never);
  if (f < from - 2) return null;
  const o = interpolate(f, [from, from + 16], [0, 1], clamp);
  return (
    <AbsoluteFill style={{ opacity: o }}>
      <TownCanvas shot={getShot('town')} town={{ t: (s.from + f) / FPS, camera: townCamAt(cam, (f - from) / FPS), dpr: 1.5 }} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(8,18,48,${wash + 0.1}) 0%, rgba(8,18,48,${wash}) 45%, rgba(8,18,48,${wash + 0.25}) 100%)` }} />
    </AbsoluteFill>
  );
};
export const TOWN_CAM: CamKey[] = [
  { t: 0, pos: [-8, 5.0, 12.5], look: [-1, 0.6, -1], fov: 40 },
  { t: 9, pos: [6, 6.2, 12.5], look: [1.5, 0.4, -1], fov: 40 },
];
const OUTRO_CAM: CamKey[] = [
  { t: 0, pos: [5, 6.0, 12.5], look: [1, 0.4, -1], fov: 40 },
  { t: 10, pos: [-3, 6.8, 13], look: [0, 0.4, -0.5], fov: 40 },
];

// ---------- 2. Chain: real numbers from the live contract ----------
const Count: React.FC<{ to: number; at: number; label: string; suffix?: string; decimals?: number }> = ({ to, at, label, suffix = '', decimals = 0 }) => {
  const f = useCurrentFrame();
  const o = useRamp(at, 14);
  const v = to * useRamp(at, 54, (x) => 1 - Math.pow(1 - x, 3));
  return (
    <div style={{ opacity: o, transform: `translateY(${(1 - o) * 26}px)`, flex: 1, padding: '26px 30px', borderRadius: 22, background: 'rgba(9,18,46,.86)', border: '1.5px solid rgba(127,176,255,.35)' }}>
      <div style={{ font: `700 78px/1 ${MONO}`, color: C.gold }}>{decimals ? v.toFixed(decimals) : fmt(v)}<span style={{ fontSize: 34, color: C.mute }}>{suffix}</span></div>
      <div style={{ marginTop: 12, font: `600 24px ${BODY}`, color: C.ink }}>{label}</div>
      <span style={{ display: 'none' }}>{f}</span>
    </div>
  );
};

export const Chain: React.FC = () => {
  const f = useCurrentFrame();
  const s = scene('chain');
  const out = interpolate(f, [s.frames - 14, s.frames], [1, 0], clamp);
  const a = useRamp(0, 20);
  const nodes = [
    { t: 'The game', sub: 'trades apply instantly', c: C.blue },
    { t: 'A batch', sub: 'queued, never blocking', c: '#8a5cff' },
    { t: 'Relayer', sub: 'pays every fee', c: '#e8873a' },
    { t: 'NEAR testnet', sub: 'NEP-245 contract', c: C.green },
  ];
  const nodeAt = (i: number) => 30 + i * 22;
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out, padding: '0 150px' }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 24}px)`, textAlign: 'center' }}>
        <div style={{ font: `700 24px ${BODY}`, color: C.green, letterSpacing: 4 }}>● LIVE ON NEAR TESTNET</div>
        <div style={{ font: `700 104px/1.05 ${HEAD}`, color: C.ink, marginTop: 14 }}>Every good is a real token</div>
      </div>
      <div style={{ display: 'flex', gap: 24, marginTop: 52, width: '100%' }}>
        <Count to={chain.settlementBatches} at={s.delay + 14} label="settlement batches on chain" />
        <Count to={chain.blockHeight} at={s.delay + 26} label="read at block height" />
        <Count to={chain.balanceNear} at={s.delay + 38} label="NEAR held by the contract" decimals={2} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 56, width: '100%', justifyContent: 'center' }}>
        {nodes.map((n, i) => {
          const o = useRamp(nodeAt(i) + 50, 14);
          return (
            <div key={n.t} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ opacity: o, transform: `scale(${0.9 + o * 0.1})`, padding: '18px 30px', borderRadius: 18, background: 'rgba(9,18,46,.9)', border: `2px solid ${n.c}`, boxShadow: `0 0 40px ${n.c}44`, minWidth: 250, textAlign: 'center' }}>
                <div style={{ font: `700 32px ${HEAD}`, color: C.ink }}>{n.t}</div>
                <div style={{ font: `500 20px ${BODY}`, color: C.mute, marginTop: 4 }}>{n.sub}</div>
              </div>
              {i < nodes.length - 1 && (
                <div style={{ position: 'relative', width: 120, height: 4, background: 'rgba(127,176,255,.3)', opacity: o }}>
                  <div style={{ position: 'absolute', top: -7, left: `${((f * 1.6 + i * 40) % 100)}%`, width: 18, height: 18, borderRadius: 18, background: C.gold, boxShadow: `0 0 18px ${C.gold}` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ marginTop: 40, font: `500 22px ${BODY}`, color: C.mute, opacity: useRamp(s.delay + 190, 16) }}>Read from the testnet RPC on {chain.fetchedAt}. The player never sees any of this.</div>
    </AbsoluteFill>
  );
};

// ---------- 3. Outro ----------
export const Outro: React.FC = () => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const s = scene('outro');
  const a = useRamp(0, 20);
  const pop = spring({ frame: f - 6, fps, config: { damping: 14, stiffness: 110 } });
  const tags = [['AI MERCHANTS', 'Each with its own money'], ['PLAYER-RUN', 'A council votes the rules'], ['NEP-245 ITEMS', 'One contract, every good'], ['DAO RECORD', 'SputnikDAO + OutLayer'], ['NEAR AI', 'Behind every voice']];
  const out = interpolate(f, [s.frames - 10, s.frames], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: out }}>
    <TownBackdrop from={0} scene="outro" cam={OUTRO_CAM} wash={0.6} />
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: a }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 30, transform: `scale(${0.85 + pop * 0.15})` }}>
        <Mark size={190} />
        <div style={{ font: `700 190px/1 ${HEAD}`, color: C.ink, letterSpacing: -3 }}>Nims</div>
      </div>
      <div style={{ font: `600 52px ${BODY}`, color: C.ink, marginTop: 30 }}>The economy is the game.</div>
      <div style={{ display: 'flex', gap: 20, marginTop: 56 }}>
        {tags.map(([t, d], i) => {
          const o = useRamp(s.delay + 30 + i * 22, 14);
          return (
            <div key={t} style={{ opacity: o, transform: `translateY(${(1 - o) * 18}px)`, padding: '18px 26px', borderRadius: 20, border: '1.5px solid rgba(127,176,255,.5)', background: 'rgba(47,107,255,.16)', textAlign: 'center' }}>
              <div style={{ font: `700 24px ${BODY}`, color: C.gold, letterSpacing: 2.5 }}>{t}</div>
              <div style={{ font: `500 20px ${BODY}`, color: C.mute, marginTop: 6 }}>{d}</div>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
    </AbsoluteFill>
  );
};

// ---------- 4. Record: the council's vote, on a real DAO ----------
const dao = (session as unknown as { dao: { id: string; proposalId: number; description: string; status: string; clerk: string } | null }).dao;
const short = (a: string) => `${a.slice(0, 8)}…${a.slice(-6)}`;

export const Record: React.FC = () => {
  const f = useCurrentFrame();
  const s = scene('record');
  const out = interpolate(f, [s.frames - 14, s.frames], [1, 0], clamp);
  const a = useRamp(0, 20);
  if (!dao) return null;
  // the three steps appear as the voice reaches them: the DAO, then the Clerk, then the result
  const at = (x: number) => s.delay + Math.round(x * FPS);
  const steps = [
    { t: 'A council vote', sub: 'counted in the game', sub2: '', c: C.blue, when: at(0.2) },
    { t: 'The Town Clerk', sub: 'key in an OutLayer enclave', sub2: short(dao.clerk), c: '#8a5cff', when: at(4.4) },
    { t: 'SputnikDAO', sub: dao.id, sub2: '', c: C.green, when: at(1.9) },
  ];
  const cardAt = at(7.6);
  const card = useRamp(cardAt, 16);
  return (
    <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: out, padding: '0 150px' }}>
      <div style={{ opacity: a, transform: `translateY(${(1 - a) * 24}px)`, textAlign: 'center' }}>
        <div style={{ font: `700 24px ${BODY}`, color: C.green, letterSpacing: 4 }}>● LIVE ON NEAR TESTNET</div>
        <div style={{ font: `700 98px/1.05 ${HEAD}`, color: C.ink, marginTop: 14 }}>Every vote, on the record</div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', marginTop: 54, width: '100%', justifyContent: 'center' }}>
        {steps.map((n, i) => {
          const o = useRamp(n.when, 14);
          return (
            <div key={n.t} style={{ display: 'flex', alignItems: 'center' }}>
              <div style={{ opacity: o, transform: `scale(${0.9 + o * 0.1})`, padding: '18px 30px', borderRadius: 18, background: 'rgba(9,18,46,.92)', border: `2px solid ${n.c}`, boxShadow: `0 0 40px ${n.c}44`, minWidth: 300, maxWidth: 430, textAlign: 'center' }}>
                <div style={{ font: `700 32px ${HEAD}`, color: C.ink }}>{n.t}</div>
                <div style={{ font: `500 19px ${BODY}`, color: C.mute, marginTop: 4, whiteSpace: 'nowrap' }}>{n.sub}</div>
                {n.sub2 && <div style={{ font: `600 18px ${BODY}`, color: C.sky, marginTop: 4, whiteSpace: 'nowrap', letterSpacing: 0.5 }}>{n.sub2}</div>}
              </div>
              {i < steps.length - 1 && (
                <div style={{ position: 'relative', width: 90, height: 4, background: 'rgba(127,176,255,.3)', opacity: o }}>
                  <div style={{ position: 'absolute', top: -7, left: `${((f * 1.6 + i * 40) % 100)}%`, width: 18, height: 18, borderRadius: 18, background: C.gold, boxShadow: `0 0 18px ${C.gold}` }} />
                </div>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ opacity: card, transform: `translateY(${(1 - card) * 22}px)`, marginTop: 52, padding: '22px 32px', borderRadius: 20, background: 'rgba(9,18,46,.94)', border: '1.5px solid rgba(59,224,143,.55)', maxWidth: 1380, boxShadow: '0 0 50px rgba(59,224,143,.18)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18 }}>
          <div style={{ font: `700 22px ${BODY}`, color: C.mute, letterSpacing: 2 }}>PROPOSAL #{dao.proposalId}</div>
          <div style={{ font: `700 24px ${BODY}`, color: C.green, padding: '4px 16px', borderRadius: 99, border: '2px solid rgba(59,224,143,.7)' }}>✓ {dao.status.toUpperCase()}</div>
        </div>
        <div style={{ font: `500 27px/1.35 ${BODY}`, color: C.ink, marginTop: 12 }}>{dao.description}</div>
      </div>
      <div style={{ marginTop: 34, font: `500 21px ${BODY}`, color: C.mute, opacity: useRamp(cardAt + 14, 16) }}>A real proposal from this demo's own council vote. The DAO records the result; the game counts the votes. No player names are written.</div>
    </AbsoluteFill>
  );
};
