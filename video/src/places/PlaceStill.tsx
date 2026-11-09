import { AbsoluteFill, getInputProps } from 'remotion';
import { BODY, C, Mark } from '../ui';
import { Screen, TownCanvas } from '../native/Screen';
import { dayShot, placeShot } from './model';

type V3 = [number, number, number];
interface Props { kind: 'hero' | 'screen'; shot: string; pos: V3; look: V3; fov?: number; title?: string; sub?: string; zoom?: { x: number; y: number; zoom: number } }

/** Pictures of the new places from the real game: `kind: "hero"` is the 3D place alone with its name, `kind: "screen"` the game screen. */
export const PlaceStill: React.FC = () => {
  const p = getInputProps() as unknown as Props;
  const town = { t: 12, camera: { position: p.pos, target: p.look, fov: p.fov ?? 38 }, dpr: 2, travel: true };
  const shot = dayShot(placeShot(p.shot));
  if (p.kind === 'screen') return <Screen shot={shot} town={town} camera={p.zoom} />;
  return (
    <AbsoluteFill>
      <TownCanvas shot={shot} night={false} town={town} banners={false} />
      <AbsoluteFill style={{ background: 'linear-gradient(180deg, rgba(8,18,48,0) 45%, rgba(8,18,48,.55) 78%, rgba(8,18,48,.85) 100%)' }} />
      <div style={{ position: 'absolute', left: 80, bottom: 70, display: 'flex', alignItems: 'flex-end', gap: 28 }}>
        <Mark size={120} />
        <div>
          <div style={{ font: `700 26px ${BODY}`, color: C.gold, letterSpacing: 4 }}>NEW IN NIMS</div>
          <div style={{ font: `700 92px/1.05 ${BODY}`, color: C.ink, letterSpacing: -2, textShadow: '0 6px 30px rgba(0,0,0,.4)' }}>{p.title}</div>
          {p.sub && <div style={{ font: `600 36px ${BODY}`, color: '#dce6ff', marginTop: 8 }}>{p.sub}</div>}
        </div>
      </div>
    </AbsoluteFill>
  );
};
