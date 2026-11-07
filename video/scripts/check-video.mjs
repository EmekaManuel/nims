// Looks for glitches in a rendered video: a frame that differs a lot from BOTH of its neighbours while those two are nearly the same
// (a flicker: the wrong picture for one frame), and sudden whole-picture jumps. Needs ffmpeg.
//   node scripts/check-video.mjs out/nims-demo.mp4 [firstFrameOfAnyPlannedCuts...]
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const file = process.argv[2] ?? 'out/nims-demo.mp4';
const cuts = process.argv.slice(3).map(Number); // frames where a cut is expected, so they are not reported
const dir = mkdtempSync(join(tmpdir(), 'nims-check-'));
const ff = (filter, out) => execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-filter_complex', filter, '-an', '-f', 'null', '-'], { stdio: 'inherit' });
// d1[k] = how much frame k+1 differs from frame k; d2[k] = how much frame k+2 differs from frame k
ff(`[0:v]scale=320:180,signalstats,metadata=print:key=lavfi.signalstats.YDIF:file=${dir}/d1.txt`);
ff(`[0:v]scale=320:180,format=gray,split[a][b];[b]trim=start_frame=2,setpts=PTS-STARTPTS[b2];[a][b2]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=${dir}/d2.txt`);
const read = (f, key) => readFileSync(join(dir, f), 'utf8').split('\n').map((l) => l.match(new RegExp(`${key}=([0-9.]+)`))?.[1]).filter(Boolean).map(Number);
const d1 = read('d1.txt', 'YDIF'), d2 = read('d2.txt', 'YAVG');
const near = (i) => cuts.some((c) => Math.abs(i - c) <= 10);
const flickers = [];
for (let k = 0; k + 1 < d1.length && k < d2.length; k++) {
  const a = d1[k], b = d1[k + 1], c = d2[k]; // frame k+1 sits between k and k+2
  if (Math.min(a, b) > 1.2 && c < 0.55 * Math.min(a, b) && !near(k + 1)) flickers.push({ frame: k + 1, a, b, c });
}
console.log(`${d1.length + 1} frames. Flicker candidates (a frame unlike both neighbours, which are alike): ${flickers.length}`);
for (const f of flickers.slice(0, 40)) console.log(`  frame ${f.frame} (${(f.frame / 30).toFixed(2)}s): ${f.a.toFixed(1)} in, ${f.b.toFixed(1)} out, neighbours differ by ${f.c.toFixed(1)}`);
process.exit(flickers.length ? 1 : 0);
