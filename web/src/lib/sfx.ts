/**
 * Tiny synthesised sound effects (no audio files). Browsers only allow sound after a click or tap, and
 * every sound here follows one, so it just works. A mute switch is remembered between visits.
 */
type Ctx = AudioContext;
let ctx: Ctx | null = null;

export const soundOn = (): boolean => {
  try { return localStorage.getItem('nims-sound') !== 'off'; } catch { return true; }
};
export const setSound = (on: boolean) => {
  try { localStorage.setItem('nims-sound', on ? 'on' : 'off'); } catch { /* private mode: fine */ }
};

function audio(): Ctx | null {
  if (!soundOn()) return null;
  try {
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext
      ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx ??= new AC();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, type: OscillatorType = 'sine', vol = 0.06) {
  const c = audio();
  if (!c) return;
  try {
    const o = c.createOscillator();
    const g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, c.currentTime + start);
    g.gain.setValueAtTime(0.0001, c.currentTime + start);
    g.gain.exponentialRampToValueAtTime(vol, c.currentTime + start + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
    o.connect(g).connect(c.destination);
    o.start(c.currentTime + start);
    o.stop(c.currentTime + start + dur + 0.02);
  } catch { /* never let a sound break the game */ }
}

export const sfx = {
  /** Money in: a bright two-note "ka-ching". */
  coin: () => { tone(988, 0, 0.09, 'triangle'); tone(1319, 0.08, 0.18, 'triangle'); },
  /** A small pick-up or purchase. */
  pop: () => tone(520, 0, 0.08, 'sine', 0.07),
  /** Something didn't work. */
  error: () => { tone(220, 0, 0.12, 'square', 0.035); tone(165, 0.1, 0.16, 'square', 0.035); },
  /** Goal reached or rank up: a rising arpeggio. */
  win: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.09, 0.22, 'triangle', 0.06)),
};
