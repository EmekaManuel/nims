import lines from './data/lines.json';
import durations from './data/durations.json';
import clips from './data/clips.json';

export const FPS = 30;
export type Key = keyof typeof lines;
type Clip = keyof typeof clips;

type Kind = 'cards' | 'app' | 'footage';
interface Def {
  key: Key;
  kind: Kind;
  chapter: string;
  /** Seconds of quiet before the narration starts. */
  delay: number;
  /** Shortest the scene may be, in seconds. */
  min?: number;
  /** A merchant's spoken line that plays after the narration, and the gap before it. */
  clip?: Clip;
  clipGap?: number;
  /** Extra seconds after the narration, for the screen to finish what it is doing. */
  extra?: number;
}

const DEFS: Def[] = [
  { key: 'hook', kind: 'cards', chapter: '', delay: 0.5, min: 12.2 },
  { key: 'signin', kind: 'app', chapter: 'Sign in with an email', delay: 0.3, extra: 1.4 },
  { key: 'collect', kind: 'app', chapter: 'Buy low, carry it, sell high', delay: 0.3, extra: 0.6 },
  { key: 'tooltip', kind: 'app', chapter: 'Every price explains itself', delay: 0.3, clip: 'lena-price', clipGap: 0.3 },
  { key: 'sale', kind: 'app', chapter: 'Instant settlement', delay: 0.3, clip: 'haggle-reaction', clipGap: 0.35 },
  { key: 'broke', kind: 'app', chapter: 'Never stuck', delay: 0.3, extra: 2.6 },
  { key: 'news', kind: 'app', chapter: 'The Nims Gazette', delay: 0.3, min: 5.2 },
  { key: 'sim', kind: 'footage', chapter: 'A week in seconds', delay: 0.3, min: 10.5 },
  { key: 'chain', kind: 'cards', chapter: 'Settled on NEAR testnet', delay: 0.4, min: 9.6 },
  { key: 'outro', kind: 'cards', chapter: '', delay: 0.5, min: 9.8 },
];

export interface Scene {
  key: Key;
  kind: Kind;
  chapter: string;
  text: string;
  from: number;
  frames: number;
  delay: number;
  voiceFrames: number;
  /** The merchant's spoken line: which clip, and when it starts and how long it plays (in frames from the scene start). */
  clip?: { name: Clip; start: number; frames: number };
}

const TAIL = 0.6;
let cursor = 0;
export const SCENES: Scene[] = DEFS.map((d) => {
  const voice = durations[d.key];
  const clipDur = d.clip ? clips[d.clip] : 0;
  const voiceEnd = d.delay + voice;
  const clipStart = voiceEnd + (d.clipGap ?? 0);
  const end = Math.max(d.min ?? 0, (d.clip ? clipStart + clipDur : voiceEnd) + (d.extra ?? 0) + TAIL);
  const frames = Math.round(end * FPS);
  const s: Scene = {
    key: d.key, kind: d.kind, chapter: d.chapter, text: lines[d.key],
    from: cursor, frames, delay: Math.round(d.delay * FPS), voiceFrames: Math.round(voice * FPS),
    ...(d.clip ? { clip: { name: d.clip, start: Math.round(clipStart * FPS), frames: Math.round(clipDur * FPS) } } : {}),
  };
  cursor += frames;
  return s;
});
export const TOTAL_FRAMES = cursor;
export const scene = (k: Key) => SCENES.find((s) => s.key === k)!;
