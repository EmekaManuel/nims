// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import { SpeedCheck, useSpeedCheck } from './speed';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** Run a check over frames that arrive every `dt` ms (a number, or a function of the frame's number) until it decides, or `limitMs` passes. */
function run(dt: number | ((i: number) => number), limitMs = 20_000) {
  const check = new SpeedCheck();
  let t = 1000;
  for (let i = 0; t - 1000 < limitMs; i++) {
    t += typeof dt === 'function' ? dt(i) : dt;
    const v = check.tick(t);
    if (v) return { verdict: v, at: t - 1000 };
  }
  return { verdict: undefined, at: limitMs };
}

describe('is the 3D town running smoothly?', () => {
  it('says fine at 60 and at 30 frames a second, in about five and a half seconds', () => {
    for (const dt of [16.7, 33.3]) {
      const r = run(dt);
      expect(r.verdict).toBe('fine');
      expect(r.at).toBeLessThan(6500);
    }
  });

  it('says slow at 15 frames a second, and much slower', () => {
    expect(run(66).verdict).toBe('slow');
    expect(run(250).verdict).toBe('slow');
  });

  it('the line is about 22 frames a second', () => {
    expect(run(1000 / 25).verdict).toBe('fine');
    expect(run(1000 / 18).verdict).toBe('slow');
  });

  it('ignores a slow start: the graphics card compiling shaders is not the town running badly', () => {
    // the first second and a half is crawling, then it is smooth
    let t = 0;
    expect(run((i) => { t += 0; return i < 8 ? 190 : 16.7; }).verdict).toBe('fine');
  });

  it('ignores a few hitches among smooth frames: it judges the typical frame, not the worst', () => {
    expect(run((i) => (i % 20 === 0 ? 220 : 16.7)).verdict).toBe('fine');
  });

  it('does not count a stall (a hidden tab, a laptop asleep) against the town, and starts watching again after it', () => {
    // smooth, then a ten-second gap in the middle of the window, then smooth: still fine, not slow
    const r = run((i) => (i === 330 ? 10_000 : 16.7), 40_000);
    expect(r.verdict).toBe('fine');
  });

  it('says nothing until it has watched long enough', () => {
    const check = new SpeedCheck();
    let t = 0;
    const verdicts: unknown[] = [];
    for (let i = 0; i < 200; i++) { t += 16.7; verdicts.push(check.tick(t)); } // 3.3 s: warm-up plus under two seconds of watching
    expect(verdicts.every((v) => v === undefined)).toBe(true);
  });
});

describe('watching while the game runs', () => {
  /** A hand-driven animation-frame clock. */
  function clock() {
    let next = 1;
    const queue = new Map<number, FrameRequestCallback>();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => { queue.set(next, cb); return next++; });
    vi.stubGlobal('cancelAnimationFrame', (id: number) => { queue.delete(id); });
    let now = 0;
    return {
      frames(n: number, dt: number) {
        for (let i = 0; i < n; i++) {
          now += dt;
          const batch = [...queue.entries()];
          queue.clear();
          act(() => batch.forEach(([, cb]) => cb(now)));
        }
      },
      pending: () => queue.size,
    };
  }
  const Probe = ({ active, onSlow }: { active: boolean; onSlow: () => void }) => { useSpeedCheck(active, onSlow); return null; };

  it('calls back once when the frames are slow', () => {
    const c = clock();
    const onSlow = vi.fn();
    render(<Probe active onSlow={onSlow} />);
    c.frames(150, 70);
    expect(onSlow).toHaveBeenCalledTimes(1);
    c.frames(50, 70);
    expect(onSlow).toHaveBeenCalledTimes(1);
    expect(c.pending()).toBe(0); // and it stops watching
  });

  it('stays quiet, and stops watching, when the frames are smooth', () => {
    const c = clock();
    const onSlow = vi.fn();
    render(<Probe active onSlow={onSlow} />);
    c.frames(500, 16.7);
    expect(onSlow).not.toHaveBeenCalled();
    expect(c.pending()).toBe(0);
  });

  it('does not watch at all when it is not active (the player chose their view), and stops if it is switched off', () => {
    const c = clock();
    const onSlow = vi.fn();
    const { rerender } = render(<Probe active={false} onSlow={onSlow} />);
    expect(c.pending()).toBe(0);
    rerender(<Probe active onSlow={onSlow} />);
    expect(c.pending()).toBe(1);
    rerender(<Probe active={false} onSlow={onSlow} />);
    expect(c.pending()).toBe(0);
  });
});
