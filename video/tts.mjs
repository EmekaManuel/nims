// Writes public/vo/<scene>.mp3 for every line in src/data/lines.json.
// ELEVENLABS_API_KEY (+ optional ELEVENLABS_VOICE id) -> a natural voice. Without a key it falls back to the macOS "say"
// voice, which is only a placeholder. Or skip this and drop your own recordings in public/vo/<scene>.mp3.
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const lines = JSON.parse(readFileSync(new URL('./src/data/lines.json', import.meta.url)));
const dir = new URL('./public/vo/', import.meta.url).pathname;
mkdirSync(dir, { recursive: true });
const key = process.env.ELEVENLABS_API_KEY;
const voice = process.env.ELEVENLABS_VOICE ?? '7IAccZ5Mu2dejWi0Rd6v';
// `node tts.mjs signin` makes just that scene's line, so the other recordings (and credits) are left alone.
const only = process.argv.slice(2);
for (const [k, text] of Object.entries(lines)) {
  if (only.length && !only.includes(k)) continue;
  const out = dir + k + '.mp3';
  if (key) {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
      method: 'POST', headers: { 'xi-api-key': key, 'content-type': 'application/json' },
      body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 1, style: 0, use_speaker_boost: true } }),
    });
    if (!r.ok) throw new Error(`ElevenLabs ${r.status}: ${await r.text()}`);
    writeFileSync(out, Buffer.from(await r.arrayBuffer()));
  } else {
    execFileSync('say', ['-v', 'Samantha', '-r', '175', '-o', dir + k + '.aiff', text]);
    execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', dir + k + '.aiff', '-ar', '44100', '-b:a', '128k', out]);
  }
  console.log('voice', k);
}
