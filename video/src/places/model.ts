import data from '../data/places.json';
import type { Shot } from '../native/model';

/** The Places video's shots, played through the real game by scripts/play-places.ts. */
export const PLACE_SHOTS = (data as unknown as { shots: Shot[] }).shots;
export const placeShot = (id: string): Shot => {
  const s = PLACE_SHOTS.find((x) => x.id === id);
  if (!s) throw new Error(`No places shot called ${id}`);
  return s;
};
/** The Places video is set in daylight: every shot's hour is moved to late morning, keeping the story's order. */
export const dayShot = (s: Shot, hour = 11): Shot => ({ ...s, state: { ...(s.state as object), hour: Math.floor((s.state as { hour: number }).hour / 24) * 24 + hour } });
