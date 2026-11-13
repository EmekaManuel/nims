import { Composition } from 'remotion';
import { NimsDemo } from './launch/NimsDemo';
import { TOTAL_FRAMES as LAUNCH_FRAMES } from './launch/timeline';
import { Banner } from './Banner';
import { Banner512 } from './Banner512';
import { Measure } from './native/Measure';
import { SHOTS } from './native/model';
import { Nims } from './native/Nims';
import { Stills } from './native/Stills';
import { Town3dTest } from './native/Town3dTest';
import { PlacesTest } from './places/PlacesTest';
import { MeasurePlaces } from './places/MeasurePlaces';
import { PLACE_SHOTS } from './places/model';
import { Places } from './places/Places';
import { PlaceStill } from './places/PlaceStill';
import { PLACES_FRAMES } from './places/timeline';
import { FPS, TOTAL_FRAMES } from './timeline';

export const Root: React.FC = () => (
  <>
    <Composition id="NimsDemo" component={NimsDemo} durationInFrames={LAUNCH_FRAMES} fps={30} width={1920} height={1080} defaultProps={{ music: true }} />
    <Composition id="Nims" component={Nims} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ voice: true }} />
    {/* Same picture, no narration track: for laying your own voice over. */}
    <Composition id="NimsSilent" component={Nims} durationInFrames={TOTAL_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ voice: false }} />
    {/* Not a video: frame i shows recorded shot i and logs where its buttons are (npm run measure). */}
    <Composition id="Measure" component={Measure} durationInFrames={SHOTS.length + 1} fps={FPS} width={1920} height={1080} />
    {/* One frame of the 3D town at night, for checking the picture (npx remotion still src/index.ts Town3dTest out/town.png). */}
    <Composition id="Town3dTest" component={Town3dTest} durationInFrames={300} fps={FPS} width={1920} height={1080} />
    {/* Pictures of the real game for the README and posts (see native/Stills.tsx). */}
    <Composition id="Img" component={Stills} durationInFrames={400} fps={FPS} width={1920} height={1080} />
    {/* "A world beyond the town": the harbour and the frontiers, in daylight (npx remotion render src/index.ts Places out/nims-new-places.mp4). */}
    <Composition id="Places" component={Places} durationInFrames={PLACES_FRAMES} fps={FPS} width={1920} height={1080} defaultProps={{ voice: true }} />
    <Composition id="PlaceStill" component={PlaceStill} durationInFrames={1} fps={FPS} width={1920} height={1080} defaultProps={{ kind: 'hero', shot: 'harbour', pos: [0, 12.5, 12.5], look: [0, 0, 0] }} />
    <Composition id="MeasurePlaces" component={MeasurePlaces} durationInFrames={PLACE_SHOTS.length} fps={FPS} width={1920} height={1080} />
    <Composition id="PlacesTest" component={PlacesTest} durationInFrames={300} fps={FPS} width={1920} height={1080} />
    <Composition id="Banner" component={Banner} durationInFrames={1} fps={FPS} width={1600} height={640} />
    <Composition id="Banner512" component={Banner512} durationInFrames={1} fps={FPS} width={1600} height={512} />
  </>
);
