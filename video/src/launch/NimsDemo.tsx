// The Nims launch video. Every shot is real footage of the live game or real data (public/demo-data.json); the voice drives the timing.
import React from 'react';
import { AbsoluteFill, Audio, Sequence, interpolate, staticFile, useCurrentFrame } from 'remotion';
import demo from '../../public/demo-data.json';
import code from '../../public/clips/code.json';
import testOutput from '../../public/clips/planner-output.json';
import { C, FONT, FPS, GRID, H, RADIUS, STROKE, T, W, WEIGHT, col, sp } from '../../design';
import { BEATS, TOTAL_FRAMES, beat } from './timeline';
import { Captions, CodeReveal, Footage, FULL, GridBackground, Montage, Rect, StatCounter, Tag, TruthPanel, rect16, rectAspect, useEnter } from './parts';

export { TOTAL_FRAMES };
const sale = demo.beat1_and_4.sale1;
const fmt = (n: number) => n.toLocaleString('en-US');
const plan = sale.ruthPlan as { reason: string; stock: Record<string, string>; margin: string };
const clip = (t: string, n: number) => (t.length <= n ? t : t.slice(0, t.lastIndexOf(' ', n)) + '…');
const STEP = { stockMult: { less: 'x0.75', more: 'x1.3', same: 'x1' } as Record<string, string>, margin: { wider: '+0.03', narrower: '-0.03', same: '0' } as Record<string, string> };

// ---- beat 1: a merchant reacts to a sale -----------------------------------------------------------------------
const B1: React.FC = () => {
  const b = beat(1);
  return (
    <AbsoluteFill>
      <Footage src="clips/take1.mp4" startSec={29.6} keys={[{ t: 0, rect: rect16(950, 60, 960) }]} />
      <div style={{ position: 'absolute', left: GRID.margin, top: GRID.margin + sp(7), padding: `${sp(1.5)}px ${sp(2.5)}px`, borderRadius: RADIUS, background: C.terminal, border: `${STROKE}px solid ${C.line}`, fontFamily: FONT.mono, fontSize: T.small, color: C.text, ...useEnter(4.4) }}>
        <div style={{ color: C.gold, fontWeight: WEIGHT.bold }}>RUTH · iron buy price {sale.ruthIronBuyPrice[0]} → {sale.ruthIronBuyPrice[1]}</div>
        <div style={{ color: C.muted }}>my cash {fmt(sale.youCash[0])} → {fmt(sale.youCash[1])}</div>
      </div>
      <Captions beat={b} />
    </AbsoluteFill>
  );
};

// ---- beat 2: the problem ---------------------------------------------------------------------------------------
const B2: React.FC = () => {
  const b = beat(2);
  return (
    <AbsoluteFill>
      <GridBackground />
      <div style={{ position: 'absolute', left: GRID.margin, right: GRID.margin, top: 300, fontFamily: FONT.display, color: C.text }}>
        <div style={{ fontSize: T.display, fontWeight: WEIGHT.bold, lineHeight: 1.05, ...useEnter(b.sentences[0].start) }}>Game economies are scripts.</div>
        <div style={{ fontSize: T.title, fontWeight: WEIGHT.regular, color: C.muted, marginTop: sp(4), lineHeight: 1.15, ...useEnter(b.sentences[1].start) }}>A language model with real money<br />can be wrong, or talked into things.</div>
      </div>
    </AbsoluteFill>
  );
};

// ---- beat 3: meet Nims, no wallet ------------------------------------------------------------------------------
const B3: React.FC = () => (
  <AbsoluteFill>
    <Footage src="clips/login.mp4" startSec={2.0} keys={[{ t: 0, rect: rect16(560, 250, 800) }, { t: 4.6, rect: FULL }]} />
    <Captions beat={beat(3)} />
  </AbsoluteFill>
);

