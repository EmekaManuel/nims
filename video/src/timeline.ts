import cuesFile from './data/cues.json';
import lines from './data/lines.json';
import durations from './data/durations.json';

export const FPS = 30;
/** The recorder's clock runs 0.88 s ahead of the first frame of the clip (measured). */
export const CLIP_OFFSET = 0.8;
export const CLIP_SECONDS = 89.2;

export type Key = keyof typeof lines;
type Focus = { x: number; y: number; zoom: number };
type Scene = { chapter: string; focus: Focus };

/** Where the camera looks (in the 1280x720 recording) while each line is spoken. */
const SCENES: Record<Key, Scene> = {
  title: { chapter: 'Meet Nims', focus: { x: 640, y: 360, zoom: 1 } },
  login: { chapter: 'Sign in', focus: { x: 640, y: 340, zoom: 1.3 } },
  login2: { chapter: 'Sign in', focus: { x: 640, y: 360, zoom: 1.15 } },
  goal: { chapter: 'Pick a goal', focus: { x: 640, y: 330, zoom: 1.2 } },
  collect: { chapter: 'Buy low, carry it, sell high', focus: { x: 640, y: 300, zoom: 1.12 } },
  tooltip: { chapter: 'Buy low, carry it, sell high', focus: { x: 900, y: 420, zoom: 1.4 } },
  sale: { chapter: 'Buy low, carry it, sell high', focus: { x: 420, y: 290, zoom: 1.25 } },
  order: { chapter: 'Delivery orders', focus: { x: 900, y: 500, zoom: 1.4 } },
  order2: { chapter: 'Delivery orders', focus: { x: 900, y: 500, zoom: 1.4 } },
  order3: { chapter: 'Delivery orders', focus: { x: 400, y: 200, zoom: 1.3 } },
  prices: { chapter: 'The price board', focus: { x: 900, y: 360, zoom: 1.35 } },
  shares: { chapter: 'Own a piece of a merchant', focus: { x: 900, y: 320, zoom: 1.35 } },
  ff: { chapter: 'A week in seconds', focus: { x: 640, y: 360, zoom: 1 } },
  ff2: { chapter: 'A week in seconds', focus: { x: 640, y: 360, zoom: 1 } },
  ff3: { chapter: 'A week in seconds', focus: { x: 640, y: 360, zoom: 1 } },
  outro: { chapter: 'Under the hood', focus: { x: 640, y: 360, zoom: 1 } },
};

export interface Cue { key: Key; text: string; chapter: string; focus: Focus; from: number; frames: number }

export const CUES: Cue[] = cuesFile.cues.map((c) => {
  const key = c.k as Key;
  return {
    key, text: lines[key], chapter: SCENES[key].chapter, focus: SCENES[key].focus,
    from: Math.round((c.start - CLIP_OFFSET) * FPS),
    frames: Math.round(durations[key] * FPS),
  };
});
export const cue = (k: Key) => CUES.find((c) => c.key === k)!;
export const TITLE = cue('title');
export const OUTRO = cue('outro');
export const TOTAL_FRAMES = OUTRO.from + OUTRO.frames + 12;
