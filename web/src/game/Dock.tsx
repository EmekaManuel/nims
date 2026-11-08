import { useEffect, useMemo, useRef } from 'react';

export type Tab = 'quests' | 'deals' | 'prices' | 'business' | 'news';

const ICON: Record<Tab, React.ReactNode> = {
  quests: <path d="M12 3l2.6 5.6 6.1.7-4.5 4.2 1.2 6L12 16.6 6.6 19.5l1.2-6L3.3 9.3l6.1-.7z" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  deals: <path d="M3 12l9-9h8v8l-9 9zM16 8a1.5 1.5 0 1 1 0-.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  prices: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  business: <path d="M3 9l2-5h14l2 5M4 9v11h16V9M9 20v-6h6v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />,
  news: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />,
};
const LABEL: Record<Tab, string> = { quests: 'Quests', deals: 'Deals', prices: 'Prices', business: 'My business', news: 'News' };

/** The bottom bar: big, tappable tabs that open the drawer. A badge shows unseen news. */
export function Dock({ tab, onTab, newsCount = 0, questCount = 0 }: { tab: Tab | null; onTab: (t: Tab) => void; newsCount?: number; questCount?: number }) {
  const tabs = useMemo(() => Object.keys(ICON) as Tab[], []);
  return (
    <nav className="dock" aria-label="Game menu">
      {tabs.map((t) => (
        <button key={t} className={`dockbtn ${tab === t ? 'on' : ''}`} aria-pressed={tab === t} onClick={() => onTab(t)}>
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">{ICON[t]}</svg>
          <span>{LABEL[t]}</span>
          {t === 'quests' && questCount > 0 && <i className="badge" aria-label={`${questCount} to claim`}>{questCount}</i>}
          {t === 'news' && newsCount > 0 && <i className="badge" aria-label={`${newsCount} new`}>{newsCount > 9 ? '9+' : newsCount}</i>}
        </button>
      ))}
    </nav>
  );
}

/** A burst of confetti for big moments (goal reached, rank up). Decorative. Re-key it to fire again. */
export function Confetti() {
  const pieces = useMemo(() => Array.from({ length: 36 }, (_, i) => ({
    left: (i * 29) % 100,
    delay: (i % 9) * 0.06,
    dur: 1.6 + (i % 5) * 0.25,
    drift: ((i * 37) % 60) - 30,
    color: ['#ffc21a', '#3b9dff', '#ff5d7a', '#35c46a', '#7b4de0'][i % 5],
    round: i % 3 === 0,
  })), []);
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((p, i) => (
        <span key={i} className={p.round ? 'round' : ''} style={{ left: `${p.left}%`, background: p.color, animationDelay: `${p.delay}s`, animationDuration: `${p.dur}s`, ['--drift' as string]: `${p.drift}vw` }} />
      ))}
    </div>
  );
}

/** Slide-in panel. On a phone it becomes a bottom sheet. */
export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  // A press anywhere outside the panel closes it. Things that belong to the panel but are drawn elsewhere
  // (an open dropdown, a speech bubble), the bottom bar (its tabs toggle the panel themselves) and dialogs don't count.
  useEffect(() => {
    const away = (e: PointerEvent) => {
      const t = e.target as Element | null;
      if (!t || ref.current?.contains(t)) return;
      if (t.closest('.rx-content, [data-radix-popper-content-wrapper], .bubble, .dock, [role=dialog], .toast')) return;
      close.current();
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, []);
  return (
    <aside className="drawer open" aria-label={title} ref={ref}>
      <button className="drawer-close" onClick={onClose} aria-label={`Close ${title}`}>✕</button>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}
