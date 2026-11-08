// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { Map3DBoundary } from './Map3DBoundary';
import { chooseView, readView, readViewChoice, SLOW_KEY, type ViewEnv } from './view';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear(); });

const desktop: ViewEnv = { stored: null, wide: true, finePointer: true, reducedMotion: false, webgl: true };

describe('which map a player starts in', () => {
  it('is the 3D town on a desktop with WebGL', () => {
    expect(chooseView(desktop)).toBe(true);
  });

  it('is the 2D map on a phone or tablet, a small window, with reduced motion, or without WebGL', () => {
    expect(chooseView({ ...desktop, wide: false })).toBe(false);
    expect(chooseView({ ...desktop, finePointer: false })).toBe(false);
    expect(chooseView({ ...desktop, reducedMotion: true })).toBe(false);
    expect(chooseView({ ...desktop, webgl: false })).toBe(false);
  });

  it("their own choice wins: a stored 2D beats a desktop default, and a stored 3D beats a phone default", () => {
    expect(chooseView({ ...desktop, stored: '0' })).toBe(false);
    expect(chooseView({ ...desktop, stored: '1', wide: false, finePointer: false })).toBe(true);
  });

  it('but 3D cannot be shown without WebGL, whatever they chose', () => {
    expect(chooseView({ ...desktop, stored: '1', webgl: false })).toBe(false);
  });

  it('reads the browser: in a plain test browser (no WebGL, no media queries) it starts in 2D, and never asks for WebGL it cannot use', () => {
    const canvas = vi.spyOn(document, 'createElement');
    expect(readView()).toBe(false);
    expect(canvas).not.toHaveBeenCalledWith('canvas');
  });

  it('starts in 2D once an earlier visit found 3D slow here, unless the player has chosen 3D themselves', () => {
    expect(chooseView({ ...desktop, slow: true })).toBe(false);
    expect(chooseView({ ...desktop, slow: true, stored: '1' })).toBe(true);
  });

  it('says whether the game chose the view (so it may check the speed) or the player did (so it never second-guesses)', () => {
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: !q.includes('reduce'), media: q }));
    const canvas = { getContext: () => ({ getExtension: () => null }) };
    const real = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => (tag === 'canvas' ? (canvas as unknown as HTMLElement) : real(tag)));
    expect(readViewChoice()).toEqual({ view3d: true, auto: true });
    localStorage.setItem('nims-3d', '1');
    expect(readViewChoice()).toEqual({ view3d: true, auto: false });
    localStorage.clear();
    localStorage.setItem(SLOW_KEY, '1');
    expect(readViewChoice()).toEqual({ view3d: false, auto: true }); // found slow before: 2D, and nothing left to watch
  });

  it('reads a remembered choice from this browser', () => {
    localStorage.setItem('nims-3d', '0');
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: true, media: q }));
    expect(readView()).toBe(false); // wide, mouse, no reduced motion would say 3D, but they chose 2D
  });
});

describe('the safety net around the 3D town', () => {
  const Boom = () => { throw new Error('no graphics'); };

  it('shows the 2D map instead when the 3D town breaks, and says so', () => {
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const onFail = vi.fn();
    render(<Map3DBoundary fallback={<p>the flat map</p>} onFail={onFail}><Boom /></Map3DBoundary>);
    expect(screen.getByText('the flat map')).toBeTruthy();
    expect(onFail).toHaveBeenCalledTimes(1);
    quiet.mockRestore();
  });

  it('shows the 3D town as normal when nothing is wrong', () => {
    render(<Map3DBoundary fallback={<p>the flat map</p>}><p>the 3D town</p></Map3DBoundary>);
    expect(screen.getByText('the 3D town')).toBeTruthy();
    expect(screen.queryByText('the flat map')).toBeNull();
  });
});
