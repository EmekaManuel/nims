/**
 * Spoken merchants, using the browser's own speech (no files, no key, no cost). Each merchant gets a steady
 * voice of their own (picked from the voices installed on this device, by name), and their personality sets
 * the pace and pitch. It follows the same mute switch as the sound effects, and never throws.
 */
import { soundOn } from './sfx';

export type Tone = 'cautious' | 'greedy' | 'loyal';

const PROFILE: Record<Tone, { rate: number; pitch: number }> = {
  cautious: { rate: 0.93, pitch: 0.92 },
  greedy: { rate: 1.1, pitch: 1.05 },
  loyal: { rate: 1, pitch: 1.15 },
};

const synth = (): SpeechSynthesis | null => {
  try { return typeof window !== 'undefined' && 'speechSynthesis' in window ? window.speechSynthesis : null; } catch { return null; }
};

export const canSpeak = (): boolean => synth() !== null && typeof SpeechSynthesisUtterance !== 'undefined';

const hash = (s: string) => { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0; return h; };

/** The same merchant always gets the same voice. Prefers English voices, and ones installed on the device (they start faster). */
export function pickVoice(who: string, voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const en = voices.filter((v) => v.lang?.toLowerCase().startsWith('en'));
  const pool = en.filter((v) => v.localService).length >= 3 ? en.filter((v) => v.localService) : en;
  return pool.length ? pool[hash(who) % pool.length] : undefined;
}

/** Say `text` as this merchant, replacing anything already being said. Does nothing if sound is muted or unsupported. */
export function speak(text: string, who: string, tone: Tone = 'loyal'): void {
  const s = synth();
  if (!s || !canSpeak() || !soundOn() || !text) return;
  try {
    s.cancel();
    const u = new SpeechSynthesisUtterance(text);
    const p = PROFILE[tone];
    u.rate = p.rate;
    u.pitch = p.pitch;
    u.volume = 0.95;
    u.lang = 'en';
    const v = pickVoice(who, s.getVoices());
    if (v) { u.voice = v; u.lang = v.lang; }
    s.speak(u);
  } catch { /* speech must never break the game */ }
}

/** Stop talking (the tooltip closed). */
export function stopSpeaking(): void {
  try { synth()?.cancel(); } catch { /* ignore */ }
}
