import lines from '../data/places-lines.json';
import durations from '../data/places-durations.json';
import { FPS } from '../timeline';

export type PlaceKey = keyof typeof lines;
interface Def { key: PlaceKey; kind: 'card' | 'app'; chapter: string; delay: number; min?: number; extra?: number }

/** The Places video, scene by scene. Each scene lasts as long as its narration (plus a breath), and at least `min`. */
const DEFS: Def[] = [
  { key: 'title', kind: 'card', chapter: '', delay: 0.6, min: 4.4 },
  { key: 'road', kind: 'app', chapter: 'Take the road out of town', delay: 0.4, min: 7.6 },
  { key: 'harbour', kind: 'app', chapter: 'Saltmere Harbour', delay: 0.4, min: 6.8 },
  { key: 'frontiers', kind: 'card', chapter: '', delay: 0.4, min: 4.8 },
  { key: 'timberfell', kind: 'app', chapter: 'Timberfell Woods', delay: 0.4, min: 7.8 },
  { key: 'flight', kind: 'app', chapter: 'Gem Hollow, by plane', delay: 0.4, min: 5.6 },
  { key: 'gems', kind: 'app', chapter: 'Gem Hollow', delay: 0.3, min: 4.8 },
  { key: 'outro', kind: 'card', chapter: '', delay: 0.5, min: 5.6 },
];

export interface PlaceScene { key: PlaceKey; kind: Def['kind']; chapter: string; text: string; from: number; frames: number; delay: number; voiceFrames: number }

let cursor = 0;
export const PLACE_SCENES: PlaceScene[] = DEFS.map((d) => {
  const voice = durations[d.key];
  const end = Math.max(d.min ?? 0, d.delay + voice + (d.extra ?? 0) + 0.7);
  const frames = Math.round(end * FPS);
  const s = { key: d.key, kind: d.kind, chapter: d.chapter, text: lines[d.key], from: cursor, frames, delay: Math.round(d.delay * FPS), voiceFrames: Math.round(voice * FPS) };
  cursor += frames;
  return s;
});
export const PLACES_FRAMES = cursor;
