// The launch video's timeline, driven by the voice: each beat is as long as its narration (with its pauses) or its visuals need, whichever is longer.
import manifest from '../../public/vo-launch/manifest.json';
import { FPS } from '../../design';

export interface Word { text: string; start: number; end: number }
/** Times are in seconds, local to the beat. */
export interface Sent { file: string; start: number; duration: number; reveal: boolean; words: Word[] }
export interface Beat { n: number; from: number; frames: number; sentences: Sent[]; voiceEnd: number }

/** The shortest each beat may be, in seconds: some beats are carried by their pictures, not the voice. */
export const MIN: Record<number, number> = { 1: 8.5, 2: 7.5, 3: 11, 4: 0, 5: 17, 6: 21.5, 7: 19.9, 8: 11, 9: 6.5 };
const LEAD = 0.35;
const TAIL = 0.6;

type Raw = { file: string; duration: number; reveal: boolean; words: Word[] };
const gaps = manifest.gaps as { sentence: number; reveal: number };
const raw = manifest.beats as unknown as Record<string, Raw[]>;

let cursor = 0;
export const BEATS: Beat[] = Object.keys(raw).map(Number).sort((a, b) => a - b).map((n) => {
  let t = LEAD;
  const sentences = raw[String(n)].map((s, i) => {
    if (i > 0) t += s.reveal ? gaps.reveal : gaps.sentence;
    const out: Sent = { file: s.file, start: t, duration: s.duration, reveal: s.reveal, words: s.words };
    t += s.duration;
    return out;
  });
  const frames = Math.round(Math.max(MIN[n] ?? 0, t + TAIL) * FPS);
  const beat: Beat = { n, from: cursor, frames, sentences, voiceEnd: t };
  cursor += frames;
  return beat;
});
export const TOTAL_FRAMES = cursor;
export const beat = (n: number) => BEATS.find((b) => b.n === n)!;
