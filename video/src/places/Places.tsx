import { AbsoluteFill, Audio, Sequence, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from 'remotion';
import { BODY, C, Glass, Mark, clamp, useRamp } from '../ui';
import { FPS } from '../timeline';
import { Background } from '../native/Background';
import { Caption, Cursor, Pill, cameraAt, sec, type CameraKey, type CursorKey } from '../native/overlays';
import { Screen, TownCanvas } from '../native/Screen';
import { project, townCamAt, type CamKey, type V3 } from '../native/town';
import { wx, wz } from '../../../web/src/game/paths';
import targetsFile from '../data/places-targets.json';
import { dayShot, placeShot } from './model';
import { PLACE_SCENES, PLACES_FRAMES, type PlaceScene } from './timeline';

type Rect = { x: number; y: number; w: number; h: number };
const TARGETS = targetsFile as Record<string, Record<string, Rect>>;
const centre = (shot: string, name: string) => {
  const r = TARGETS[shot]?.[name];
  if (!r) throw new Error(`No measured target "${name}" in Places shot "${shot}". Run: node scripts/measure-places.mjs`);
  return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
};
const at3d = (shot: string, keys: CamKey[], t: number, p: V3) => project(TARGETS[shot].map3d, townCamAt(keys, t), p);
const WIDE = { x: 960, y: 540, zoom: 1 };
type Look = Pick<CamKey, 'pos' | 'look' | 'fov'>;

// 3D cameras, place by place (x = (px - 500) / 50, z = (py - 340) / 50 on the game's 1000x680 map).
const TOWN_A: Look = { pos: [-2.5, 11.5, 13.5], look: [0.5, 0, 0.5], fov: 38 };
const TOWN_B: Look = { pos: [3.5, 9.5, 12.5], look: [2.5, 0, 2.2], fov: 38 };
const HARB_A: Look = { pos: [0, 12.5, 12.5], look: [0, 0, 0.3], fov: 38 };
const HARB_B: Look = { pos: [-1.2, 7.2, 7.4], look: [-0.6, 0.4, -2.2], fov: 40 };
const FRONT_HIGH: Look = { pos: [1.4, 15, 9], look: [1.2, 0, -0.6], fov: 40 };
const FRONT_LOW: Look = { pos: [7.5, 5, 9.5], look: [0.5, 0.4, -0.8], fov: 40 };
const TIMB_A: Look = { pos: [1.2, 12.5, 12.5], look: [1.0, 0, -0.2], fov: 38 };
const TIMB_B: Look = { pos: [-1.6, 8.4, 9.6], look: [-2.8, 0.2, 0.2], fov: 40 };
const GEM_A: Look = { pos: [-6, 9, 12], look: [0, 0, -0.4], fov: 40 };
const GEM_B: Look = { pos: [3, 10.5, 11], look: [0.8, 0, -0.6], fov: 38 };
const PIKE: V3 = [wx(310), 0.9, wz(150)];
const PLOT2: V3 = [wx(290), 0.25, wz(420)];

interface Script {
  shots: { t: number; id: string; open?: boolean }[];
  town: CamKey[];
  cursor?: CursorKey[];
  camera?: CameraKey[];
  pills?: { t: number; hold: number; node: React.ReactNode }[];
  sounds?: { t: number; name: string; volume: number }[];
}

/** Hours on the road go by in steps: one recorded shot per game hour. */
const roadShots = (prefix: string, n: number, from: number, step: number) => Array.from({ length: n }, (_, i) => ({ t: from + i * step, id: `${prefix}-${i}` }));
const count = (prefix: string) => Object.keys(TARGETS).filter((k) => k.startsWith(prefix + '-')).length;

function script(s: PlaceScene): Script | null {
  switch (s.key) {
    case 'road': {
      const travel = centre('town', 'btn:travel');
      const setoff = centre('travel', 'btn:setoff:saltmere');
      return {
        shots: [{ t: 0, id: 'town' }, { t: 1.5, id: 'travel', open: true }, ...roadShots('road', count('road'), 3.3, 0.62)],
        town: [{ t: 0, ...TOWN_A }, { t: 7.6, ...TOWN_B }],
        cursor: [{ t: 0, x: 1200, y: 700 }, { t: 1.2, ...travel }, { t: 1.4, ...travel, click: true }, { t: 2.9, ...setoff }, { t: 3.1, ...setoff, click: true }, { t: 3.9, x: 1500, y: 860 }],
        camera: [{ t: 0, ...WIDE }, { t: 1.6, x: 1500, y: 520, zoom: 1.25 }, { t: 3.3, ...WIDE }],
        sounds: [{ t: 3.15, name: 'whoosh.wav', volume: 0.25 }],
      };
    }
    case 'harbour': {
      const town: CamKey[] = [{ t: 0, ...HARB_A }, { t: 3.2, ...HARB_B }];
      const pike = at3d('harbour', town, 3.2, PIKE);
      return {
        shots: [{ t: 0, id: 'harbour' }, { t: 3.6, id: 'harbour-stall', open: true }],
        town,
        cursor: [{ t: 0, x: 1100, y: 760 }, { t: 3.2, ...pike }, { t: 3.4, ...pike, click: true }],
        camera: [{ t: 0, ...WIDE }, { t: 3.7, x: 1480, y: 520, zoom: 1.25 }],
        sounds: [{ t: 3.6, name: 'tick.wav', volume: 0.45 }],
      };
    }
    case 'timberfell': {
      const town: CamKey[] = [{ t: 0, ...TIMB_A }, { t: 1.4, ...TIMB_B }];
      const plot = at3d('timberfell', town, 1.4, PLOT2);
      const buy = centre('timberfell-plot', 'btn:buyland');
      const build = centre('timberfell-bought', 'btn:build');
      return {
        shots: [{ t: 0, id: 'timberfell' }, { t: 1.8, id: 'timberfell-plot', open: true }, { t: 3.5, id: 'timberfell-bought' }, { t: 5.3, id: 'timberfell-built' }],
        town,
        cursor: [{ t: 0, x: 1200, y: 760 }, { t: 1.45, ...plot }, { t: 1.65, ...plot, click: true }, { t: 3.1, ...buy }, { t: 3.3, ...buy, click: true }, { t: 4.9, ...build }, { t: 5.1, ...build, click: true }, { t: 5.9, x: 1250, y: 820 }],
        camera: [{ t: 0, ...WIDE }, { t: 1.9, x: 1480, y: 540, zoom: 1.2 }, { t: 5.3, ...WIDE }],
        pills: [{ t: 5.5, hold: sec(2.0), node: <Glass style={{ padding: '16px 34px', font: `700 34px ${BODY}`, color: C.ink }}><span style={{ color: C.gold }}>Ada Timber</span> is open for business</Glass> }],
        sounds: [{ t: 3.5, name: 'tick.wav', volume: 0.45 }, { t: 5.3, name: 'ping.wav', volume: 0.5 }],
      };
    }
    case 'flight': {
      const travel = centre('timberfell-built', 'btn:travel');
      const fly = centre('fly', 'btn:fly:gemhollow');
      return {
        shots: [{ t: 0, id: 'timberfell-built' }, { t: 0.9, id: 'fly', open: true }, ...roadShots('flight', count('flight'), 2.6, 0.3)],
        town: [{ t: 0, ...TIMB_B }, { t: 5.6, ...TIMB_A }],
        cursor: [{ t: 0, x: 1250, y: 820 }, { t: 0.6, ...travel }, { t: 0.8, ...travel, click: true }, { t: 2.2, ...fly }, { t: 2.4, ...fly, click: true }, { t: 3.2, x: 1500, y: 860 }],
        camera: [{ t: 0, ...WIDE }, { t: 1.0, x: 1500, y: 600, zoom: 1.2 }, { t: 2.6, ...WIDE }],
        sounds: [{ t: 2.45, name: 'whoosh.wav', volume: 0.3 }],
      };
    }
    case 'gems':
      return { shots: [{ t: 0, id: 'gemhollow' }], town: [{ t: 0, ...GEM_A }, { t: 5, ...GEM_B }], camera: [{ t: 0, ...WIDE }] };
    default:
      return null;
  }
}

const AppScene: React.FC<{ s: PlaceScene }> = ({ s }) => {
  const f = useCurrentFrame();
  const t = f / FPS;
  const sc = script(s)!;
  const current = [...sc.shots].reverse().find((x) => t >= x.t) ?? sc.shots[0];
  const camera = cameraAt(sc.camera ?? [{ t: 0, ...WIDE }], t);
  const fade = interpolate(f, [0, 6, s.frames - 6, s.frames], [0, 1, 1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: fade }}>
      <Screen shot={dayShot(placeShot(current.id))} camera={camera} drawerAge={current.open ? t - current.t : undefined}
        town={{ t: (s.from + f) / FPS, camera: townCamAt(sc.town, t), dpr: 2, travel: true }} />
      {sc.cursor && <Cursor keys={sc.cursor} camera={camera} t={t} />}
      {sc.pills?.map((p, i) => <Pill key={i} at={sec(p.t)} hold={p.hold}>{p.node}</Pill>)}
      <Caption s={s as never} />
    </AbsoluteFill>
  );
};

