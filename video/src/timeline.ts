import beatsFile from './data/beats.json';
import lines from './data/lines.json';
import durations from './data/durations.json';

export const FPS = 30;
export const SRC_W = 1920, SRC_H = 1080;
export type Key = keyof typeof lines;
export type Focus = { x: number; y: number; zoom: number };

const beats = beatsFile.beats as Record<string, { start: number; end: number }>;
export const facts = beatsFile.facts as Record<string, number | string>;
/** The recorder's clock minus the video's clock, measured from the magenta sync flash at the start of the take. */
const OFFSET = beatsFile.offset;
const videoTime = (scriptSeconds: number) => scriptSeconds - OFFSET;

interface Def { key: Key; beat?: string; chapter: string; min: number; delay: number; focus: [number, Focus][] }

// Where the camera looks (in the 1920x1080 recording). Each entry is [fraction of the scene, view].
const DEFS: Def[] = [
  { key: 'hook', chapter: '', min: 12.2, delay: 0.5, focus: [] },
  { key: 'signin', beat: 'signin', chapter: 'Sign in with an email', min: 0, delay: 0.3, focus: [[0, { x: 960, y: 540, zoom: 1.6 }], [0.7, { x: 960, y: 520, zoom: 1.5 }]] },
  { key: 'goal', beat: 'goal', chapter: 'Pick a goal', min: 0, delay: 0.25, focus: [[0, { x: 960, y: 520, zoom: 1.45 }]] },
  { key: 'collect', beat: 'collect', chapter: 'Buy low, carry it, sell high', min: 0, delay: 0.25, focus: [[0, { x: 960, y: 580, zoom: 1.3 }]] },
  { key: 'tooltip', beat: 'tooltip', chapter: 'Every price explains itself', min: 0, delay: 0.25, focus: [[0, { x: 1500, y: 430, zoom: 1.75 }]] },
  { key: 'sale', beat: 'sale', chapter: 'Instant settlement', min: 0, delay: 0.2, focus: [[0, { x: 1100, y: 440, zoom: 1.3 }]] },
  { key: 'order', beat: 'order', chapter: 'Delivery orders', min: 0, delay: 0.25, focus: [[0, { x: 960, y: 560, zoom: 1.25 }], [0.3, { x: 1560, y: 690, zoom: 1.7 }]] },
  { key: 'filled', beat: 'filled', chapter: 'Delivery orders', min: 0, delay: 0.2, focus: [[0, { x: 1000, y: 420, zoom: 1.25 }]] },
  { key: 'prices', beat: 'prices', chapter: 'The price board', min: 0, delay: 0.25, focus: [[0, { x: 1400, y: 470, zoom: 1.5 }]] },
  { key: 'shares', beat: 'shares', chapter: 'Own a piece of a merchant', min: 0, delay: 0.25, focus: [[0, { x: 1560, y: 520, zoom: 1.55 }]] },
  { key: 'sim', beat: 'sim', chapter: 'A week in seconds', min: 0, delay: 0.3, focus: [[0, { x: 900, y: 420, zoom: 1.3 }], [0.42, { x: 1450, y: 430, zoom: 1.75 }]] },
  { key: 'chain', chapter: 'Settled on NEAR testnet', min: 9.6, delay: 0.4, focus: [] },
  { key: 'outro', chapter: '', min: 9.8, delay: 0.5, focus: [] },
];

export interface Scene {
  key: Key; chapter: string; text: string; from: number; frames: number; delay: number; voiceFrames: number;
  footage: boolean; focus: [number, Focus][];
  /** Footage mapping: source seconds, playback rate, and how many composition frames the footage plays before holding. */
  a: number; b: number; rate: number; playFrames: number;
}

const TAIL = 0.55;
let cursor = 0;
export const SCENES: Scene[] = DEFS.map((d) => {
  const voice = durations[d.key];
  const frames = Math.round(Math.max(d.min, d.delay + voice + TAIL) * FPS);
  const beat = d.beat ? beats[d.beat] : undefined;
  const a = beat ? videoTime(beat.start) - 0.12 : 0;
  const b = beat ? videoTime(beat.end) : 0;
  const n = b - a;
  const rate = beat ? Math.min(1.75, Math.max(0.8, n / ((frames / FPS) - 0.2))) : 1;
  const playFrames = beat ? Math.min(frames, Math.round((n / rate) * FPS)) : 0;
  const s: Scene = { key: d.key, chapter: d.chapter, text: lines[d.key], from: cursor, frames, delay: Math.round(d.delay * FPS), voiceFrames: Math.round(voice * FPS), footage: !!beat, focus: d.focus, a, b, rate, playFrames };
  cursor += frames;
  return s;
});
export const TOTAL_FRAMES = cursor;
export const scene = (k: Key) => SCENES.find((s) => s.key === k)!;

/** Frame inside a footage scene at which something that happened at recorder time `scriptSeconds` is on screen. */
export const sceneFrameOf = (k: Key, scriptSeconds: number) => {
  const s = scene(k);
  return Math.round(((videoTime(scriptSeconds) - s.a) / s.rate) * FPS);
};
