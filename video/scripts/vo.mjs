// One audio file per beat from ElevenLabs (text-to-speech WITH TIMESTAMPS), cached by a hash of text + settings so a re-run spends nothing.
// The key is read from the environment only and is never printed or written anywhere.
//   node --env-file=../.env scripts/vo.mjs            (all beats)      node --env-file=../.env scripts/vo.mjs 4 5   (just those)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const here = new URL('../', import.meta.url).pathname;
const OUT = here + 'public/vo-launch/';
mkdirSync(OUT, { recursive: true });
const script = JSON.parse(readFileSync(here + 'vo-script.json'));
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY is not set in the environment.');
const voice = process.env.ELEVENLABS_VOICE ?? script.voice;
const settings = script.settings ?? { stability: 0.5, similarity_boost: 1, style: 0, use_speaker_boost: true }; // the same for every beat
const only = process.argv.slice(2).map(Number);
const beats = script.beats;

// how many spoken words a caption word turns into (the pronunciation respellings)
const SPOKEN = { 'nep-245': 3, testnet: 2, sputnikdao: 2, outlayer: 2, dao: 1 };
const clean = (w) => w.toLowerCase().replace(/[^a-z0-9-]/g, '');

function words(alignment) { // character times -> word times (spoken words)
  const out = []; let cur = null;
  alignment.characters.forEach((c, i) => {
    const s = alignment.character_start_times_seconds[i], e = alignment.character_end_times_seconds[i];
    if (/\s/.test(c)) { if (cur) out.push(cur), (cur = null); return; }
    if (!cur) cur = { text: '', start: s, end: e };
    cur.text += c; cur.end = e;
  });
  if (cur) out.push(cur);
  return out.filter((w) => !/^\.+$/.test(w.text)); // a pause marker is not a word
}
function captionWords(caption, spoken) { // map the caption's words onto the spoken words' times
  const cw = caption.split(/\s+/).filter(Boolean); const out = []; let i = 0;
  for (const w of cw) {
    const n = SPOKEN[clean(w)] ?? 1;
    const chunk = spoken.slice(i, i + n); i += n;
    if (!chunk.length) break;
    out.push({ text: w, start: chunk[0].start, end: chunk[chunk.length - 1].end });
  }
  if (i !== spoken.length) console.warn('  note: caption and spoken word counts differ', i, spoken.length);
  return out;
}

let spent = 0;
for (let k = 0; k < beats.length; k++) {
  const b = beats[k];
  if (only.length && !only.includes(b.n)) continue;
  const body = { text: b.tts, model_id: script.model, voice_settings: settings, previous_text: beats[k - 1]?.tts, next_text: beats[k + 1]?.tts };
  const hash = createHash('sha256').update(JSON.stringify({ voice, body })).digest('hex').slice(0, 16);
  const mp3 = OUT + `beat-${b.n}.mp3`, meta = OUT + `beat-${b.n}.alignment.json`;
  let info = existsSync(meta) ? JSON.parse(readFileSync(meta)) : null;
  if (!info || info.hash !== hash || !existsSync(mp3)) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status} on beat ${b.n}: ${(await r.text()).slice(0, 200)}`);
    const j = await r.json();
    writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
    const al = j.alignment ?? j.normalized_alignment;
    const spoken = words(al);
    info = { hash, beat: b.n, chars: b.tts.length, duration: al.character_end_times_seconds.at(-1), words: captionWords(b.caption, spoken), alignment: al };
    writeFileSync(meta, JSON.stringify(info));
    spent += b.tts.length;
    console.log(`beat ${b.n}: generated ${b.tts.length} chars, ${info.duration.toFixed(2)} s`);
  } else console.log(`beat ${b.n}: cached, ${info.duration.toFixed(2)} s (no credits spent)`);
}
const all = beats.map((b) => JSON.parse(readFileSync(OUT + `beat-${b.n}.alignment.json`)).duration);
writeFileSync(OUT + 'durations.json', JSON.stringify(Object.fromEntries(beats.map((b, i) => [b.n, +all[i].toFixed(3)])), null, 2));
console.log(`characters spent this run: ${spent}; total speech: ${all.reduce((a, b) => a + b, 0).toFixed(1)} s`);
