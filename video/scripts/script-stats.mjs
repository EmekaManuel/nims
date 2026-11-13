// Words, characters and banned-phrase scan for the exact text that goes to the voice and onto the screen.
import { readFileSync } from 'node:fs';
const d = JSON.parse(readFileSync(new URL('../vo-script.json', import.meta.url)));
const BANNED = [/introducing/i, /revolution/i, /game-?changer/i, /seamless/i, /unlock/i, /unleash/i, /empower/i, /harness/i, /leverage/i, /cutting-edge/i, /next-generation/i, /the future of/i, /in a world where/i, /imagine a world/i, /powered by (ai|near)/i, /elevate/i, /supercharge/i, /dive in/i, /it'?s not just/i, /say goodbye/i, /whether you'?re/i, /!/, /\bworld-class\b/i, /\bmagic(al)?\b/i];
let words = 0, chars = 0, hits = 0;
for (const b of d.beats) {
  const w = b.tts.replace(/\.\.\./g, '').split(/\s+/).filter(Boolean).length; words += w; chars += b.tts.length;
  const bad = BANNED.filter((r) => r.test(b.caption) || r.test(b.tts)); hits += bad.length;
  const opener = /\?\s*$/.test(b.caption.split('. ')[0]) ? ' OPENER IS A QUESTION' : '';
  console.log(`beat ${b.n}: ${String(w).padStart(3)} words ${String(b.tts.length).padStart(4)} chars ~${(w / 145 * 60).toFixed(0)} s${bad.length ? '  BANNED: ' + bad.join(',') : ''}${opener}`);
}
console.log(`TOTAL ${words} words, ${chars} characters, ~${(words / 145 * 60).toFixed(0)} s of speech at 145 wpm; banned-phrase hits: ${hits}`);
