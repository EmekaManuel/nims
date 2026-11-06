import session from '../data/session.json';
import targetsFile from '../data/targets.json';

export type Selection = { kind: 'stall'; id: string } | { kind: 'source'; item: string } | null;
export interface Shot {
  id: string;
  state: unknown;
  selected: Selection;
  tab: string | null;
  toast?: { ok: boolean; text: string; line?: string };
  hover?: string;
  voiceText?: string;
  audio?: string;
  gazette?: string[];
}

export const SHOTS = session.shots as unknown as Shot[];
export const shot = (id: string): Shot => {
  const s = SHOTS.find((x) => x.id === id);
  if (!s) throw new Error(`No shot called ${id}`);
  return s;
};

export interface Rect { x: number; y: number; w: number; h: number }
/** Where each named element sits on the 1920x1080 screen in each shot (made by `npm run measure`). */
export const TARGETS = targetsFile as Record<string, Record<string, Rect>>;
export const centre = (shotId: string, name: string, dx = 0, dy = 0): { x: number; y: number } => {
  const r = TARGETS[shotId]?.[name];
  if (!r) throw new Error(`No measured target "${name}" in shot "${shotId}". Run: npm run measure`);
  return { x: r.x + r.w / 2 + dx, y: r.y + r.h / 2 + dy };
};
