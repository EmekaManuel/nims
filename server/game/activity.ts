/**
 * What real people have been doing in the town, for the public numbers on the sign-in screen and at /stats.
 *
 * Counts only, in real time (a game day is four real minutes, so "today" means the last 24 real hours). It keeps
 * the opaque player ids of whoever was active in each real hour so a person is counted once, never an email or a
 * name. Simulated traders and the merchants themselves are not counted: only actions a signed-in person took.
 */
const HOUR = 3_600_000;
const KEEP_HOURS = 24;

interface Bucket {
  /** Real hour number: Math.floor(ms / HOUR). */
  hour: number;
  trades: number;
  votes: number;
  players: string[];
}

export interface ActivityTotals {
  trades: number;
  votes: number;
  decisions: number;
  passed: number;
}

export type ActivityJSON = { buckets: Bucket[]; totals: ActivityTotals; since: number };

export class Activity {
  private buckets: Bucket[] = [];
  totals: ActivityTotals = { trades: 0, votes: 0, decisions: 0, passed: 0 };
  /** When counting began (ms). */
  since: number;

  constructor(private now: () => number = Date.now) {
    this.since = now();
  }

  private current(): Bucket {
    const hour = Math.floor(this.now() / HOUR);
    let b = this.buckets[this.buckets.length - 1];
    if (!b || b.hour !== hour) {
      b = { hour, trades: 0, votes: 0, players: [] };
      this.buckets.push(b);
    }
    this.buckets = this.buckets.filter((x) => x.hour > hour - KEEP_HOURS);
    return b;
  }

  /** A signed-in person looked at the town. */
  seen(playerId: string) {
    const b = this.current();
    if (!b.players.includes(playerId)) b.players.push(playerId);
  }

  /** A signed-in person bought or sold goods, or shares. */
  trade(playerId: string) {
    this.seen(playerId);
    this.current().trades++;
    this.totals.trades++;
  }

  /** A signed-in person proposed or voted in a town council. */
  vote(playerId: string) {
    this.seen(playerId);
    this.current().votes++;
    this.totals.votes++;
  }

  /** A council vote closed. */
  decision(passed: boolean) {
    this.totals.decisions++;
    if (passed) this.totals.passed++;
  }

  /** The last 24 real hours, and the totals since counting began. */
  summary() {
    const hour = Math.floor(this.now() / HOUR);
    const recent = this.buckets.filter((b) => b.hour > hour - KEEP_HOURS);
    const players = new Set(recent.flatMap((b) => b.players));
    return {
      last24h: {
        players: players.size,
        trades: recent.reduce((n, b) => n + b.trades, 0),
        votes: recent.reduce((n, b) => n + b.votes, 0),
      },
      total: { ...this.totals },
      since: new Date(this.since).toISOString(),
    };
  }

  toJSON(): ActivityJSON {
    return { buckets: this.buckets, totals: this.totals, since: this.since };
  }

  /** Rebuild from toJSON(); a save from before this existed starts counting from now. */
  static from(j: Partial<ActivityJSON> | undefined, now: () => number = Date.now): Activity {
    const a = new Activity(now);
    if (!j) return a;
    a.buckets = Array.isArray(j.buckets) ? j.buckets : [];
    a.totals = { trades: 0, votes: 0, decisions: 0, passed: 0, ...(j.totals ?? {}) };
    if (typeof j.since === 'number') a.since = j.since;
    return a;
  }
}
