// A cut of docs/nims-demo.mp4 for X (standard accounts allow 2:20): the story without the side scenes, a caption saying what
// the picture is, and an end card. It cuts the finished video, so nothing is re-rendered and no API key is needed.
//
//   node scripts/make-short.mjs            -> out/nims-demo-x.mp4
//
// Scene times come from src/timeline.ts (the same arithmetic): simsIntro..sale end at 73.03 s, wary and council run 82.10-112.00,
// and sim, chain and record run 146.00-177.93. Dropped: online, broke, news, cities and the long outro (the end card replaces it).
import { execFileSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');
const src = join(root, '..', 'docs', 'nims-demo.mp4');
const out = join(root, 'out');
mkdirSync(join(out, 'short'), { recursive: true });
const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const RANGES = [[0, 73.03], [82.10, 112.00], [146.00, 177.93]];
const END_SECONDS = 4;
const CAPTION_SECONDS = 7;

const probe = (args) => execFileSync('ffprobe', ['-v', 'error', ...args], { encoding: 'utf8' }).trim();
const duration = Number(probe(['-show_entries', 'format=duration', '-of', 'default=nw=1:nk=1', src]));
if (Math.abs(duration - 189.248) > 0.5) throw new Error(`docs/nims-demo.mp4 is ${duration.toFixed(1)} s, not the 189.2 s these cut times were made for. Re-read src/timeline.ts and update RANGES.`);
const rate = probe(['-select_streams', 'a:0', '-show_entries', 'stream=sample_rate', '-of', 'default=nw=1:nk=1', src]);

// the caption and the end card are pictures made from HTML, so they match the game's look
const shot = (page, png, transparent) => {
  if (!existsSync(CHROME)) throw new Error(`Chrome not found at ${CHROME}; set CHROME to a Chrome or Chromium binary.`);
  execFileSync(CHROME, ['--headless', '--hide-scrollbars', '--force-device-scale-factor=1', ...(transparent ? ['--default-background-color=00000000'] : []),
    `--screenshot=${png}`, '--window-size=1920,1080', `file://${join(here, 'short', page)}`], { stdio: 'ignore' });
};
const caption = join(out, 'short', 'caption.png');
const endcard = join(out, 'short', 'endcard.png');
shot('caption.html', caption, true);
shot('endcard.html', endcard, false);

const parts = [];
const labels = [];
RANGES.forEach(([a, b], i) => {
  parts.push(`[0:v]trim=${a}:${b},setpts=PTS-STARTPTS,fps=30,format=yuv420p[v${i}]`);
  parts.push(`[0:a]atrim=${a}:${b},asetpts=PTS-STARTPTS,afade=t=in:st=0:d=0.1,afade=t=out:st=${(b - a - 0.12).toFixed(2)}:d=0.12,aresample=${rate}[a${i}]`);
  labels.push(`[v${i}][a${i}]`);
});
parts.push(`[2:v]fps=30,format=yuv420p,setsar=1,fade=t=in:st=0:d=0.4[ve]`);
parts.push(`[3:a]aresample=${rate}[ae]`);
labels.push('[ve][ae]');
parts.push(`${labels.join('')}concat=n=${labels.length}:v=1:a=1[vc][ac]`);
parts.push(`[vc][1:v]overlay=0:0:enable='between(t,0.5,${CAPTION_SECONDS})'[vout]`);

const dest = join(out, 'nims-demo-x.mp4');
execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', src,
  '-loop', '1', '-t', String(CAPTION_SECONDS + 1), '-i', caption,
  '-loop', '1', '-t', String(END_SECONDS), '-i', endcard,
  '-f', 'lavfi', '-t', String(END_SECONDS), '-i', `anullsrc=r=${rate}:cl=stereo`,
  '-filter_complex', parts.join(';'), '-map', '[vout]', '-map', '[ac]',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '160k', '-movflags', '+faststart', dest], { stdio: 'inherit' });
console.log(dest);
