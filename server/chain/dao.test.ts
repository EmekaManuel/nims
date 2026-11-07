import { describe, expect, it } from 'vitest';
import { Game } from '../game/game';
import { CouncilRecorder, clerkDao, type DaoAction, type DaoPort } from './dao';
import { OutLayerError, type OutLayerClient } from './outlayer';

const me = 'ada@example.com';
function fakeDao(opts: { fail?: () => boolean } = {}) {
  const calls: { kind: 'add' | 'act'; text?: string; id?: number; action?: DaoAction }[] = [];
  let next = 7;
  const dao: DaoPort = {
    async addProposal(text) { if (opts.fail?.()) throw new Error('rpc down'); calls.push({ kind: 'add', text }); return next++; },
    async act(id, action) { if (opts.fail?.()) throw new Error('rpc down'); calls.push({ kind: 'act', id, action }); },
  };
  return { dao, calls };
}
function gameWithVote() {
  const g = new Game(5);
  g.state(me);
  g.w.players[g.w.players.length - 1].cash = 500_000;
  g.buyShares(me, 'omar', 30);
  g.councilPropose(me, 'fabric', 'rent', 'low');
  return g;
}
const toClose = (g: Game) => { for (let i = 0; i < 48 && g.w.council.fabric.proposal; i++) g.tickOnce(); };

describe('DAO record of the council', () => {
  it('adds a proposal when a vote opens, and approves it when the vote passes', async () => {
    const g = gameWithVote();
    const { dao, calls } = fakeDao();
    const rec = new CouncilRecorder({ game: g, dao });
    await rec.sweep();
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ kind: 'add', text: expect.stringContaining('Fabric Market council: set stall rent to low') });
    expect(g.w.council.fabric.proposal!.daoId).toBe(7);

    await rec.sweep(); // nothing new: no duplicate proposal
    expect(calls).toHaveLength(1);

    toClose(g);
    expect(g.w.council.fabric.rent).toBe('low');
    await rec.sweep();
    expect(calls[1]).toEqual({ kind: 'act', id: 7, action: 'VoteApprove' });
    await rec.sweep(); // settled once only
    expect(calls).toHaveLength(2);
  });

  it('rejects the DAO proposal when the vote fails', async () => {
    const g = new Game(5);
    g.state(me);
    g.w.players[g.w.players.length - 1].cash = 500_000;
    g.buyShares(me, 'omar', 3);
    g.councilPropose(me, 'fabric', 'rent', 'high'); // merchants oppose, and outweigh 3 shares
    const { dao, calls } = fakeDao();
    const rec = new CouncilRecorder({ game: g, dao });
    await rec.sweep();
    toClose(g);
    await rec.sweep();
    expect(g.w.council.fabric.rent).toBe('normal');
    expect(calls.at(-1)).toMatchObject({ kind: 'act', action: 'VoteReject' });
  });

  it('never writes a player name on chain', async () => {
    const g = gameWithVote();
    const { dao, calls } = fakeDao();
    await new CouncilRecorder({ game: g, dao }).sweep();
    expect(JSON.stringify(calls)).not.toMatch(/ada|example\.com/i);
  });

  it('a failing chain never throws into the game, and the next sweep catches up', async () => {
    const g = gameWithVote();
    let down = true;
    const { dao, calls } = fakeDao({ fail: () => down });
    const logs: string[] = [];
    let clock = 0;
    const rec = new CouncilRecorder({ game: g, dao, log: (m) => logs.push(m), now: () => clock });
    await expect(rec.sweep()).resolves.toBeUndefined();
    clock += 31_000; // past the first back-off
    expect(calls).toHaveLength(0);
    expect(logs.some((l) => /will retry/.test(l))).toBe(true);
    expect(g.w.council.fabric.proposal!.daoId).toBeUndefined();

    toClose(g); // the vote opens and closes while the chain is down
    down = false;
    await rec.sweep();
    expect(calls.map((c) => c.kind)).toEqual(['add', 'act']); // recorded in one go
    expect(calls[1]).toMatchObject({ action: 'VoteApprove' });
  });

  it('the record survives a save and restart without being repeated', async () => {
    const g = gameWithVote();
    const { dao, calls } = fakeDao();
    await new CouncilRecorder({ game: g, dao }).sweep();
    const again = Game.restore(JSON.parse(JSON.stringify(g.snapshot())));
    await new CouncilRecorder({ game: again, dao }).sweep();
    expect(calls).toHaveLength(1);
    expect(again.w.council.fabric.proposal!.daoId).toBe(7);
  });
});

describe('backing off', () => {
  it('waits longer after each failure, and as long as a rate limit asks', async () => {
    const g = gameWithVote();
    let clock = 0;
    let n = 0;
    let err: Error = new Error('rpc down');
    const dao: DaoPort = { async addProposal() { n++; throw err; }, async act() {} };
    const rec = new CouncilRecorder({ game: g, dao, now: () => clock });
    await rec.sweep(); expect(n).toBe(1);
    clock += 10_000; await rec.sweep(); expect(n).toBe(1); // still backing off
    clock += 21_000; await rec.sweep(); expect(n).toBe(2); // 31 s: tried again, now waits 60 s
    clock += 59_000; await rec.sweep(); expect(n).toBe(2);
    clock += 2_000; err = new OutLayerError('slow down', 429, 'operation_limit_reached', 300); await rec.sweep(); expect(n).toBe(3);
    clock += 299_000; await rec.sweep(); expect(n).toBe(3); // told to wait 300 s
    clock += 2_000; await rec.sweep(); expect(n).toBe(4);
  });
});

describe('the Town Clerk (OutLayer-custodied)', () => {
  function clerk() {
    const sent: { to: string; method: string; args: unknown; deposit: string }[] = [];
    const client = { async call(to: string, method: string, args: unknown, deposit = '0') { sent.push({ to, method, args, deposit }); return {}; } } as unknown as OutLayerClient;
    return { client, sent };
  }
  it('adds a proposal with the DAO bond, finds its id, and acts with no deposit', async () => {
    const { client, sent } = clerk();
    const stored: string[] = ['older proposal', 'older proposal 2'];
    const dao = clerkDao({
      clerk: client, daoId: 'council.testnet',
      views: { async lastProposalId() { return stored.length; }, async proposal(id) { return stored[id] ? { description: stored[id] } : null; } },
    });
    // the DAO stores the proposal once the call goes through
    const origCall = client.call.bind(client);
    (client as unknown as { call: typeof origCall }).call = async (to, method, args, deposit) => {
      if (method === 'add_proposal') stored.push((args as { proposal: { description: string } }).proposal.description);
      return origCall(to, method, args, deposit);
    };
    const id = await dao.addProposal('Fabric Market council: set stall rent to low');
    expect(id).toBe(2);
    expect(sent[0]).toMatchObject({ to: 'council.testnet', method: 'add_proposal', deposit: '1000000000000000000000000', args: { proposal: { kind: 'Vote' } } });
    await dao.act(2, 'VoteApprove');
    expect(sent[1]).toEqual({ to: 'council.testnet', method: 'act_proposal', args: { id: 2, action: 'VoteApprove' }, deposit: '0' });
  });

  it('refuses to guess an id it cannot confirm', async () => {
    const { client } = clerk();
    const dao = clerkDao({ clerk: client, daoId: 'c.testnet', views: { async lastProposalId() { return 3; }, async proposal() { return { description: 'someone else' }; } } });
    await expect(dao.addProposal('mine')).rejects.toThrow(/could not be found/);
  });
});
