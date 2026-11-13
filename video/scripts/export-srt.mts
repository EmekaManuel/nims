// Captions for the launch video as an .srt, from the voice's own word timings (the same phrasing the burned-in captions use).
import { writeFileSync } from 'node:fs';
import { BEATS } from '../src/launch/timeline.ts';
const FPS = 30;
const ts = (s: number) => { const ms = Math.round(s * 1000); const p = (n: number, w = 2) => String(n).padStart(w, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
let n = 1; let out = '';
for (const b of BEATS) {
  if (b.n === 2 || b.n === 9) continue; // those beats show their words as large on-screen text
  const words = b.sentences.flatMap((s) => s.words.map((w) => ({ text: w.text, start: s.start + w.start, end: s.start + w.end })));
  let cur: typeof words = [];
  const flush = () => { if (!cur.length) return; const a = b.from / FPS + cur[0].start - 0.08, z = b.from / FPS + cur[cur.length - 1].end + 0.35; out += `${n++}\n${ts(Math.max(0, a))} --> ${ts(z)}\n${cur.map((w) => w.text).join(' ')}\n\n`; cur = []; };
  words.forEach((w, i) => { cur.push(w); if (cur.length >= 8 || (/[.,:;?]$/.test(w.text) && cur.length >= 3) || i === words.length - 1) flush(); });
}
writeFileSync(new URL('../out/nims-demo-captions.srt', import.meta.url), out);
console.log(`${n - 1} caption cues`);
