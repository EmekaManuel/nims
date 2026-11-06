import { useEffect, useState } from 'react';

/**
 * The Nims Gazette: a few newspaper headlines for the town's latest events, written by NEAR AI Cloud.
 * It is a bonus on top of the plain event list: if the server has no headlines (feature off, slow, or rejected)
 * this renders nothing, and it never delays the news list underneath.
 *
 * `latest` is the hour of the newest event; headlines are asked for again only when it changes.
 */
export function Gazette({ latest, fetchHeadlines }: { latest: number; fetchHeadlines: () => Promise<string[] | null> }) {
  const [lines, setLines] = useState<string[] | null>(null);
  useEffect(() => {
    let live = true;
    fetchHeadlines().then((h) => { if (live) setLines(h && h.length ? h : null); }).catch(() => {});
    return () => { live = false; };
  }, [latest]);
  if (!lines) return null;
  return (
    <aside className="gazette" aria-label="The Nims Gazette">
      <h3>The Nims Gazette</h3>
      <ul>{lines.map((l, i) => <li key={i}>{l}</li>)}</ul>
      <p className="by">headlines by NEAR AI</p>
    </aside>
  );
}
