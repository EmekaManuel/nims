// One audio file per SENTENCE from ElevenLabs (text-to-speech WITH TIMESTAMPS), cached by a hash of text + settings so a re-run spends nothing.
// Recording sentence by sentence lets the edit place its own pauses, so the delivery is steady and confident instead of one long run-on.
// A "..." at the start of a sentence in vo-script.json marks a reveal: the edit leaves a longer pause before it.
// The key is read from the environment only and is never printed or written anywhere.
//   node --env-file=../.env scripts/vo.mjs            (all beats)      node --env-file=../.env scripts/vo.mjs 1 5   (just those)
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const here = new URL('../', import.meta.url).pathname;
const OUT = here + 'public/vo-launch/';
mkdirSync(OUT, { recursive: true });
const script = JSON.parse(readFileSync(here + 'vo-script.json'));
const key = process.env.ELEVENLABS_API_KEY;
if (!key) throw new Error('ELEVENLABS_API_KEY is not set in the environment.');
const voice = process.env.ELEVENLABS_VOICE ?? script.voice;
const settings = script.settings; // the same for every sentence
const only = process.argv.slice(2).map(Number);

const SPOKEN = { 'nep-245': 3, testnet: 2, sputnikdao: 2, outlayer: 2, dao: 1 }; // caption word -> how many spoken words
const clean = (w) => w.toLowerCase().replace(/[^a-z0-9-]/g, '');
const split = (t) => t.split(/(?<=\.)\s+/).map((s) => s.trim()).filter(Boolean);
function words(al) {
  const out = []; let cur = null;
  al.characters.forEach((c, i) => {
    const s = al.character_start_times_seconds[i], e = al.character_end_times_seconds[i];
    if (/\s/.test(c)) { if (cur) out.push(cur), (cur = null); return; }
    if (!cur) cur = { text: '', start: s, end: e };
    cur.text += c; cur.end = e;
  });
  if (cur) out.push(cur);
  return out;
}
function captionWords(caption, spoken) {
  const out = []; let i = 0;
  for (const w of caption.split(/\s+/).filter(Boolean)) {
    const n = SPOKEN[clean(w)] ?? 1; const chunk = spoken.slice(i, i + n); i += n;
    if (!chunk.length) break;
    out.push({ text: w, start: chunk[0].start, end: chunk[chunk.length - 1].end });
  }
  if (i !== spoken.length) console.warn('  note: caption and spoken word counts differ', i, spoken.length);
  return out;
}

let spent = 0; const manifest = {};
for (const b of script.beats) {
  const spokenSentences = split(b.tts.replace(/\s*\.\.\.\s*/g, ' @@')).map((s) => ({ reveal: s.startsWith('@@'), text: s.replace(/^@@\s*/, '') })); // "..." marks a reveal
  const capSentences = split(b.caption);
  const sentences = [];
  for (let k = 0; k < spokenSentences.length; k++) {
    const s = spokenSentences[k];
    const body = { text: s.text, model_id: script.model, voice_settings: settings, previous_text: spokenSentences[k - 1]?.text, next_text: spokenSentences[k + 1]?.text };
    const hash = createHash('sha256').update(JSON.stringify({ voice, body })).digest('hex').slice(0, 16);
    const mp3 = OUT + `beat-${b.n}-s${k}.mp3`, meta = OUT + `beat-${b.n}-s${k}.json`;
    let info = existsSync(meta) ? JSON.parse(readFileSync(meta)) : null;
    if (only.length && !only.includes(b.n)) { if (!info) continue; }
    else if (!info || info.hash !== hash || !existsSync(mp3)) {
      const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`, { method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error(`ElevenLabs ${r.status} on beat ${b.n} sentence ${k}: ${(await r.text()).slice(0, 200)}`);
      const j = await r.json();
      writeFileSync(mp3, Buffer.from(j.audio_base64, 'base64'));
      const al = j.alignment ?? j.normalized_alignment;
      info = { hash, beat: b.n, sentence: k, text: s.text, reveal: s.reveal, chars: s.text.length, duration: al.character_end_times_seconds.at(-1), words: captionWords(capSentences[k] ?? s.text, words(al)) };
      writeFileSync(meta, JSON.stringify(info));
      spent += s.text.length;
      console.log(`beat ${b.n}.${k}: ${s.text.length} chars, ${info.duration.toFixed(2)} s${s.reveal ? '  (reveal)' : ''}`);
    }
    sentences.push({ file: `beat-${b.n}-s${k}.mp3`, duration: info.duration, reveal: s.reveal, text: s.text, words: info.words });
  }
  manifest[b.n] = sentences;
}
writeFileSync(OUT + 'manifest.json', JSON.stringify({ gaps: script.gaps, beats: manifest }, null, 2));
console.log(`characters spent this run: ${spent}`);
