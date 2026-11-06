// Reads the length of every narration line (public/vo/*.mp3 -> src/data/durations.json) and every merchant clip
// (public/live/*.mp3 -> src/data/clips.json). Run after changing the voice or re-running the session.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const here = (p) => new URL(p, import.meta.url).pathname;
const secs = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim());
const lines = JSON.parse(readFileSync(here('./src/data/lines.json')));
const durations = {};
for (const k of Object.keys(lines)) durations[k] = secs(here(`./public/vo/${k}.mp3`));
writeFileSync(here('./src/data/durations.json'), JSON.stringify(durations, null, 1));
const clips = {};
for (const f of readdirSync(here('./public/live')).filter((f) => f.endsWith('.mp3'))) clips[f.replace(/\.mp3$/, '')] = secs(here(`./public/live/${f}`));
writeFileSync(here('./src/data/clips.json'), JSON.stringify(clips, null, 1));
console.log('narration', durations, '\nclips', clips);
