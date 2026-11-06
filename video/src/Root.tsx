import { Composition } from 'remotion';
import { Banner } from './Banner';
import { Measure } from './native/Measure';
import { SHOTS } from './native/model';
import { Nims } from './native/Nims';
import { FPS, TOTAL_FRAMES } from './timeline';

export const Root: React.FC = () => (
  <>
    <Composition id="Nims" component={Nims} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ voice: true }} />
    {/* Same picture, no narration track: for laying your own voice over. */}
    <Composition id="NimsSilent" component={Nims} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ voice: false }} />
    {/* Not a video: frame i shows recorded shot i and logs where its buttons are (npm run measure). */}
    <Composition id="Measure" component={Measure} durationInFrames={SHOTS.length + 1} fps={FPS} width={1920} height={1080} />
    <Composition id="Banner" component={Banner} durationInFrames={1} fps={FPS} width={1600} height={640} />
  </>
);
