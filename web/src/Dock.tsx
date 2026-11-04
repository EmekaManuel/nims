import { useMemo } from 'react';

export type Tab = 'deals' | 'prices' | 'business' | 'news';

const ICON: Record<Tab, React.ReactNode> = {
  deals: <path d="M3 12l9-9h8v8l-9 9zM16 8a1.5 1.5 0 1 1 0-.01" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />,
  prices: <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />,
  business: <path d="M3 9l2-5h14l2 5M4 9v11h16V9M9 20v-6h6v6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />,
  news: <path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4zM10 21a2 2 0 0 0 4 0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />,
};
const LABEL: Record<Tab, string> = { deals: 'Deals', prices: 'Prices', business: 'My business', news: 'News' };

/** The bottom bar: big, tappable tabs that open the drawer. A badge shows unseen news. */
export function Dock({ tab, onTab, newsCount = 0 }: { tab: Tab | null; onTab: (t: Tab) => void; newsCount?: number }) {
  const tabs = useMemo(() => Object.keys(ICON) as Tab[], []);
  return (
    <nav className="dock" aria-label="Game menu">
      {tabs.map((t) => (
        <button key={t} className={`dockbtn ${tab === t ? 'on' : ''}`} aria-pressed={tab === t} onClick={() => onTab(t)}>
          <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">{ICON[t]}</svg>
          <span>{LABEL[t]}</span>
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
  return (
    <aside className="drawer open" aria-label={title}>
      <button className="drawer-close" onClick={onClose} aria-label={`Close ${title}`}>✕</button>
      <div className="drawer-body">{children}</div>
    </aside>
  );
}