// ---- beat 4: the split screen — what the player sees / what is actually happening ---------------------------------
const B4: React.FC = () => {
  const b = beat(4);
  const left: Rect = { x: GRID.margin, y: GRID.margin, w: 1056, h: 792 };
  const right: Rect = { x: GRID.margin + 1056 + GRID.gutter, y: GRID.margin, w: W - 2 * GRID.margin - 1056 - GRID.gutter, h: 792 };
  const rp = rectAspect(1196, 90, 704, 1056 / 792), rplan = rectAspect(1380, 150, 528, 1056 / 792);
  const tx = sale.chain!;
  return (
    <AbsoluteFill>
      <GridBackground />
      <Footage src="clips/take1.mp4" startSec={32.0} box={left} radius={RADIUS} framed holdAtSec={6.3} keys={[{ t: 0, rect: rp }, { t: b.sentences[1].start + 0.6, rect: rplan }, { t: b.sentences[3].start, rect: rp }]} />
      <div style={{ position: 'absolute', left: left.x, top: left.y - sp(4), fontFamily: FONT.mono, fontSize: T.small, fontWeight: WEIGHT.bold, color: C.muted, letterSpacing: 2 }}>WHAT THE PLAYER SEES</div>
      <div style={{ position: 'absolute', left: left.x, width: left.w, top: left.y - sp(4), textAlign: 'right', fontFamily: FONT.mono, fontSize: T.small, fontWeight: WEIGHT.bold, color: C.gold, ...useEnter(6.3) }}>held on the result</div>
      <TruthPanel box={right} rows={[
        { at: b.sentences[1].start, title: "RUTH · TODAY'S PLAN", lines: [{ k: 'iron  ', v: `${plan.stock.iron}  → target ${STEP.stockMult[plan.stock.iron]}`, hi: true }, { k: 'margin', v: `${plan.margin}  → ${STEP.margin[plan.margin]} (kept 5–25%)`, hi: true }, { v: `"${clip(plan.reason, 84)}"` }] },
        { at: 1.9, title: 'THE SALE', lines: [{ k: 'my cash', v: `${fmt(sale.youCash[0])} → ${fmt(sale.youCash[1])}` }, { k: 'Ruth pays for iron', v: `${sale.ruthIronBuyPrice[0]} → ${sale.ruthIronBuyPrice[1]}` }] },
        { at: b.sentences[3].start, title: 'NEP-245 · send_many', lines: [{ v: 'my account → ruth', hi: true }, { v: '6 iron · delegate action, relayer pays gas' }] },
        { at: b.sentences[4].start, title: 'NEAR TESTNET · oja-items', lines: [{ k: 'tx', v: `${tx.hash.slice(0, 12)}…`, hi: true }, { v: `+${tx.settledSecondsAfterSale} s after the sale` }] },
      ]} />
      <Captions beat={b} />
    </AbsoluteFill>
  );
};

const TestOutput: React.FC<{ lines: string[]; at: number }> = ({ lines, at }) => (
  <div style={{ marginTop: sp(3), background: C.terminal, borderRadius: RADIUS, border: `${STROKE}px solid ${C.line}`, padding: sp(3), fontFamily: FONT.mono, fontSize: T.small, color: C.text, ...useEnter(at) }}>
    {lines.map((l, i) => <div key={i} style={{ color: /Tests /.test(l) ? C.gold : C.muted, fontWeight: /Tests /.test(l) ? WEIGHT.bold : WEIGHT.regular }}>{l}</div>)}
  </div>
);

// ---- beat 5: it cannot go rogue — real code, real passing tests -------------------------------------------------
const B5: React.FC = () => {
  const b = beat(5);
  const reveal = b.sentences.find((s) => s.reveal) ?? b.sentences[3];
  const outputLines = (testOutput as string[]).filter((l) => /not a plan|invents a number|only plans goods|Tests /.test(l)).map((l) => l.replace(/\s*\d+ms$/, ''));
  const f = useCurrentFrame();
  const showRogue = f >= reveal.start * FPS;
  return (
    <AbsoluteFill>
      <GridBackground />
      <div style={{ position: 'absolute', left: GRID.margin, right: GRID.margin, top: GRID.margin }}>
        {!showRogue && <CodeReveal file={`${code.menu.file}#L${code.menu.from}-L${code.menu.from + code.menu.lines.length - 1}`} lines={code.menu.lines} lit={(l) => /STOCK_MULT|MARGIN_STEP/.test(l.text)} startSec={b.sentences[0].start + 0.2} />}
        {showRogue && <Sequence from={Math.round(reveal.start * FPS)} layout="none">
          <CodeReveal file={`${code.rogue.file}#L${code.rogue.from}-L${code.rogue.from + code.rogue.lines.length - 1}`} lines={code.rogue.lines} lit={(l) => /triple|double/.test(l.text)} startSec={0} perLine={0.12}
            results={[{ match: (l) => /triple/.test(l.text), text: '→ null', at: 1.0 }, { match: (l) => /double/.test(l.text), text: '→ null', at: 1.5 }]} />
        </Sequence>}
        {showRogue && b.sentences[4] && <TestOutput lines={outputLines} at={b.sentences[4].start} />}
      </div>
      <Captions beat={b} />
    </AbsoluteFill>
  );
};

