/**
 * Merchant voice: asks an LLM on NEAR AI Cloud to say a merchant's price reasoning in their own words.
 *
 * The economy never depends on this. Prices and numbers come from merchants/pricing.ts; the model only rewrites
 * the explanation. So the reply is accepted only if it passes three checks, otherwise we return null and the
 * game keeps showing the plain templated line:
 *   1. every number in it appears in the facts we sent (the model can't invent or change a price),
 *   2. it is short and on one line,
 *   3. it never mentions wallets, chains, tokens or AI (the player never sees the chain).
 *
 * The call is lazy (only when a player hovers a price), cached, rate-capped and time-limited, and any failure
 * returns null. No player-typed text ever goes into the prompt.
 */
import type { Personality } from '../../merchants/pricing';
import { createChat, FORBIDDEN, numbersIn, type Chat, type ChatOptions } from './llm';

export { DEFAULT_BASE_URL, DEFAULT_MODEL } from './llm';

export interface VoiceFacts {
  /** The merchant's id (mira, lena, ...), used to pick their spoken voice. */
  id: string;
  merchant: string;
  personality: Personality;
  item: string;
  /** What the merchant pays the player / charges the player, in coins. */
  pays: number;
  charges: number;
  /** The plain-English reasoning lines from pricing.ts. */
  reasons: string[];
  tooltip: string;
}

export interface Voice {
  /** The merchant's reasoning in their own words, or null (keep the templated line). Never throws. */
  say(facts: VoiceFacts): Promise<string | null>;
}

export interface VoiceOptions extends Omit<ChatOptions, 'apiKey'> {
  apiKey?: string;
  /** Share one model connection (and its rate budget) with other features. When given, the connection options above are ignored. */
  chat?: Chat;
  /** How long an answer is reused. A changed price or reason makes a new key anyway. */
  ttlMs?: number;
}

const TEMPER: Record<Personality, string> = {
  cautious: 'careful with money and a little worried about risk',
  greedy: 'sharp and always chasing a good deal',
  loyal: 'warm, and you remember your regulars',
};

/** Pure: the text is usable only if it passes the checks above. Returns the cleaned text, or null. */
export function accept(raw: string, facts: VoiceFacts): string | null {
  let t = raw.replace(/<think>[\s\S]*?<\/think>/gi, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^["“”']+|["“”']+$/g, '').trim();
  if (t.length < 12 || t.length > 260) return null;
  if (FORBIDDEN.test(t)) return null;
  const allowed = new Set(numbersIn([facts.tooltip, ...facts.reasons, String(facts.pays), String(facts.charges)].join(' ')));
  for (const n of numbersIn(t)) if (!allowed.has(n)) return null;
  return t;
}

export function prompt(facts: VoiceFacts): { system: string; user: string } {
  const system =
    `You are ${facts.merchant}, a trader in a small market town. You are ${TEMPER[facts.personality]}. ` +
    `A customer hovered over your price and asked why it is what it is. Answer out loud, in your own voice. ` +
    `Rules: first person, one or two short sentences, under 220 characters, plain everyday words, no emojis, no quotation marks. ` +
    `Use only numbers that appear in the facts below and copy them exactly. ` +
    `Say why the price is what it is, using only the reasons listed in the facts. Do not invent other causes, such as buyers, shortages or events that are not listed. `+
    `Never mention wallets, blockchains, tokens, computers, AI or games.`;
  const user = [
    `Item: ${facts.item}`,
    `I pay the customer: ${facts.pays} coins`,
    `I charge the customer: ${facts.charges} coins`,
    `Why:`,
    ...facts.reasons.map((r) => `- ${r}`),
  ].join('\n');
  return { system, user };
}

const hash = (s: string) => {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

export function createVoice(o: VoiceOptions): Voice {
  const now = o.now ?? Date.now;
  const chat = o.chat ?? createChat({ ...o, apiKey: o.apiKey ?? '' });
  const ttl = o.ttlMs ?? 10 * 60_000;
  const cache = new Map<string, { text: string | null; until: number }>();
  const inflight = new Map<string, Promise<string | null>>();

  async function ask(facts: VoiceFacts): Promise<string | null> {
    const { system, user } = prompt(facts);
    return accept((await chat.complete(system, user)) ?? '', facts);
  }

  return {
    async say(facts) {
      const key = `${facts.merchant}|${facts.item}|${facts.pays}|${facts.charges}|${hash(facts.reasons.join('|'))}`;
      const hit = cache.get(key);
      if (hit && hit.until > now()) return hit.text;
      let p = inflight.get(key);
      if (!p) {
        p = ask(facts).then((text) => {
          // A failure is remembered briefly so a flaky call isn't hammered by every hover.
          cache.set(key, { text, until: now() + (text ? ttl : 60_000) });
          if (cache.size > 500) cache.delete(cache.keys().next().value!);
          return text;
        }).finally(() => inflight.delete(key));
        inflight.set(key, p);
      }
      return p;
    },
  };
}
