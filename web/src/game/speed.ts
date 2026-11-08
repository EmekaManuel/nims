import { useEffect } from 'react';

/**
 * Is the 3D town running smoothly on this machine? Feed it the time of each animation frame; once it has watched long enough it says
 * 'slow' (under about 22 frames a second) or 'fine'. It ignores the first moments (the graphics card is still compiling the town's shaders)
 * and any long stall (a hidden tab, a laptop going to sleep), which are not the town's fault, and it judges by the median frame so a few
 * hitches do not count.
 */
export class SpeedCheck {
  private start?: number;
  private last = 0;
  private windowStart?: number;
  private samples: number[] = [];

  constructor(private o = { warmupMs: 1500, windowMs: 4000, stallMs: 1500, slowFps: 22 }) {}

  tick(now: number): 'slow' | 'fine' | undefined {
    if (this.start === undefined) { this.start = now; this.last = now; return undefined; }
    const dt = now - this.last;
    this.last = now;
    if (now - this.start < this.o.warmupMs) return undefined;
    if (dt > this.o.stallMs) { this.samples = []; this.windowStart = undefined; return undefined; } // a stall: start the window again
    if (this.windowStart === undefined) { this.windowStart = now; return undefined; }
    this.samples.push(dt);
    if (now - this.windowStart < this.o.windowMs) return undefined;
    const sorted = [...this.samples].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    return median > 1000 / this.o.slowFps ? 'slow' : 'fine';
  }
}

/** While `active`, watch the animation frames; call `onSlow` once if the town turns out to run slowly here. */
export function useSpeedCheck(active: boolean, onSlow: () => void) {
  useEffect(() => {
    if (!active) return;
    const check = new SpeedCheck();
    let raf = 0;
    const loop = (t: number) => {
      const verdict = check.tick(t);
      if (verdict === 'slow') return onSlow();
      if (verdict === 'fine') return;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);
}
