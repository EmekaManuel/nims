/** The elements the video's cursor and camera point at. Each finds one element on the real screen (or null if it isn't there). */
const all = <T extends HTMLElement>(sel: string) => [...document.querySelectorAll<T>(sel)];
const withText = (sel: string, test: (t: string) => boolean) => all(sel).find((e) => test((e.textContent ?? '').replace(/\s+/g, ' ').trim())) ?? null;

export const FINDERS: Record<string, () => HTMLElement | null> = {
  'dock:deals': () => withText('.dock button', (t) => t === 'Deals'),
  'dock:news': () => withText('.dock button', (t) => t.startsWith('News')),
  'map:cotton': () => document.querySelector<HTMLElement>('.map g.source[aria-label^="Wholesaler"]') ?? document.querySelector<HTMLElement>('.map g.source[aria-label*="cotton"]'),
  'map:lena': () => document.querySelector<HTMLElement>('.map g.stall[aria-label^="Lena"]'),
  'btn:collect': () => withText('button', (t) => t.startsWith('Collect')),
  'price:lena:cotton': () => document.querySelector<HTMLElement>('[data-demo="lena:cotton"]'),
  'check:haggle': () => document.querySelector<HTMLElement>('label[for="haggle"], #haggle')?.closest('label') ?? document.querySelector<HTMLElement>('#haggle'),
  'btn:sell:cotton': () => {
    const row = all('tr').find((r) => /cotton/i.test(r.textContent ?? ''));
    return row ? withText('button', (t) => t === 'Sell') && ([...row.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === 'Sell') ?? null) : null;
  },
  'btn:scavenge': () => withText('button', (t) => t === 'Search the scrap heap'),
  'btn:take': () => withText('button', (t) => t === 'Take this job'),
  'btn:deliver': () => withText('button', (t) => t.startsWith('Deliver to')),
  'tab:jobs': () => withText('[role=tab]', (t) => t.startsWith('Odd jobs')),
  'drawer': () => document.querySelector<HTMLElement>('.drawer'),
  'toast': () => document.querySelector<HTMLElement>('.toast'),
  'bubble': () => document.querySelector<HTMLElement>('[role=tooltip]'),
  'hud:cash': () => document.querySelector<HTMLElement>('.pill.coin'),
  'gazette': () => document.querySelector<HTMLElement>('.gazette'),
  'jobs:list': () => document.querySelector<HTMLElement>('.jobs'),
  'hand:card': () => document.querySelector<HTMLElement>('.hand'),
};

export const measureAll = () => {
  const out: Record<string, { x: number; y: number; w: number; h: number }> = {};
  for (const [name, find] of Object.entries(FINDERS)) {
    const el = find();
    if (!el) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) out[name] = { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
  }
  return out;
};