/** A place in 3D behind a title, washed in the video's blue so the words read. */
const Backdrop: React.FC<{ shot: string; cam: CamKey[]; from: number; wash?: number }> = ({ shot, cam, from, wash = 0.5 }) => {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill>
      <TownCanvas shot={dayShot(placeShot(shot))} night={false} town={{ t: (from + f) / FPS, camera: townCamAt(cam, f / FPS), dpr: 1 }} banners={false} />
      <AbsoluteFill style={{ background: `linear-gradient(180deg, rgba(8,18,48,${wash * 0.7}) 0%, rgba(8,18,48,${wash}) 60%, rgba(8,18,48,${Math.min(0.9, wash + 0.25)}) 100%)` }} />
    </AbsoluteFill>
  );
};

const Card: React.FC<{ s: PlaceScene; shot: string; cam: CamKey[]; tag?: string; title: string; sub?: string; chips?: string[]; logo?: boolean }> = ({ s, shot, cam, tag, title, sub, chips, logo }) => {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const a = useRamp(0, 16);
  const pop = spring({ frame: f - 4, fps, config: { damping: 14, stiffness: 110 } });
  const out = interpolate(f, [s.frames - 10, s.frames], [1, 0], clamp);
  return (
    <AbsoluteFill style={{ opacity: out }}>
      <Backdrop shot={shot} cam={cam} from={s.from} />
      <AbsoluteFill style={{ alignItems: 'center', justifyContent: 'center', opacity: a }}>
        {tag && <div style={{ background: C.gold, color: '#2a1d00', font: `800 28px ${BODY}`, letterSpacing: 3, padding: '8px 22px', borderRadius: 12, marginBottom: 30, transform: `scale(${0.8 + pop * 0.2})` }}>{tag}</div>}
        {logo && <div style={{ display: 'flex', alignItems: 'center', gap: 26, marginBottom: 26, transform: `scale(${0.85 + pop * 0.15})` }}><Mark size={150} /><div style={{ font: `700 150px/1 ${BODY}`, color: C.ink, letterSpacing: -3 }}>Nims</div></div>}
        <div style={{ font: `700 ${logo ? 64 : 104}px/1.05 ${BODY}`, color: C.ink, letterSpacing: -2, textAlign: 'center', transform: `translateY(${(1 - pop) * 24}px)`, textShadow: '0 6px 30px rgba(0,0,0,.45)' }}>{title}</div>
        {sub && <div style={{ font: `600 40px ${BODY}`, color: C.gold, marginTop: 22 }}>{sub}</div>}
        {chips && (
          <div style={{ display: 'flex', gap: 20, marginTop: 46 }}>
            {chips.map((c, i) => {
              const o = interpolate(f, [s.delay + 12 + i * 10, s.delay + 24 + i * 10], [0, 1], clamp);
              return <div key={c} style={{ opacity: o, transform: `translateY(${(1 - o) * 18}px)`, padding: '16px 28px', borderRadius: 18, border: '1.5px solid rgba(127,176,255,.55)', background: 'rgba(9,18,46,.72)', font: `700 32px ${BODY}`, color: C.ink }}>{c}</div>;
            })}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
};

const scene = (s: PlaceScene) => {
  if (s.key === 'title') return <Card s={s} shot="town" cam={[{ t: 0, ...TOWN_A }, { t: s.frames / FPS, ...TOWN_B }]} tag="NEW IN NIMS" title="A world beyond the town" />;
  if (s.key === 'frontiers') return <Card s={s} shot="timberfell-built" cam={[{ t: 0, ...FRONT_HIGH }, { t: s.frames / FPS, ...FRONT_LOW }]} title="Three unexplored frontiers" chips={['Timberfell Woods', 'Gem Hollow', 'Sunvale']} />;
  if (s.key === 'outro') return <Card s={s} shot="gemhollow" cam={[{ t: 0, ...GEM_B }, { t: s.frames / FPS, ...GEM_A }]} logo title="Play now: nims-app.up.railway.app" chips={['Continue with Google', 'Play as a guest']} />;
  return <AppScene s={s} />;
};

const Progress: React.FC = () => {
  const f = useCurrentFrame();
  return <div style={{ position: 'absolute', left: 0, bottom: 0, height: 5, width: `${(f / PLACES_FRAMES) * 100}%`, background: `linear-gradient(90deg, ${C.blue}, ${C.gold})` }} />;
};

/** "A world beyond the town": Saltmere Harbour and the three frontiers, drawn from the real game like the demo video. */
export const Places: React.FC<{ voice: boolean }> = ({ voice }) => {
  const sfx = (name: string, at: number, volume: number) => <Sequence key={name + at} from={Math.max(0, Math.round(at))} durationInFrames={FPS * 2}><Audio src={staticFile(`sfx/${name}`)} volume={volume} /></Sequence>;
  return (
    <AbsoluteFill style={{ background: C.navy }}>
      <Background />
      {PLACE_SCENES.map((s) => <Sequence key={s.key} from={s.from} durationInFrames={s.frames}>{scene(s)}</Sequence>)}
      <Progress />
      <Audio src={staticFile('sfx/bed.mp3')} volume={(f) => 0.09 * interpolate(f, [0, 45, PLACES_FRAMES - 75, PLACES_FRAMES], [0, 1, 1, 0], clamp)} />
      {PLACE_SCENES.filter((s) => s.kind === 'card').map((s) => sfx('whoosh.wav', s.from - 4, 0.2))}
      {PLACE_SCENES.flatMap((s) => (script(s)?.sounds ?? []).map((x) => sfx(x.name, s.from + sec(x.t), x.volume)))}
      {voice && PLACE_SCENES.map((s) => (
        <Sequence key={'v' + s.key} from={s.from + s.delay} durationInFrames={s.voiceFrames + 20}><Audio src={staticFile(`vo-places/${s.key}.mp3`)} /></Sequence>
      ))}
    </AbsoluteFill>
  );
};
