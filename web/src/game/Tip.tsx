import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { VoiceReply } from '../api';
import { playClip, speak, stopSpeaking, type Tone } from '../lib/speech';

const W = 336; // bubble width in px, shrinks on a narrow screen
const GAP = 12;
const MARGIN = 12;

/**
 * Hover, focus or tap a price and the merchant answers in their own words, in a speech bubble.
 * `who` is the stall's name; `text` is the reasoning from pricing.ts. `voice` (optional) asks the server for the same
 * reasoning in the merchant's own words; if it fails or is slow the plain `text` simply stays.
 *
 * The bubble is drawn in a portal with fixed positioning, so a scrolling panel or a screen edge can never cut it off:
 * it sits under the price, slides sideways to stay on screen, and flips above the price if there is no room below.
 */
export function Tip({ who, text, voice, tone, children }: { who: string; text: string; voice?: () => Promise<VoiceReply | null>; tone?: Tone; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  // The explanation is frozen at the moment the bubble opens. Prices move every tick, and a bubble that rewrote itself
  // (or restarted the speech) while you read it would be unreadable.
  const [snap, setSnap] = useState(text);
  const show = () => { setSnap(text); setOpen(true); };
  // The merchant's reasoning in their own words, when the server can supply it. The plain `text` shows at once; this swaps in if it arrives.
  const [said, setSaid] = useState<string | null>(null);
  const [audio, setAudio] = useState<string | null>(null);
  const asked = useRef<string | null>(null);
  // True once we know the final words (the voice answered, or said nothing), so we speak once, never the plain line first.
  const [settled, setSettled] = useState(false);
  const [pos, setPos] = useState<{ left: number; top?: number; bottom?: number; arrow: number; above: boolean; width: number } | null>(null);
  const id = useId();
  const anchor = useRef<HTMLSpanElement>(null);
  const bubble = useRef<HTMLSpanElement>(null);

  const place = () => {
    const a = anchor.current;
    if (!a) return;
    const r = a.getBoundingClientRect();
    const width = Math.min(W, window.innerWidth - MARGIN * 2);
    const left = Math.min(Math.max(MARGIN, r.left + r.width / 2 - 28), window.innerWidth - width - MARGIN);
    const arrow = Math.min(Math.max(16, r.left + r.width / 2 - left - 6), width - 28);
    const h = bubble.current?.offsetHeight ?? 150;
    const roomBelow = window.innerHeight - r.bottom - GAP - MARGIN;
    const above = roomBelow < h && r.top - GAP - MARGIN > roomBelow;
    setPos(above ? { left, bottom: window.innerHeight - r.top + GAP, arrow, above, width } : { left, top: r.bottom + GAP, arrow, above, width });
  };

  useLayoutEffect(() => { if (open) place(); }, [open, snap, said]);
  useEffect(() => { setSaid(null); setAudio(null); setSettled(false); asked.current = null; }, [snap]);
  useEffect(() => {
    if (!open || !voice || asked.current === snap) return;
    asked.current = snap;
    // Not cancelled on close: the answer is kept, so coming back to this price is instant and can speak at once.
    voice().then((r) => { if (asked.current === snap) { if (r?.text) setSaid(r.text); if (r?.audio) setAudio(r.audio); setSettled(true); } }).catch(() => { if (asked.current === snap) setSettled(true); });
  }, [open, snap]);
  // Say the words on screen out loud (when sound is on): at once if there is no voice to wait for, else when it has settled.
  // Natural speech from the server if there is a clip; the browser's own voice if there isn't, or the clip fails to play.
  useEffect(() => {
    if (!open) return;
    if (voice && !settled) return;
    const line = said ?? snap;
    if (audio) {
      const stop = playClip(audio, () => speak(line, who, tone));
      return () => { stop(); stopSpeaking(); };
    }
    speak(line, who, tone);
    return stopSpeaking;
  }, [open, snap, said, audio, settled]);
  useEffect(() => {
    if (!open) return;
    // Scrolling or resizing moves the price out from under a fixed bubble: just close it.
    const close = () => setOpen(false);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
  }, [open]);

  return (
    <span
      ref={anchor}
      className="tipwrap"
      tabIndex={0}
      aria-describedby={open ? id : undefined}
      onMouseEnter={show}
      onMouseLeave={() => setOpen(false)}
      onFocus={show}
      onBlur={() => setOpen(false)}
      onClick={() => (open ? setOpen(false) : show())}
    >
      {children}
      {open && createPortal(
        <span
          ref={bubble}
          role="tooltip"
          id={id}
          className={`bubble${pos?.above ? ' above' : ''}`}
          style={{ left: pos?.left ?? 0, top: pos?.top, bottom: pos?.bottom, width: pos?.width, visibility: pos ? 'visible' : 'hidden', ['--arrow' as string]: `${pos?.arrow ?? 18}px` }}
        >
          <span className="who">{who} says</span>
          “{said ?? snap}”
          {said && <span className="by">voice by NEAR AI</span>}
        </span>,
        document.body,
      )}
    </span>
  );
}
