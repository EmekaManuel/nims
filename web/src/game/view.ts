/**
 * Which map a player sees first: the 3D town where it will work well, the 2D map where it might not. Their own choice (the 2D/3D button,
 * remembered in this browser) always wins over this default.
 */
export interface ViewEnv {
  /** What the player chose last time: '1' for 3D, '0' for 2D, null if they never chose. */
  stored: string | null;
  /** A screen at least 1000 px wide (the layout with the side drawer, and room for the town). */
  wide: boolean;
  /** A mouse or trackpad, not a phone or tablet held in the hand. */
  finePointer: boolean;
  reducedMotion: boolean;
  /** The browser can draw WebGL. */
  webgl: boolean;
  /** An earlier visit found the 3D town running slowly here, so the default is 2D (a choice of their own still wins). */
  slow?: boolean;
  /** A phone-sized screen (700 px or narrower): always the flat map, whatever was chosen before; the 3D town is too heavy and too small to play there. */
  phone?: boolean;
}

export function chooseView(e: ViewEnv): boolean {
  if (e.phone) return false;
  if (e.stored === '0') return false;
  if (e.stored === '1') return e.webgl; // they asked for 3D, but without WebGL it cannot be shown
  if (e.slow) return false;
  return e.webgl && e.wide && e.finePointer && !e.reducedMotion;
}

let glCache: boolean | undefined;
/** Whether this browser can create a WebGL context (asked once). */
export function webglAvailable(): boolean {
  if (glCache !== undefined) return glCache;
  try {
    const canvas = document.createElement('canvas');
    const gl = (canvas.getContext('webgl2') ?? canvas.getContext('webgl')) as WebGLRenderingContext | null;
    glCache = !!gl;
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // give the context back: the town makes its own
  } catch {
    glCache = false;
  }
  return glCache;
}

/** Remember that the 3D town ran slowly on this machine, so the next visit starts in 2D without watching again. */
export const SLOW_KEY = 'nims-3d-slow';

/** The view to start in, and whether the game chose it (true) or the player did with the button (false: it is never second-guessed). */
export function readViewChoice(): { view3d: boolean; auto: boolean } {
  let stored: string | null = null;
  let slow = false;
  try { stored = localStorage.getItem('nims-3d'); slow = localStorage.getItem(SLOW_KEY) === '1'; } catch { /* storage blocked: no stored choice */ }
  const media = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  const phone = media('(max-width: 700px)');
  const wide = media('(min-width: 1000px)');
  const finePointer = media('(pointer: fine)');
  const reducedMotion = media('(prefers-reduced-motion: reduce)');
  // only ask for WebGL when the answer can matter
  const needsGl = !phone && (stored === '1' || (stored !== '0' && !slow && wide && finePointer && !reducedMotion));
  return { view3d: chooseView({ phone, stored, wide, finePointer, reducedMotion, slow, webgl: needsGl ? webglAvailable() : false }), auto: stored === null };
}

/** The view to start in, from this browser. */
export const readView = () => readViewChoice().view3d;
