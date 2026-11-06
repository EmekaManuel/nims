/**
 * The Nims Gazette: the town's recent events (a shock, a shop closing, a fund reopening one) turned into a few
 * newspaper headlines by a model on NEAR AI Cloud.
 *
 * Like the merchant voice, it only ever rewrites facts the game already holds. A headline is kept only if every
 * number in it appears in the events we sent, it is short, and it never mentions wallets, chains or AI. If nothing
 * passes (or the model is slow, down or over budget) we return null and the page shows just the plain event list.
 * No player-typed text goes into the prompt.
 */
import { FORBIDDEN, numbersIn, type Chat } from './llm';

export interface GazetteEvent { hour: number; text: string }
export interface GazetteFacts { events: GazetteEvent[] }

export interface Gazette {
  /** One to three headlines for these events, or null (show the plain list). Never throws. */
  headlines(facts: GazetteFacts): Promise<string[] | null>;
}

const stamp = (hour: number) => `Day ${Math.floor(hour / 24) + 1}, ${String(hour % 24).padStart(2, '0')}:00`;

export function prompt(facts: GazetteFacts): { system: string; user: string } {
  const system =
    `You write the headlines for The Nims Gazette, the newspaper of a small market town. ` +
    `Write one to three headlines, one per line, each under 80 characters, in plain everyday words, with no emojis, no quotation marks and no numbering. ` +
    `Base every headline only on the events listed below. Use only numbers that appear in the events and copy them exactly. ` +
    `Never invent events, people, causes or places. Never mention wallets, blockchains, tokens, computers, AI or games.`;
  const user = facts.events.map((e) => `${stamp(e.hour)}: ${e.text}`).join('\n');
  return { system, user };
}

/** Pure: keep the lines that pass the checks. Returns up to three clean headlines, or null if none do. */
export function accept(raw: string, facts: GazetteFacts): string[] | null {
  const allowed = new Set(numbersIn(facts.events.map((e) => `${stamp(e.hour)} ${e.text}`).join(' ')));
  const out: string[] = [];
  for (const line of raw.replace(/<think>[\s\S]*?<\/think>/gi, ' ').split('\n')) {
    const t = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').replace(/^["“”']+|["“”']+$/g, '').replace(/\s+/g, ' ').trim();
    if (t.length < 12 || t.length > 100 || FORBIDDEN.test(t)) continue;
    if (numbersIn(t).some((n) => !allowed.has(n))) continue;
    out.push(t);
    if (out.length === 3) break;
  }
  return out.length ? out : null;
}

const hash = (s: string) => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return (h >>> 0).toString(36); };

export function createGazette(o: { chat: Chat; now?: () => number; ttlMs?: number }): Gazette {
  const now = o.now ?? Date.now;
  const ttl = o.ttlMs ?? 5 * 60_000;
  const cache = new Map<string, { out: string[] | null; until: number }>();
  const inflight = new Map<string, Promise<string[] | null>>();
  return {
    async headlines(facts) {
      if (!facts.events.length) return null;
      const key = hash(facts.events.map((e) => `${e.hour}:${e.text}`).join('|'));
      const hit = cache.get(key);
      if (hit && hit.until > now()) return hit.out;
      let p = inflight.get(key);
      if (!p) {
        const { system, user } = prompt(facts);
        p = o.chat.complete(system, user, { maxTokens: 220 }).then((raw) => {
          const out = raw ? accept(raw, facts) : null;
          cache.set(key, { out, until: now() + (out ? ttl : 60_000) }); // a miss is remembered briefly
          if (cache.size > 50) cache.delete(cache.keys().next().value!);
          return out;
        }).finally(() => inflight.delete(key));
        inflight.set(key, p);
      }
      return p;
    },
  };
}