// ---- beat 6: the economy is alive -----------------------------------------------------------------------------
const proposal = demo.proof.dao.proposal11 as { status: string; description: string };
const DaoCard: React.FC = () => (
  <AbsoluteFill>
    <GridBackground />
    <Tag kind="CHAIN" text="Read from testnet RPC" at={0.05} />
    <div style={{ position: 'absolute', left: GRID.margin, right: GRID.margin, top: 280, fontFamily: FONT.mono, fontSize: T.body, color: C.text }}>
      <div style={{ color: C.muted, ...useEnter(0.1) }}>nims-council.sputnikv2.testnet · get_proposal(11)</div>
      <div style={{ color: C.gold, fontWeight: WEIGHT.bold, fontSize: T.title, margin: `${sp(2)}px 0`, ...useEnter(0.9) }}>status: {proposal.status}</div>
      <div style={{ fontSize: T.small, lineHeight: 1.4, maxWidth: 1400, ...useEnter(1.8) }}>{proposal.description}…</div>
      <div style={{ fontSize: T.small, color: C.muted, marginTop: sp(4), ...useEnter(3.2) }}>recorded by the Town Clerk, an agent whose key OutLayer holds</div>
    </div>
  </AbsoluteFill>
);
const B6: React.FC = () => (
  <AbsoluteFill>
    <Montage at={0.3} shots={[
      { src: 'clips/tour-game.mp4', startSec: 9.6, dur: 2.6, tag: { kind: 'LIVE', text: 'The price board' } },
      { src: 'clips/tour-game.mp4', startSec: 5.8, dur: 2.2, keys: [{ t: 0, rect: rect16(0, 30, 960) }], tag: { kind: 'LIVE', text: 'A shock: festive season' } },
      { src: 'clips/take1.mp4', startSec: 9.6, dur: 2.6, keys: [{ t: 0, rect: rect16(500, 120, 960) }], tag: { kind: 'LIVE', text: "Mira's Greens has closed" } },
      { src: 'clips/tour-public.mp4', startSec: 12.0, dur: 3.6, tag: { kind: 'SIMULATED', text: 'A simulated week, same engine' } },
      { src: 'clips/tour-public.mp4', startSec: 2.0, dur: 3.2, keys: [{ t: 0, rect: rect16(600, 150, 1000) }], tag: { kind: 'LIVE', text: 'Town board: council decisions' } },
    ]} />
    <Sequence from={Math.round(14.5 * FPS)} durationInFrames={Math.round(7.0 * FPS)} layout="none"><DaoCard /></Sequence>
    <Captions beat={beat(6)} />
  </AbsoluteFill>
);

// ---- beat 7: and there is more ----------------------------------------------------------------------------------
const drawer = (y: number) => [{ t: 0, rect: rect16(960, y, 960) }];
const B7: React.FC = () => (
  <AbsoluteFill>
    <Montage at={0.1} shots={[
      { src: 'clips/features.mp4', startSec: 10.4, dur: 3.55, hold: 2.6, keys: drawer(60), tag: { kind: 'LIVE', text: 'Quests and a daily reward' } },
      { src: 'clips/features.mp4', startSec: 24.2, dur: 2.35, keys: drawer(380), tag: { kind: 'LIVE', text: 'Shares and delivery orders' } },
      { src: 'clips/features.mp4', startSec: 36.6, dur: 1.3, keys: drawer(90), tag: { kind: 'LIVE', text: 'Your own stall' } },
      { src: 'clips/features.mp4', startSec: 30.0, dur: 4.2, hold: 2.8, keys: drawer(90), tag: { kind: 'LIVE', text: 'A harbour and three frontiers' } },
    ]} />
    <Captions beat={beat(7)} />
  </AbsoluteFill>
);

