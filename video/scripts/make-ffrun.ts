/**
 * Runs the real fast-forward week (the same engine and pricing the game uses) and saves it for the video's dashboard scene.
 *   cd video && npx tsx scripts/make-ffrun.ts
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { DEFAULT_PARAMS, runFastForward } from '../../sim/fastforward';

const out = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', 'data', 'ffrun.json');
const run = runFastForward(DEFAULT_PARAMS);
writeFileSync(out, JSON.stringify(run));
console.log(`wrote ${out}: ${run.hours} hours`, run.highlights);
