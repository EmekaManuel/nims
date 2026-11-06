/**
 * Spoken merchants: turns a merchant's line into natural speech with ElevenLabs.
 *
 * The player's browser never sends text to be spoken. The server hands out an id for a line it produced itself
 * (`register`), and the audio route turns that id back into speech. So nobody can spend your ElevenLabs credits
 * on words of their own choosing. Audio is made once per line (prefetched when the line is registered), cached,
 * rate-capped and length-capped, and any failure returns null so the browser falls back to its own speech.
 */
import { createHash } from 'node:crypto';
import type { Personality } from '../../merchants/pricing';

export interface Speaker {
  /** Remember a line the server produced, start making its audio, and return an id the page can ask for. */
  register(who: { id: string; personality: Personality }, text: string): string;
  /** The MP3 for a registered id, or null (unknown id, over budget, or ElevenLabs said no). Never throws. */
  audio(id: string): Promise<Buffer | null>;
}

export interface SpeakerOptions {
  apiKey: string;
  /** merchant id -> ElevenLabs voice id. Anything missing uses `defaultVoice`. */
  voices?: Record<string, string>;
  defaultVoice?: string;
  /** A low-latency model keeps a hover feeling instant. */
  model?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxPerMinute?: number;
  maxChars?: number;
  now?: () => number;
}

export const DEFAULT_TTS_MODEL = 'eleven_flash_v2_5';
/** Stock voices, one per merchant, so the town doesn't sound like one person. Override with ELEVENLABS_VOICES. */
export const STOCK_VOICES: Record<string, string> = {
  mira: 'EXAVITQu4vr4xnSDxMaL',
  june: 'XrExE9yKIg1WjnnlVkGX',
  lena: 'Xb7hH8MSUJpSbSDYk0k2',
  ruth: 'cgSgspJ2msm6clMCkdW9',
  tomas: 'nPczCjzI2devNBz1zQrb',
  omar: 'JBFqnCBsd6RMkjVDRZzb',
  anil: 'onwK4e9ZLuTAKqWW03F9',
  diego: 'IKne3meq5aSn9XLyUdCD',
};
export const DEFAULT_VOICE = 'EXAVITQu4vr4xnSDxMaL';

/** Cautious merchants speak evenly, greedy ones with more swing. */
const STABILITY: Record<Personality, number> = { cautious: 0.7, loyal: 0.5, greedy: 0.35 };

const lru = <V>(max: number) => {
  const m = new Map<string, V>();
  return {
    get: (k: string) => { const v = m.get(k); if (v !== undefined) { m.delete(k); m.set(k, v); } return v; },
    set: (k: string, v: V) => { m.delete(k); m.set(k, v); if (m.size > max) m.delete(m.keys().next().value!); },
    delete: (k: string) => void m.delete(k),
  };
};

export function createSpeaker(o: SpeakerOptions): Speaker {
  const f = o.fetchImpl ?? fetch;
  const now = o.now ?? Date.now;
  const model = o.model ?? DEFAULT_TTS_MODEL;
  const voices = { ...STOCK_VOICES, ...(o.voices ?? {}) };
  const fallbackVoice = o.defaultVoice ?? DEFAULT_VOICE;
  const timeoutMs = o.timeoutMs ?? 8000;
  const maxPerMinute = o.maxPerMinute ?? 20;
  const maxChars = o.maxChars ?? 300;
  const lines = lru<{ id: string; personality: Personality; text: string }>(400);
  const made = lru<Promise<Buffer | null>>(150);

  const calls: number[] = [];
  const missUntil = new Map<string, number>();
  let lastWarn = 0;
  const warn = (m: string) => { if (now() - lastWarn > 60_000) { lastWarn = now(); console.warn(`[speaker] ${m}`); } };

  async function call(voice: string, text: string, personality: Personality): Promise<{ audio: Buffer | null; retryDefault: boolean }> {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const r = await f(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_64`, {
        method: 'POST',
        signal: ctl.signal,
        headers: { 'xi-api-key': o.apiKey, 'content-type': 'application/json' },
        body: JSON.stringify({ text, model_id: model, voice_settings: { stability: STABILITY[personality], similarity_boost: 0.75, style: 0, use_speaker_boost: true } }),
      });
      if (!r.ok) {
        warn(`ElevenLabs answered ${r.status}`);
        return { audio: null, retryDefault: r.status === 404 || r.status === 400 || r.status === 422 }; // a voice this account can't use
      }
      return { audio: Buffer.from(await r.arrayBuffer()), retryDefault: false };
    } catch (e) {
      warn(`call failed: ${(e as Error)?.name === 'AbortError' ? 'timed out' : (e as Error)?.message}`);
      return { audio: null, retryDefault: false };
    } finally {
      clearTimeout(timer);
    }
  }

  async function make(merchantId: string, personality: Personality, text: string): Promise<Buffer | null> {
    const t = now();
    while (calls.length && t - calls[0] > 60_000) calls.shift();
    if (calls.length >= maxPerMinute) return null; // over budget: the browser's own speech takes over
    calls.push(t);
    const first = await call(voices[merchantId] ?? fallbackVoice, text, personality);
    if (first.audio || !first.retryDefault || (voices[merchantId] ?? fallbackVoice) === fallbackVoice) return first.audio;
    return (await call(fallbackVoice, text, personality)).audio;
  }

  /** The audio for a line, started once. A miss is remembered for a minute so a failing call isn't hammered by every hover. */
  function start(id: string): Promise<Buffer | null> | null {
    const line = lines.get(id);
    if (!line) return null;
    if ((missUntil.get(id) ?? 0) > now()) return Promise.resolve(null);
    let p = made.get(id);
    if (!p) {
      p = make(line.id, line.personality, line.text).then((a) => {
        if (!a) { missUntil.set(id, now() + 60_000); made.delete(id); }
        return a;
      });
      made.set(id, p);
    }
    return p;
  }

  return {
    register(who, text) {
      const clean = text.replace(/\s+/g, ' ').trim().slice(0, maxChars);
      const id = createHash('sha1').update(`${who.id}|${who.personality}|${clean}`).digest('hex').slice(0, 20);
      lines.set(id, { id: who.id, personality: who.personality, text: clean });
      void start(id); // prefetch, so the audio is usually ready by the time the page asks
      return id;
    },
    async audio(id) {
      return (await start(id)) ?? null;
    },
  };
}
