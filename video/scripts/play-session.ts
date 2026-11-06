/**
 * Plays the demo story through the REAL game engine and saves what the video needs:
 * the full game state after each step, the merchants' lines written by NEAR AI Cloud, the gazette headlines,
 * and the merchants' spoken lines made by ElevenLabs. Nothing here is mocked: the numbers come from the same
 * Game class the live server runs, and the words come from the same voice/haggle/gazette code.
 *
 *   cd video && npx tsx --env-file=../.env scripts/play-session.ts [seed]
 *
 * Needs NEAR_AI_API_KEY and ELEVENLABS_API_KEY in ../.env. Writes src/data/session.json and public/live/*.mp3.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { Game } from '../../server/game/game';
import { transferCoins } from '../../sim/engine';
import { createChat } from '../../server/voice/llm';
import { createVoice } from '../../server/voice/voice';
import { createHaggler } from '../../server/voice/haggle';
import { createGazette } from '../../server/voice/gazette';
import { createSpeaker } from '../../server/voice/speaker';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'src', 'data', 'session.json');
const liveDir = join(here, '..', 'public', 'live');
mkdirSync(liveDir, { recursive: true });

const need = (k: string) => { const v = process.env[k]?.trim().split(/\s+/)[0]; if (!v) throw new Error(`${k} is not set in ../.env`); return v; };
const chat = createChat({ apiKey: need('NEAR_AI_API_KEY'), maxPerMinute: 100, timeoutMs: 20000 });
const voice = createVoice({ chat });
const haggler = createHaggler({ chat });
const gazette = createGazette({ chat });
const speaker = createSpeaker({ apiKey: need('ELEVENLABS_API_KEY'), maxPerMinute: 100 });

const seed = Number(process.argv[2] ?? 7);
const me = 'demo@nims.game';
const g = new Game(seed);
for (let i = 0; i < 70; i++) g.tickOnce(); // let the town settle first, as in any live game
g.state(me);
g.chooseGoal(me, 'fortune');

type Sel = { kind: 'stall'; id: string } | { kind: 'source'; item: string } | null;
interface Shot { id: string; state: unknown; selected: Sel; tab: string | null; toast?: { ok: boolean; text: string; line?: string }; hover?: string; voiceText?: string; audio?: string; gazette?: string[] }
const shots: Shot[] = [];
const snap = () => JSON.parse(JSON.stringify(g.state(me)));
const shot = (id: string, selected: Sel, tab: string | null, extra: Partial<Shot> = {}) => { shots.push({ id, state: snap(), selected, tab, ...extra }); };

/** Make the merchant's line into speech and save it as a clip. Returns the clip path (relative to public/). */
async function clip(name: string, who: { id: string; personality: 'cautious' | 'greedy' | 'loyal' }, text: string) {
  const mp3 = await speaker.audio(speaker.register(who, text));
  if (!mp3) throw new Error(`ElevenLabs gave no audio for ${name}`);
  writeFileSync(join(liveDir, `${name}.mp3`), mp3);
  return `live/${name}.mp3`;
}

// 1. The town, and the cotton wholesaler.
shot('town', null, null);
shot('wholesaler', { kind: 'source', item: 'cotton' }, null);
const got = g.gather(me, 'cotton');
if (!got.ok) throw new Error(got.message);
shot('collected', { kind: 'source', item: 'cotton' }, null, { toast: { ok: true, text: got.message } });

// 2. A stall, and the merchant explaining a price in their own words.
const facts = g.voiceFacts(me, 'lena', 'cotton');
if (!facts) throw new Error('no voice facts for lena/cotton');
const said = await voice.say(facts);
if (!said) throw new Error('NEAR AI gave no usable merchant line (it was rejected or failed)');
const lena = g.w.merchants.find((m) => m.id === 'lena')!;
const lenaClip = await clip('lena-price', { id: 'lena', personality: lena.personality }, said);
shot('stall', { kind: 'stall', id: 'lena' }, null);
shot('hover', { kind: 'stall', id: 'lena' }, null, { hover: 'lena:cotton', voiceText: said, audio: lenaClip });

// 3. Sell with a haggle, and the merchant's reaction.
const sale = g.sell(me, 'lena', 'cotton', 5, true);
if (!sale.ok || !sale.haggled) throw new Error(`sale/haggle failed: ${sale.message}`);
shot('sold', { kind: 'stall', id: 'lena' }, null, { toast: { ok: true, text: sale.message } });
const hf = g.haggleFacts(me)!;
const reaction = await haggler.reply(hf);
if (!reaction) throw new Error('NEAR AI gave no usable haggle reaction');
const hClip = await clip('haggle-reaction', { id: hf.id, personality: hf.personality }, reaction);
shot('reaction', { kind: 'stall', id: 'lena' }, null, { toast: { ok: true, text: sale.message, line: `${hf.merchant}: “${reaction}”` }, audio: hClip });

// 4. Run out of coins, and the way back. (Staged: the player's coins are moved through the ledger like any payment.)
const p = g.playerFor(me);
if (p.cash > 5) transferCoins(g.w, p, 'town', p.cash - 5);
shot('broke', null, 'deals');
const scrap = g.scavenge(me);
if (!scrap.ok) throw new Error(scrap.message);
shot('scrap', null, 'deals', { toast: { ok: true, text: scrap.message } });
// the iron is sold at a stall in the real game; here we hand it back so the player is free to take a job
const iron = g.sell(me, 'anil', 'iron', 1);
if (!iron.ok) throw new Error(iron.message);
transferCoins(g.w, p, 'town', Math.max(0, p.cash - 40));
for (let i = 0; i < 2; i++) g.tickOnce();
const board = (g.state(me) as unknown as { jobs: { board: { id: number; item: string; to: { id: string } }[] } }).jobs.board;
const pick = board.find((j) => j.item === 'tomatoes' || j.item === 'cotton') ?? board[0];
if (!pick) throw new Error('no job on the board');
shot('jobs', null, 'deals');
const took = g.takeJob(me, pick.id);
if (!took.ok) throw new Error(took.message);
shot('job-taken', null, 'deals', { toast: { ok: true, text: took.message } });
const done = g.deliverJob(me);
if (!done.ok) throw new Error(done.message);
shot('job-done', null, 'deals', { toast: { ok: true, text: done.message } });

// 5. The town's news, with headlines.
for (let i = 0; i < 30; i++) g.tickOnce();
const heads = await gazette.headlines(g.gazetteFacts());
if (!heads) throw new Error('NEAR AI gave no usable gazette headlines');
shot('news', null, 'news', { gazette: heads });

writeFileSync(out, JSON.stringify({ seed, me, shots }, null, 1));
const s = (id: string) => shots.find((x) => x.id === id)!.state as { you: { cash: number; carrying: number; netWorth: number } };
console.log(`wrote ${shots.length} shots, ${(JSON.stringify(shots).length / 1024).toFixed(0)} KB`);
console.log(`cash: start ${s('town').you.cash} -> collected ${s('collected').you.cash} -> sold ${s('sold').you.cash} -> broke ${s('broke').you.cash} -> job done ${s('job-done').you.cash}`);
console.log('hover line :', said);
console.log('haggle line:', reaction);
console.log('gazette    :', heads.join(' | '));
console.log('sale       :', sale.message);
console.log('job        :', took.message.slice(0, 110));
