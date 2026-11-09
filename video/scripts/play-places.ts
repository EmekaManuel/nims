/**
 * Plays the "new places" story through the REAL game engine and saves the game state after each step, for the Places
 * video and the stills (src/native/Places.tsx): the road out of town hour by hour, Saltmere Harbour, Timberfell Woods
 * before and after buying land and building a shop, the flight to Gem Hollow, and Sunvale. A few other traders settle
 * the frontiers first, so the places look lived in.
 *
 *   cd video && npx tsx scripts/play-places.ts [seed]
 *
 * Writes src/data/places.json. No keys needed: nothing here calls an outside service.
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game } from '../../server/game/game';
import { transferCoins } from '../../sim/engine';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'src', 'data', 'places.json');
const seed = Number(process.argv[2] ?? 5);
const g = new Game(seed);
for (let i = 0; i < 70; i++) g.tickOnce();

const fail = (r: { ok: boolean; message: string }) => { if (!r.ok) throw new Error(r.message); return r; };
const fund = (email: string, cash: number) => { g.state(email); const p = g.playerFor(email); if (p.cash < cash) transferCoins(g.w, 'town', p, cash - p.cash); return p; };
const arrive = (email: string, realm: string) => {
  const p = g.playerFor(email);
  fail(g.travel(email, realm));
  for (let i = 0; i < 24 && p.journey; i++) g.tickOnce();
  if (g.state(email).realm.here !== realm) throw new Error(`${email} did not reach ${realm}`);
};

// Other traders get there first: a timber shop, land for sale, a gem pick shop and a wine shop.
const settler = (email: string, name: string, look: object, realm: string, plot: string, shop?: string, stock?: string) => {
  fund(email, 40_000);
  g.setAvatar(email, look);
  g.setName(email, name);
  arrive(email, realm);
  fail(g.buyLand(email, plot));
  if (!shop) return;
  fail(g.build(email, plot, shop));
  if (stock) { g.gather(email, stock as never); g.stallStock(email, stock as never, 10, `biz-${plot}`); }
};
settler('kemi.adeyemi@x.io', 'Kemi', { skin: 4, hair: 0, style: 'long', shirt: 5, hat: 'none' }, 'timberfell', 'timberfell-5', 'Kemi Timber', 'timber');
settler('bo.okafor@x.io', 'Bo', { skin: 2, hair: 3, style: 'short', shirt: 0, hat: 'cap' }, 'timberfell', 'timberfell-7');
fail(g.listLand('bo.okafor@x.io', 'timberfell-7', 4_200));
settler('tunde.bello@x.io', 'Tunde', { skin: 3, hair: 1, style: 'bald', shirt: 6, hat: 'none' }, 'gemhollow', 'gemhollow-3', 'Hollow Picks', 'gems');
settler('ngozi.eze@x.io', 'Ngozi', { skin: 5, hair: 5, style: 'long', shirt: 1, hat: 'none' }, 'sunvale', 'sunvale-4', 'Vale Wines', 'wine');
for (let i = 0; i < 6; i++) g.tickOnce();

// You.
const me = 'ada.obi@nims.game';
fund(me, 30_000);
g.setAvatar(me, { skin: 3, hair: 1, style: 'short', shirt: 4, hat: 'cap' });
g.setName(me, 'Ada');
g.chooseGoal(me, 'reach');

type Sel = { kind: string; [k: string]: unknown } | null;
interface Shot { id: string; state: unknown; selected: Sel; tab: string | null; toast?: { ok: boolean; text: string } }
const shots: Shot[] = [];
const shot = (id: string, selected: Sel = null, toast?: { ok: boolean; text: string }) => shots.push({ id, state: JSON.parse(JSON.stringify(g.state(me))), selected, tab: null, ...(toast ? { toast } : {}) });
const p = g.playerFor(me);

// 1. The town, the travel panel, and the drive to Saltmere Harbour, hour by hour.
shot('town');
shot('travel', { kind: 'road', realm: 'saltmere' });
fail(g.travel(me, 'saltmere'));
for (let i = 0; p.journey; i++) { shot(`road-${i}`); g.tickOnce(); }
shot('harbour');
shot('harbour-stall', { kind: 'stall', id: 'pike' });

// 2. Timberfell Woods: empty land, a plot, buying it, building on it.
arrive(me, 'timberfell');
shot('timberfell');
shot('timberfell-plot', { kind: 'land', id: 'timberfell-2' });
const bought = fail(g.buyLand(me, 'timberfell-2'));
shot('timberfell-bought', { kind: 'land', id: 'timberfell-2' }, { ok: true, text: bought.message });
const built = fail(g.build(me, 'timberfell-2', 'Ada Timber'));
g.gather(me, 'timber');
g.stallStock(me, 'timber', 8, 'biz-timberfell-2');
shot('timberfell-built', null, { ok: true, text: built.message });

// 3. The flight to Gem Hollow, hour by hour.
shot('fly', { kind: 'road', realm: 'gemhollow' });
fail(g.travel(me, 'gemhollow'));
for (let i = 0; p.journey; i++) { shot(`flight-${i}`); g.tickOnce(); }
shot('gemhollow');

// 4. Sunvale, for the stills.
arrive(me, 'sunvale');
shot('sunvale');

writeFileSync(out, JSON.stringify({ seed, shots }, null, 0));
console.log(`wrote ${shots.length} shots to ${out}:`, shots.map((s) => s.id).join(' '));
