// Pictures of the new places, rendered from the real game (src/places/PlaceStill.tsx): node scripts/place-stills.mjs <outdir>
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { override } from '../webpack-override.mjs';

const dir = process.argv[2] ?? 'out/places';
mkdirSync(dir, { recursive: true });
const STILLS = {
  'saltmere-harbour': { kind: 'hero', shot: 'harbour', pos: [4.2, 4.6, 10.5], look: [-0.4, 0.5, -2.2], fov: 42, title: 'Saltmere Harbour', sub: 'Fish, salt and spice, and merchants of its own' },
  'timberfell-woods': { kind: 'hero', shot: 'timberfell-built', pos: [7.4, 6.4, 10.2], look: [0.4, 0.3, -0.6], fov: 42, title: 'Timberfell Woods', sub: 'Buy a plot and build the first shop' },
  'gem-hollow': { kind: 'hero', shot: 'gemhollow', pos: [-7.2, 6.2, 9.4], look: [0.2, 0.3, -0.8], fov: 42, title: 'Gem Hollow', sub: 'A seam of gems, a flight away' },
  'sunvale': { kind: 'hero', shot: 'sunvale', pos: [6.6, 6.2, 10], look: [0.6, 0.3, -0.8], fov: 42, title: 'Sunvale', sub: 'Sunny hills, a vineyard, and no shops yet' },
  'travel-panel': { kind: 'screen', shot: 'fly', pos: [1.2, 12.5, 12.5], look: [1.0, 0, -0.2] },
  'buy-land': { kind: 'screen', shot: 'timberfell-plot', pos: [-1.6, 8.4, 9.6], look: [-2.8, 0.2, 0.2], fov: 40 },
  'flight': { kind: 'screen', shot: 'flight-4', pos: [1.2, 12.5, 12.5], look: [1.0, 0, -0.2] },
};
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), webpackOverride: override });
for (const [name, props] of Object.entries(STILLS)) {
  const composition = await selectComposition({ serveUrl, id: 'PlaceStill', inputProps: props });
  await renderStill({ composition, serveUrl, frame: 0, output: path.join(dir, `${name}.png`), imageFormat: 'png', inputProps: props, chromiumOptions: { gl: 'angle' }, timeoutInMilliseconds: 120000 });
  console.log('still', name);
}
