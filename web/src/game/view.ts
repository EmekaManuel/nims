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
}

export function chooseView(e: ViewEnv): boolean {
  if (e.stored === '0') return false;
  if (e.stored === '1') return e.webgl; // they asked for 3D, but without WebGL it cannot be shown
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

/** The view to start in, from this browser. */
export function readView(): boolean {
  let stored: string | null = null;
  try { stored = localStorage.getItem('nims-3d'); } catch { /* storage blocked: no stored choice */ }
  const media = (q: string) => typeof matchMedia === 'function' && matchMedia(q).matches;
  const wide = media('(min-width: 1000px)');
  const finePointer = media('(pointer: fine)');
  const reducedMotion = media('(prefers-reduced-motion: reduce)');
  // only ask for WebGL when the answer can matter
  const needsGl = stored === '1' || (stored !== '0' && wide && finePointer && !reducedMotion);
  return chooseView({ stored, wide, finePointer, reducedMotion, webgl: needsGl ? webglAvailable() : false });
}
