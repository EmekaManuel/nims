import { Mascot } from '../art/Mascot';

/** Full-screen loading: the mascot hops on a shadow while coins drop past it. No box, centred in the window. */
export function Loading({ label = 'Opening the market' }: { label?: string }) {
  return (
    <div className="loading" role="status" aria-live="polite">
      <div className="loading-stage" aria-hidden="true">
        <span className="coin c1" />
        <span className="coin c2" />
        <span className="coin c3" />
        <div className="hop"><Mascot size={96} mood="cheer" /></div>
        <span className="ground" />
      </div>
      <p className="loading-label">{label}<span className="dots" aria-hidden="true"><i>.</i><i>.</i><i>.</i></span></p>
      <span className="loading-bar" aria-hidden="true"><i /></span>
    </div>
  );
}
