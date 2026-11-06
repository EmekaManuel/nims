/**
 * One shared door to NEAR AI Cloud (an OpenAI-compatible chat API), used by every feature that lets a model write
 * words for the game (merchant voice, the town gazette). One door means one rate budget, so credits can't run
 * away however many features are on, and one place that handles timeouts and failures.
 *
 * `complete` never throws: any failure returns null and the caller keeps its plain, templated text.
 */
export interface Chat {
  complete(system: string, user: string, opts?: { maxTokens?: number }): Promise<string | null>;
}

export interface ChatOptions {
  apiKey: string;
  model?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Hard cap on model calls per minute across everything, so credits can't run away. */
  maxPerMinute?: number;
  now?: () => number;
}

export const DEFAULT_MODEL = 'google/gemini-3.1-flash-lite'; // fast, non-reasoning: ~1 s, and its replies pass the number check (checked live)
export const DEFAULT_BASE_URL = 'https://cloud-api.near.ai/v1';

/** Words the player must never read: the chain, wallets and the fact that a model wrote this. */
export const FORBIDDEN = /\b(wallet|seed phrase|private key|gas|blockchain|on-?chain|crypto|tokens?|near protocol|smart contract|ai|llm|language model|assistant|chatbot)\b/i;

export const numbersIn = (s: string) => (s.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''));

export function createChat(o: ChatOptions): Chat {
  const f = o.fetchImpl ?? fetch;
  const now = o.now ?? Date.now;
  const model = o.model ?? DEFAULT_MODEL;
  const base = (o.baseUrl ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
  const timeoutMs = o.timeoutMs ?? 6000;
  const maxPerMinute = o.maxPerMinute ?? 20;
  const calls: number[] = [];
  let lastWarn = 0;
  const warn = (m: string) => { if (now() - lastWarn > 60_000) { lastWarn = now(); console.warn(`[ai] ${m}`); } };

  return {
    async complete(system, user, opts) {
      const t = now();
      while (calls.length && t - calls[0] > 60_000) calls.shift();
      if (calls.length >= maxPerMinute) return null; // over budget: the caller keeps its plain text
      calls.push(t);
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await f(`${base}/chat/completions`, {
          method: 'POST',
          signal: ctl.signal,
          headers: { 'content-type': 'application/json', authorization: `Bearer ${o.apiKey}` },
          body: JSON.stringify({ model, temperature: 0.7, max_tokens: opts?.maxTokens ?? 200, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] }),
        });
        if (!r.ok) { warn(`NEAR AI answered ${r.status}`); return null; }
        const j = (await r.json()) as { choices?: { message?: { content?: string } }[] };
        return j.choices?.[0]?.message?.content ?? null;
      } catch (e) {
        warn(`call failed: ${(e as Error)?.name === 'AbortError' ? 'timed out' : (e as Error)?.message}`);
        return null;
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

/**
 * Clean up a model's reply and keep it only if it is safe to show: one short line, every number in it taken from
 * `facts` (the text the model was given), and none of the forbidden words. Returns null otherwise.
 */
export function acceptLine(raw: string, facts: string, max = 260): string | null {
  let t = raw.replace(/<think>[\s\S]*?<\/think>/gi, ' ').replace(/\s+/g, ' ').trim();
  t = t.replace(/^["“”']+|["“”']+$/g, '').trim();
  if (t.length < 12 || t.length > max || FORBIDDEN.test(t)) return null;
  const allowed = new Set(numbersIn(facts));
  return numbersIn(t).every((n) => allowed.has(n)) ? t : null;
}
