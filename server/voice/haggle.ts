/**
 * Haggling replies: when a player haggles and wins, the merchant answers in character ("Fine, fine, you drive a hard
 * bargain...") in a line written by a model on NEAR AI Cloud.
 *
 * The game has already decided the deal; this only adds the merchant's reaction to it. The reply is kept only if every
 * number in it comes from the deal's facts, and the player sees the plain result first either way.
 */
import type { Personality } from '../../merchants/pricing';
import { acceptLine, type Chat } from './llm';

export interface HaggleFacts {
  /** Merchant id, name and personality. */
  id: string;
  merchant: string;
  personality: Personality;
  item: string;
  /** What the player did: sold goods to the merchant, or bought goods from them. */
  side: 'sold' | 'bought';
  units: number;
  /** The merchant's usual price per unit and the haggled price per unit, in coins. */
  usual: number;
  deal: number;
  /** How much better than usual the deal was for the player, in percent. */
  pct: number;
}

export interface Haggler {
  /** The merchant's reaction, or null (the plain result stands). Never throws. */
  reply(facts: HaggleFacts): Promise<string | null>;
}

const MOOD: Record<Personality, string> = {
  cautious: 'careful with money, so you give in reluctantly and warn that you cannot do this often',
  greedy: 'sharp and competitive, so you grumble that they got the better of you but admire the nerve',
  loyal: 'warm and friendly, so you are glad to do it for a regular',
};

export function prompt(f: HaggleFacts): { system: string; user: string } {
  const system =
    `You are ${f.merchant}, a trader in a small market town. You are ${MOOD[f.personality]}. ` +
    `A customer just haggled with you and you agreed. React out loud in your own voice. ` +
    `Rules: first person, one or two short sentences, under 200 characters, plain everyday words, no emojis, no quotation marks. ` +
    `Use only numbers that appear in the facts below and copy them exactly. Do not invent other details. ` +
    `Never mention wallets, blockchains, tokens, computers, AI or games.`;
  const deal = f.side === 'sold'
    ? `The customer sold you ${f.units} ${f.item}. You paid ${f.deal} coins each instead of your usual ${f.usual} coins.`
    : `The customer bought ${f.units} ${f.item} from you. You charged ${f.deal} coins each instead of your usual ${f.usual} coins.`;
  return { system, user: `${deal}\nThat is ${f.pct}% better than usual for the customer.` };
}

export function createHaggler(o: { chat: Chat }): Haggler {
  return {
    async reply(f) {
      const { system, user } = prompt(f);
      return acceptLine((await o.chat.complete(system, user, { maxTokens: 160 })) ?? '', user, 240);
    },
  };
}
