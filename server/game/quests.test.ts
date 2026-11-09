import { describe, it, expect } from 'vitest';
import { Game } from './game';
import { activeQuests, claim, claimDaily, DAILY, dailyOffer, newQuestState, QUESTS, record } from './quests';

const DAY = 86_400_000;
const at = (iso: string) => Date.parse(iso);

describe('quests on their own', () => {
  it('a new player is on the first starter quest, and the next unlocks only when it is claimed', () => {
    const s = newQuestState();
    expect(activeQuests(s).map((q) => q.id)).toEqual(['first-haul']);
    expect(record(s, { kind: 'collect', item: 'iron', units: 8 }).map((q) => q.id)).toEqual(['first-haul']);
    expect(activeQuests(s).map((q) => q.id)).toEqual(['first-haul']); // complete, not yet claimed
    expect(claim(s, 'first-haul')).toMatchObject({ reward: 100 });
    expect(activeQuests(s).map((q) => q.id)).toEqual(['first-sale']);
  });

  it('counts units for sales, and only counts haggled sales for the bargain quest', () => {
    const s = newQuestState();
    s.claimed.push('first-haul');
    record(s, { kind: 'sell', item: 'iron', units: 3, market: 'scrap', haggled: false });
    expect(s.progress['first-sale']).toEqual([3]);
    record(s, { kind: 'sell', item: 'iron', units: 3, market: 'scrap', haggled: false });
    expect(s.progress['first-sale']).toEqual([5]); // capped at the target
    claim(s, 'first-sale');
    record(s, { kind: 'sell', item: 'iron', units: 4, market: 'scrap', haggled: false });
    expect(s.progress['strike-bargain']).toEqual([0]);
    record(s, { kind: 'sell', item: 'iron', units: 4, market: 'scrap', haggled: true });
    expect(s.progress['strike-bargain']).toEqual([1]);
  });

  it('counts different markets, not sales, for the two-markets quest', () => {
    const s = newQuestState();
    s.claimed.push('first-haul', 'first-sale', 'strike-bargain');
    record(s, { kind: 'sell', item: 'iron', units: 5, market: 'scrap', haggled: false });
    record(s, { kind: 'sell', item: 'iron', units: 5, market: 'scrap', haggled: false });
    expect(s.progress['two-markets']).toEqual([1]);
    record(s, { kind: 'sell', item: 'cotton', units: 1, market: 'fabric', haggled: false });
    expect(s.progress['two-markets']).toEqual([2]);
  });

  it('refuses to pay twice, or before the quest is done', () => {
    const s = newQuestState();
    expect(claim(s, 'first-haul')).toEqual({ error: 'Finish the quest first.' });
    record(s, { kind: 'collect', item: 'iron', units: 1 });
    claim(s, 'first-haul');
    expect(claim(s, 'first-haul')).toEqual({ error: 'You already claimed that.' });
    expect(claim(s, 'your-say')).toEqual({ error: 'That quest is not open.' });
  });

  it('the starter rewards stay small next to the 10,000-coin goal', () => {
    expect(QUESTS.filter((q) => q.chain === 'starter').reduce((n, q) => n + q.reward, 0)).toBeLessThanOrEqual(1_500);
  });
});

describe('daily rewards', () => {
  it('grows each day in a row, holds at the cap, and starts again after a missed day', () => {
    const s = newQuestState();
    let t = at('2026-11-10T09:00:00Z');
    const got: number[] = [];
    for (let d = 0; d < 9; d++) { const r = claimDaily(s, t); got.push('reward' in r ? r.reward : -1); t += DAY; }
    expect(got).toEqual([...DAILY, DAILY[6], DAILY[6]]);
    t += DAY; // missed a day
    expect(claimDaily(s, t)).toMatchObject({ reward: DAILY[0], day: 1 });
  });

  it('once a day: a second claim the same day is refused, and the next day is offered', () => {
    const s = newQuestState();
    const t = at('2026-11-10T23:30:00Z');
    claimDaily(s, t);
    expect(claimDaily(s, t + 10 * 60_000)).toMatchObject({ error: expect.stringMatching(/tomorrow/) });
    expect(dailyOffer(s, t + 60 * 60_000)).toMatchObject({ ready: true, day: 2, reward: DAILY[1] }); // past midnight UTC
  });
});

describe('quests in the game', () => {
  const me = 'ada.obi@example.com';

  it('playing completes quests, the news says so, and claiming pays through the ledger', () => {
    const g = new Game(5);
    g.state(me);
    const p = g.w.players[g.w.players.length - 1];
    const before = p.cash;
    expect(g.state(me).quests.active[0]).toMatchObject({ id: 'first-haul', complete: false, reward: 100 });
    expect(g.gather(me, 'tomatoes').ok).toBe(true);
    expect(g.state(me).quests.active[0]).toMatchObject({ id: 'first-haul', complete: true });
    expect(p.notes.at(-1)!.text).toMatch(/Quest complete: Your first haul/);
    const afterGather = p.cash;
    expect(g.claimQuest(me, 'first-haul')).toMatchObject({ ok: true });
    expect(p.cash).toBe(afterGather + 100);
    expect(g.state(me).quests.active[0].id).toBe('first-sale');
    expect(g.state(me).quests.starter).toEqual({ done: 1, total: 6 });
    expect(before).toBeGreaterThan(0);
    // every coin a quest paid is a mint from the town in the ledger
    expect(g.w.ledger.some((l) => l.kind === 'mint' && l.to === p.id && l.item === 'coins' && l.units === 100)).toBe(true);
  });

  it('a sale and a haggle move the next quests along', () => {
    const g = new Game(5);
    g.state(me);
    g.gather(me, 'tomatoes');
    g.claimQuest(me, 'first-haul');
    g.sell(me, 'mira', 'tomatoes', 5);
    expect(g.claimQuest(me, 'first-sale')).toMatchObject({ ok: true });
    g.gather(me, 'tomatoes');
    g.sell(me, 'tomas', 'tomatoes', 2, true);
    expect(g.state(me).quests.active[0]).toMatchObject({ id: 'strike-bargain', complete: true });
  });

  it('the daily reward pays once a day, and quests and streaks survive a save', () => {
    const g = new Game(5);
    g.clock = () => at('2026-11-10T12:00:00Z');
    g.state(me);
    expect(g.state(me).quests.daily).toMatchObject({ ready: true, day: 1, reward: DAILY[0] });
    expect(g.claimDailyReward(me)).toMatchObject({ ok: true });
    expect(g.claimDailyReward(me)).toMatchObject({ ok: false });
    g.gather(me, 'tomatoes');
    const back = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    back.clock = () => at('2026-11-11T08:00:00Z');
    expect(back.state(me).quests.daily).toMatchObject({ ready: true, day: 2, reward: DAILY[1] });
    expect(back.state(me).quests.active[0]).toMatchObject({ id: 'first-haul', complete: true });
  });
});
