// Render chosen frames of a composition to PNGs with one bundle: node scripts/frames.mjs <composition> <outdir> <frame> [frame...]
import path from 'node:path';
import { mkdirSync } from 'node:fs';
import { bundle } from '@remotion/bundler';
import { renderStill, selectComposition } from '@remotion/renderer';
import { override } from '../webpack-override.mjs';

const [id, dir, ...frames] = process.argv.slice(2);
mkdirSync(dir, { recursive: true });
const serveUrl = await bundle({ entryPoint: path.resolve('src/index.ts'), webpackOverride: override });
const composition = await selectComposition({ serveUrl, id, inputProps: { voice: false } });
for (const f of frames) {
  await renderStill({ composition, serveUrl, frame: Number(f), output: path.join(dir, `${f}.png`), imageFormat: 'png', chromiumOptions: { gl: 'angle' }, timeoutInMilliseconds: 120000, inputProps: { voice: false } });
  console.log('frame', f);
}
