/**
 * Merchant agents: once each in-game day every merchant decides its own plan, through NEAR AI Cloud.
 *
 * The merchant is told its real situation (cash, stock against its usual stock, what players bought and sold from it
 * recently, today's prices against the usual ones, any shock, its market's council rules) and answers with words, not
 * numbers: for each good, hold more, less or the same; and price with a wider, narrower or the same margin; plus one
 * sentence on why. sim/plan.ts turns those words into small, bounded adjustments, so a merchant can steer its business
 * but never break the economy.
 *
 * The game never waits for this and never depends on it. A reply is used only if it parses and every choice is one of
 * the allowed words for goods the merchant really trades; anything else is ignored and the merchant keeps its plan. The
 * reason is shown only if every number in it comes from the facts and it avoids the forbidden words; otherwise a plain
 * reason built from the choices is shown instead. No player-typed text ever goes into the prompt.
 */
import type { Personality } from '../../merchants/pricing';
import { describePlan, type MarginChoice, type StockChoice } from '../../sim/plan';
import type { Item } from '../../sim/world';
import { acceptLine, type Chat } from '../voice/llm';

export interface PlanFacts {
  id: string;
  merchant: string;
  personality: Personality;
  market: string;
  day: number;
  cash: number;
  /** Below this the merchant stops buying from players. */
  cashFloor: number;
  items: { item: Item; stock: number; usualStock: number; boughtByPlayers: number; soldByPlayers: number; price: number; usualPrice: number }[];
  /** Shocks happening now, in words. */
  shocks: string[];
  rent: string;
  payout: string;
}

export interface ChosenPlan {
  stock: Partial<Record<Item, StockChoice>>;
  margin: MarginChoice;
  reason: string;
  /** Whether the reason is the merchant's own words (true) or the plain one built from the choices. */
  ownWords: boolean;
}

const TEMPER: Record<Personality, string> = {
  cautious: 'careful with money; you would rather keep cash than risk it',
  greedy: 'sharp and always chasing a bigger profit',
  loyal: 'steady, and you look after your regular customers',
};

/** The facts as the plain text the model reads (and the reason's numbers are checked against). */
export function factsText(f: PlanFacts): string {
  const lines = [
    `You are ${f.merchant}, a merchant in the ${f.market}. Day ${f.day}.`,
    `Cash: ${f.cash} coins. Below ${f.cashFloor} coins you stop buying from traders.`,
    ...f.items.map((i) => `${i.item}: you hold ${i.stock}, usually ${i.usualStock}. In the last day traders bought ${i.boughtByPlayers} from you and sold you ${i.soldByPlayers}. Price now ${i.price} coins, usually ${i.usualPrice}.`),
    f.shocks.length ? `Happening now: ${f.shocks.join('; ')}.` : 'Nothing unusual is happening in town.',
    `Your market's council rules: stall rent ${f.rent}, profit payout ${f.payout}.`,
  ];
  return lines.join('\n');
}

export function planPrompt(f: PlanFacts): { system: string; user: string } {
  const goods = f.items.map((i) => `"${i.item}"`).join(', ');
  return {
    system:
      `You run a market stall in a small trading town. You are ${TEMPER[f.personality]}. ` +
      'Each morning you decide how to run your business today. Answer with JSON only, no other text, in exactly this shape: ' +
      '{"stock": {"<good>": "more" | "less" | "same"}, "margin": "wider" | "narrower" | "same", "reason": "<one sentence>"}. ' +
      '"more" means you keep more of that good on your shelves (prices of it rise less when traders buy); "less" means you keep less. ' +
      '"wider" margin earns more on each sale, but traders take their goods to other stalls; "narrower" earns less on each sale but brings more traders to you. ' +
      'You can only ever buy and sell your own goods, listed below; other markets\' goods are not yours to trade. ' +
      'The reason is one short first-person sentence (under 140 characters) about your situation, using only numbers from the facts. ' +
      'Never mention computers, games, blockchains, wallets or tokens.',
    user: `${factsText(f)}\nYour goods: ${goods}. What is your plan for today?`,
  };
}

const STOCK: readonly StockChoice[] = ['more', 'less', 'same'];
const MARGIN: readonly MarginChoice[] = ['wider', 'narrower', 'same'];

/** Pure: the model's reply as a plan, or null if it is not a usable plan. */
export function parsePlan(raw: string | null, f: PlanFacts): ChosenPlan | null {
  if (!raw) return null;
  const text = raw.replace(/<think>[\s\S]*?<\/think>/gi, ' ').replace(/```(?:json)?/gi, ' ');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  let j: { stock?: Record<string, unknown>; margin?: unknown; reason?: unknown };
  try {
    j = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!j || typeof j !== 'object' || !MARGIN.includes(j.margin as MarginChoice) || !j.stock || typeof j.stock !== 'object') return null;
  const stock: Partial<Record<Item, StockChoice>> = {};
  for (const { item } of f.items) {
    const c = String((j.stock as Record<string, unknown>)[item] ?? 'same').toLowerCase();
    if (!STOCK.includes(c as StockChoice)) return null;
    if (c !== 'same') stock[item] = c as StockChoice;
  }
  const margin = j.margin as MarginChoice;
  const own = typeof j.reason === 'string' ? acceptLine(j.reason, factsText(f), 160) : null;
  return { stock, margin, reason: own ?? describePlan(stock, margin), ownWords: own !== null };
}

/** What the planner needs from the game. */
export interface PlannerGame {
  merchantsToPlan(): string[];
  planFacts(merchantId: string): PlanFacts | null;
  applyPlan(merchantId: string, plan: ChosenPlan): void;
}

/**
 * Plans one merchant per step (the next one whose plan is older than today). Steps never overlap and never throw.
 * Returns what happened, for logs and tests.
 */
export function createPlanner(o: { chat: Chat; game: PlannerGame; log?: (m: string) => void }) {
  let busy = false;
  let next = 0;
  return {
    async step(): Promise<'planned' | 'kept' | 'idle' | 'busy'> {
      if (busy) return 'busy';
      const due = o.game.merchantsToPlan();
      if (!due.length) return 'idle';
      busy = true;
      try {
        const id = due[next++ % due.length];
        const f = o.game.planFacts(id);
        if (!f) return 'idle';
        const p = planPrompt(f);
        const plan = parsePlan(await o.chat.complete(p.system, p.user, { maxTokens: 220 }), f);
        if (!plan) return 'kept';
        o.game.applyPlan(id, plan);
        return 'planned';
      } catch (e) {
        o.log?.(`Merchant plan failed: ${(e as Error).message}`);
        return 'kept';
      } finally {
        busy = false;
      }
    },
  };
}
