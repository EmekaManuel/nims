import { useEffect } from 'react';
import { AbsoluteFill, continueRender, delayRender, useCurrentFrame } from 'remotion';
import { Screen } from '../native/Screen';
import { FINDERS, measureAll } from '../native/targets';
import { PLACE_SHOTS, dayShot } from './model';

const all = <T extends HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];
const buttonIn = (card: string, starts: string) => all<HTMLElement>(`article[aria-label="${card}"] button`).find((b) => (b.textContent ?? '').trim().startsWith(starts)) ?? null;
const button = (starts: string) => all<HTMLElement>('button').find((b) => (b.textContent ?? '').trim().startsWith(starts)) ?? null;
// The Places video's own targets, added to the demo's.
Object.assign(FINDERS, {
  'btn:travel': () => document.querySelector<HTMLElement>('button.road-btn'),
  'btn:setoff:saltmere': () => buttonIn('Saltmere Harbour', 'Set off'),
  'btn:fly:gemhollow': () => buttonIn('Gem Hollow', 'Fly'),
  'card:saltmere': () => document.querySelector<HTMLElement>('article[aria-label="Saltmere Harbour"]'),
  'card:gemhollow': () => document.querySelector<HTMLElement>('article[aria-label="Gem Hollow"]'),
  'btn:buyland': () => button('Buy this land'),
  'btn:build': () => button('Build ·'),
  'onroad': () => document.querySelector<HTMLElement>('.on-the-road .road-card'),
});

/** Frame i shows Places shot i and logs where its buttons are (node scripts/measure-places.mjs). */
export const MeasurePlaces: React.FC = () => {
  const frame = useCurrentFrame();
  const shot = PLACE_SHOTS[Math.min(frame, PLACE_SHOTS.length - 1)];
  useEffect(() => {
    const h = delayRender('measure');
    const t = setTimeout(() => { console.log('TARGETS ' + JSON.stringify({ id: shot.id, rects: measureAll() })); continueRender(h); }, 700);
    return () => clearTimeout(t);
  }, [shot.id]);
  return <AbsoluteFill><Screen shot={dayShot(shot)} town={{ t: 0, travel: true, camera: { position: [0, 13, 12], target: [0, 0, 0], fov: 38 } }} /></AbsoluteFill>;
};
