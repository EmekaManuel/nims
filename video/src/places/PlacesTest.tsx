import { AbsoluteFill, getInputProps, useCurrentFrame } from 'remotion';
import { FPS } from '../timeline';
import { Screen } from '../native/Screen';
import { dayShot, placeShot } from './model';

type V3 = [number, number, number];
/** One frame of a Places shot from a camera given on the command line, in daylight: for aiming the cameras. */
export const PlacesTest: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const p = getInputProps() as { pos?: V3; look?: V3; fov?: number; shot?: string };
  return (
    <AbsoluteFill>
      <Screen shot={dayShot(placeShot(p.shot ?? 'town'))} town={{ t, camera: { position: p.pos ?? [0, 13, 12], target: p.look ?? [0, 0, 0], fov: p.fov ?? 38 }, dpr: 1, travel: true }} />
    </AbsoluteFill>
  );
};
