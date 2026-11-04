/** Fast-forward a week from the command line: `npm run sim` writes sim/out/run.json. (The visual dashboard is at #sim in the web app.) */
import { mkdirSync, writeFileSync } from 'node:fs';
import { act, newPlayer } from './players';
import { tick } from './engine';
import { createWorld } from './world';

export function runWeek(seed = 1, days = 7) {
  const players = [
    newPlayer('gatherer-1', 'gatherer'),
    newPlayer('gatherer-2', 'gatherer'),
    newPlayer('gatherer-3', 'gatherer'),
    newPlayer('arbitrageur', 'arbitrageur', 8_000),
    newPlayer('investor', 'investor', 40_000),
    newPlayer('flooder', 'flooder'),
  ];
  const w = createWorld(seed, players);
  for (let h = 0; h < days * 24; h++) tick(w, act);
  return w;
}

if (process.argv[1]?.endsWith('run.ts')) {
  const w = runWeek();
  mkdirSync('sim/out', { recursive: true });
  writeFileSync(
    'sim/out/run.json',
    JSON.stringify({
      history: w.history,
      events: w.events,
      merchants: w.merchants.map((m) => ({ id: m.id, name: m.name, market: m.market })),
    }),
  );
  console.log(`Simulated ${w.hour}h. ${w.events.length} events. Wrote sim/out/run.json`);
  for (const e of w.events.slice(0, 40)) console.log(`  [day ${Math.floor(e.hour / 24) + 1} ${String(e.hour % 24).padStart(2, '0')}:00] ${e.text}`);
}
