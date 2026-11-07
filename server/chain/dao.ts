/**
 * A public record of the town council on SputnikDAO.
 *
 * The council votes happen in the game, weighted by shares. Each one is also written to a SputnikDAO on
 * testnet: a Vote proposal is added when the vote opens, and the DAO's council account approves or rejects
 * it when the vote closes, so anyone can read the decisions on chain. The DAO is a record, not the
 * counter: the game stays the authority, and nothing about gameplay waits on or depends on this file.
 * Player names are never written; only the market, the rule and the tally.
 *
 * It is idempotent and retried: sweep() looks at the game's own state each time, so a failed call is simply
 * tried again on the next sweep, and a restart picks up where it left off.
 */
import { MARKETS } from '../../sim/world';
import type { Game } from '../game/game';
import { connect } from './chain';
import type { OutLayerClient } from './outlayer';

export type DaoAction = 'VoteApprove' | 'VoteReject';

/** What the recorder needs from the chain. The real one is nearDao(); tests use a fake. */
export interface DaoPort {
  addProposal(description: string): Promise<number>;
  act(id: number, action: DaoAction): Promise<void>;
}

const GAS = 100_000_000_000_000n; // 100 Tgas
const BOND = 1_000_000_000_000_000_000_000_000n; // the DAO's proposal bond: 1 NEAR, returned when the proposal is settled

/** The real DAO, called by the server's own account, which must be on the DAO's council. Testnet only. */
export function nearDao(daoId: string): DaoPort {
  if (!daoId.endsWith('.testnet')) throw new Error('Refusing to run: Nims only talks to NEAR testnet DAOs.');
  const { account } = connect();
  return {
    async addProposal(description) {
      const id = await account.callFunction<number>({
        contractId: daoId,
        methodName: 'add_proposal',
        args: { proposal: { description, kind: 'Vote' } },
        gas: GAS,
        deposit: BOND,
      });
      return Number(id);
    },
    async act(id, action) {
      await account.callFunction({ contractId: daoId, methodName: 'act_proposal', args: { id, action }, gas: GAS });
    },
  };
}

/** Read-only views of a DAO, used to find the id of a proposal just added through OutLayer (whose reply does not carry it). */
export interface DaoViews {
  lastProposalId(): Promise<number>;
  proposal(id: number): Promise<{ description: string } | null>;
}

export function nearDaoViews(daoId: string): DaoViews {
  const { account } = connect();
  return {
    async lastProposalId() { return Number(await account.provider.callFunction({ contractId: daoId, method: 'get_last_proposal_id', args: {} })); },
    async proposal(id) { return (await account.provider.callFunction<{ description: string }>({ contractId: daoId, method: 'get_proposal', args: { id } })) ?? null; },
  };
}

/**
 * The same DAO, called by the Town Clerk: an agent whose wallet is custodied by OutLayer. The server holds no key that can
 * sign for it, and the wallet's own policy (set by its owner in the OutLayer dashboard) can limit it to this DAO and a spending cap.
 * add_proposal's reply carries no id, so it is read back from the DAO and checked against what was written.
 */
export function clerkDao(o: { clerk: OutLayerClient; daoId: string; views: DaoViews }): DaoPort {
  return {
    async addProposal(description) {
      await o.clerk.call(o.daoId, 'add_proposal', { proposal: { description, kind: 'Vote' } }, BOND.toString());
      const next = await o.views.lastProposalId();
      for (let id = next - 1; id >= Math.max(0, next - 5); id--) {
        if ((await o.views.proposal(id))?.description === description) return id;
      }
      throw new Error('The proposal was sent but could not be found on the DAO yet.');
    },
    async act(id, action) {
      await o.clerk.call(o.daoId, 'act_proposal', { id, action }, '0');
    },
  };
}

const rule = (lever: string) => (lever === 'rent' ? 'stall rent' : 'profit payout');

export class CouncilRecorder {
  private busy = false;
  private fails = 0;
  private retryAt = 0;

  constructor(private o: { game: Game; dao: DaoPort; log?: (m: string) => void; now?: () => number }) {}

  /** Record whatever has not been recorded yet. Safe to call on a timer; one sweep at a time, and it never throws. */
  async sweep(): Promise<void> {
    const now = (this.o.now ?? Date.now)();
    if (this.busy || now < this.retryAt) return;
    this.busy = true;
    try {
      await this.opened();
      await this.closed();
      this.fails = 0;
    } catch (e) {
      // Back off (30 s, 1 min, 2 min ... up to 15 min), or as long as the service asked, so a down chain or a rate limit is not hammered.
      this.fails++;
      const asked = (e as { retryAfter?: number }).retryAfter;
      const wait = asked ? asked * 1000 : Math.min(15 * 60_000, 30_000 * 2 ** (this.fails - 1));
      this.retryAt = now + wait;
      this.o.log?.(`DAO record will retry in ${Math.round(wait / 1000)} s: ${(e as Error).message}`);
    } finally {
      this.busy = false;
    }
  }

  /** Votes that are open now but not on the DAO yet. */
  private async opened() {
    const w = this.o.game.w;
    for (const [market, c] of Object.entries(w.council)) {
      const pr = c.proposal;
      if (!pr || pr.daoId !== undefined) continue;
      const mk = MARKETS[market as keyof typeof MARKETS].name;
      pr.daoId = await this.o.dao.addProposal(`Nims ${mk} council: set ${rule(pr.lever)} to ${pr.to}. A shareholder vote, counted in the game, closes at in-game hour ${pr.closesHour}.`);
      this.o.log?.(`${mk}: vote on ${rule(pr.lever)} is DAO proposal ${pr.daoId}.`);
    }
  }

  /** Votes that have ended and not been settled on the DAO yet. */
  private async closed() {
    const w = this.o.game.w;
    for (const e of w.events) {
      const d = e.decision;
      if (e.type !== 'council' || !d || d.recorded) continue;
      // The vote may have opened and closed before it was recorded (the chain was down): add it now.
      if (d.daoId === undefined) {
        d.daoId = await this.o.dao.addProposal(`Nims ${MARKETS[d.market].name} council: set ${rule(d.lever)} to ${d.to}. Decided in the game.`);
      }
      await this.o.dao.act(d.daoId, d.passed ? 'VoteApprove' : 'VoteReject');
      d.recorded = true;
      this.o.log?.(`${MARKETS[d.market].name}: DAO proposal ${d.daoId} ${d.passed ? 'approved' : 'rejected'} (${d.yes} for, ${d.no} against).`);
    }
  }
}