// ---- beat 8: proof, in the live numbers --------------------------------------------------------------------------
const B8: React.FC = () => {
  const p = demo.proof;
  const at = (iso: string) => new Date(iso).toISOString().slice(0, 16).replace('T', ' ') + ' UTC';
  return (
    <AbsoluteFill>
      <GridBackground />
      <div style={{ position: 'absolute', left: col(4, 0).x, top: 260, width: col(4, 0).w }}><StatCounter value={p.playersExcludingCaptureGuests} label="people have played" at={0.3} foot={`excludes ${p.captureGuests} capture accounts`} /></div>
      <div style={{ position: 'absolute', left: col(4, 4).x, top: 260, width: col(4, 4).w }}><StatCounter value={p.statsAtRead.councilVotesPassed} label="rules voted in" at={0.6} /></div>
      <div style={{ position: 'absolute', left: col(4, 8).x, top: 260, width: col(4, 8).w }}><StatCounter value={Number(p.dao.proposals)} label="DAO proposals recorded" at={0.9} /></div>
      <div style={{ position: 'absolute', left: GRID.margin, right: GRID.margin, top: 600, fontFamily: FONT.mono, fontSize: T.body, color: C.text, lineHeight: 1.6, ...useEnter(1.6) }}>
        <div><span style={{ color: C.gold, fontWeight: WEIGHT.bold }}>oja-items.testnet</span> · NEP-245 goods and coins</div>
        <div><span style={{ color: C.gold, fontWeight: WEIGHT.bold }}>nims-council.sputnikv2.testnet</span> · the council record</div>
        <div style={{ color: C.text }}>settling now · last settled {at(p.chain.lastSettledAt)}</div>
      </div>
      <div style={{ position: 'absolute', left: GRID.margin, bottom: GRID.margin + sp(12), fontFamily: FONT.mono, fontSize: T.small, color: C.text, ...useEnter(2.0) }}>Read from /stats and /chain/status on {at(demo.readAt)}</div>
      <Captions beat={beat(8)} />
    </AbsoluteFill>
  );
};

// ---- beat 9: the close ---------------------------------------------------------------------------------------------
const B9: React.FC = () => (
  <AbsoluteFill>
    <GridBackground />
    <div style={{ position: 'absolute', left: GRID.margin, top: 220, fontFamily: FONT.display, color: C.text }}>
      <div style={{ fontSize: T.display, fontWeight: WEIGHT.bold, ...useEnter(0.2) }}>Nims</div>
      <div style={{ fontSize: T.title, fontWeight: WEIGHT.regular, color: C.muted, marginTop: sp(2), ...useEnter(0.5) }}>A market town run by AI merchants.</div>
      <div style={{ marginTop: sp(7), fontFamily: FONT.mono, fontSize: T.body, lineHeight: 1.7, ...useEnter(1.0) }}>
        <div><span style={{ color: C.muted }}>play </span><span style={{ color: C.gold, fontWeight: WEIGHT.bold }}>nims-app.up.railway.app</span></div>
        <div><span style={{ color: C.muted }}>code </span><span style={{ color: C.gold, fontWeight: WEIGHT.bold }}>github.com/EmekaManuel/nims</span></div>
      </div>
    </div>
    <div style={{ position: 'absolute', left: GRID.margin, bottom: GRID.margin, fontFamily: FONT.mono, fontSize: T.body, color: C.text, ...useEnter(1.4) }}>Built at NEAR HACKATHON · @NEARProtocol · #NEARHackathon · testnet only</div>
  </AbsoluteFill>
);

const VIEW: Record<number, React.FC> = { 1: B1, 2: B2, 3: B3, 4: B4, 5: B5, 6: B6, 7: B7, 8: B8, 9: B9 };

// ---- the audio: one voice file per sentence, and a music bed that steps down under the voice ---------------------------
const windows = BEATS.flatMap((b) => b.sentences.map((s) => ({ a: b.from + s.start * FPS, z: b.from + (s.start + s.duration) * FPS })));
const duck = (f: number) => {
  let v = 0.42;
  for (const w of windows) v = Math.min(v, interpolate(f, [w.a - 8, w.a, w.z, w.z + 14], [0.42, 0.2, 0.2, 0.42], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }));
  return v * interpolate(f, [TOTAL_FRAMES - 90, TOTAL_FRAMES], [1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
};

export const NimsDemo: React.FC<{ music?: boolean }> = ({ music = true }) => (
  <AbsoluteFill style={{ background: C.bg }}>
    {BEATS.map((b) => {
      const View = VIEW[b.n];
      return (
        <Sequence key={b.n} from={b.from} durationInFrames={b.frames}>
          <View />
          {b.sentences.map((s, i) => (
            <Sequence key={i} from={Math.round(s.start * FPS)} layout="none"><Audio src={staticFile(`vo-launch/${s.file}`)} /></Sequence>
          ))}
        </Sequence>
      );
    })}
    {music && <Audio src={staticFile('music/bed.wav')} volume={duck} />}
  </AbsoluteFill>
);
