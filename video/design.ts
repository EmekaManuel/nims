// The launch video's design system. Every size, colour and motion in the video comes from here, so the whole thing reads as one piece.
// The look is the game's own: the deep-blue HUD navy, its blue and gold, and its Fredoka display type, with a mono face for the "truth" layer.
import { Easing } from 'remotion';

export const FPS = 30;
export const W = 1920;
export const H = 1080;

/** 1920×1080, 96 px outer safe margins, a 12-column grid. Everything snaps to these. */
export const GRID = { margin: 96, columns: 12, gutter: 24, colWidth: (W - 2 * 96 - 11 * 24) / 12 };
export const col = (span: number, start = 0) => ({ x: GRID.margin + start * (GRID.colWidth + GRID.gutter), w: span * GRID.colWidth + (span - 1) * GRID.gutter });

/** An 8 px scale. */
export const sp = (n: number) => n * 8;

/** Colour: neutrals, plus two accents (blue and gold). */
export const C = {
  bg: '#0b1636', panel: '#101e45', terminal: '#060d24', line: 'rgba(255,255,255,0.16)',
  text: '#ffffff', muted: '#a9bff0',
  blue: '#2a6fdb', gold: '#ffc21a',
  scrim: 'rgba(6,13,36,0.82)',
} as const;

/** Type: a 4-step scale, 2 weights, a display face and a mono face. */
export const T = { display: 96, title: 56, body: 36, small: 28 } as const;
export const WEIGHT = { regular: 500, bold: 700 } as const;
export const FONT = { display: '"Fredoka", system-ui, sans-serif', mono: '"JetBrains Mono", ui-monospace, monospace' } as const;

export const RADIUS = 16;
export const STROKE = 2;

/** Motion: 3 durations, 1 easing curve for UI motion, 1 spring for camera moves. */
export const MS = { fast: 150, base: 300, slow: 600 } as const;
export const frames = (ms: number) => Math.round((ms / 1000) * FPS);
export const EASE = Easing.bezier(0.2, 0, 0, 1);
export const CAMERA_SPRING = { damping: 200, mass: 0.9, stiffness: 120 } as const;
/** Text and panels enter with one motion: an 8 px rise and a fade over MS.base. */
export const RISE = 8;

/** Captions: large, high-contrast, lower third, 4–8 words at a time. */
export const CAPTION = { size: T.title, maxWords: 8, bottom: GRID.margin };
