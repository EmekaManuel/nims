import { AbsoluteFill, getInputProps, useCurrentFrame } from 'remotion';
import { FPS } from '../timeline';
import { shot } from './model';
import { Screen } from './Screen';

type V3 = [number, number, number];
/** The 3D town at night from a camera given on the command line (--props='{"pos":[0,9,15],"look":[0,0.3,0],"fov":42,"shot":"town"}'): for checking the picture. */
export const Town3dTest: React.FC = () => {
  const t = useCurrentFrame() / FPS;
  const p = getInputProps() as { pos?: V3; look?: V3; fov?: number; shot?: string; night?: boolean };
  return (
    <AbsoluteFill>
      <Screen shot={shot(p.shot ?? 'town')} night={p.night ?? true} town={{ t, camera: { position: p.pos ?? [0, 13, 12], target: p.look ?? [0, 0, 0], fov: p.fov ?? 38 }, dpr: 1 }} />
    </AbsoluteFill>
  );
};
