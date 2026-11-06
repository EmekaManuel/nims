// Renders each recorded shot of the real game screen and records where the buttons, prices and stalls are,
// so the video's cursor and camera can point at them exactly. Run again whenever the game's layout changes.
import path from 'node:path';
import { writeFileSync } from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { override } from '../webpack-override.mjs';

const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), webpackOverride: override });
const composition = await selectComposition({ serveUrl, id: 'Measure' });
const out = {};
const tmp = path.resolve('out/measure.png');
for (let frame = 0; frame < composition.durationInFrames; frame++) {
  let got = null;
  await renderStill({
    composition, serveUrl, frame, output: tmp, imageFormat: 'png',
    onBrowserLog: (l) => { if (l.text.startsWith('TARGETS ')) got = JSON.parse(l.text.slice(8)); },
  });
  if (!got) throw new Error(`no measurements for frame ${frame}`);
  out[got.id] = got.rects;
  console.log(got.id.padEnd(12), Object.keys(got.rects).join(' '));
}
writeFileSync(path.resolve('src/data/targets.json'), JSON.stringify(out, null, 1));
console.log('wrote src/data/targets.json');
