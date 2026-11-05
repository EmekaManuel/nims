// Reads the length of every public/vo/*.mp3 into src/data/durations.json. Run after changing the voice.
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const lines = JSON.parse(readFileSync(new URL('./src/data/lines.json', import.meta.url)));
const out = {};
for (const k of Object.keys(lines)) {
  out[k] = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', new URL(`./public/vo/${k}.mp3`, import.meta.url).pathname]).toString().trim());
}
writeFileSync(new URL('./src/data/durations.json', import.meta.url), JSON.stringify(out, null, 1));
console.log(out);
