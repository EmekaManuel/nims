import { useState } from 'react';
import { AvatarFigure, DEFAULT_AVATAR, HAIR, SHIRTS, SKIN, STYLES, type Avatar } from '../art/avatar';
import { TextField } from '../ui';

/**
 * Create your trader: a look (skin, hair, hairstyle, shirt, cap) and the name others see. Shown when a player first
 * arrives, and again from My business to change it. `onSave` gets the look, and the name if one was typed.
 */
export function AvatarCreator({ initial, name, first, onSave, onClose }: {
  initial: Avatar | null;
  name: string;
  /** First visit: a welcome, and no way to skip without saving (a default look is offered). */
  first?: boolean;
  onSave: (a: Avatar, name: string | null) => void;
  onClose?: () => void;
}) {
  const [a, setA] = useState<Avatar>(initial ?? DEFAULT_AVATAR);
  // An initial ("N.") is a placeholder, not a name to edit: start blank so the player types their own.
  const [typed, setTyped] = useState(name.endsWith('.') ? '' : name);
  const set = <K extends keyof Avatar>(k: K, v: Avatar[K]) => setA((x) => ({ ...x, [k]: v }));
  const nameOk = typed.trim().length === 0 || typed.trim().length >= 2;
  return (
    <div className="scrim">
      <div className="modal creator" role="dialog" aria-modal="true" aria-labelledby="creator-h">
        <h2 id="creator-h">{first ? 'Create your trader' : 'Your look'}</h2>
        {first && <p className="muted">This is how other traders will see you in town and on the town board.</p>}
        <div className="creator-body">
          <div className="creator-preview"><AvatarFigure a={a} size={150} title="Your trader" /></div>
          <div className="creator-picks">
            <Swatches label="Skin" colors={SKIN} value={a.skin} onPick={(i) => set('skin', i)} />
            <Swatches label="Hair" colors={HAIR} value={a.hair} onPick={(i) => set('hair', i)} />
            <fieldset className="pick-row">
              <legend>Hairstyle</legend>
              {STYLES.map((s) => <button key={s} type="button" aria-pressed={a.style === s} className={a.style === s ? 'on' : ''} onClick={() => set('style', s)}>{s[0].toUpperCase() + s.slice(1)}</button>)}
            </fieldset>
            <Swatches label="Shirt" colors={SHIRTS} value={a.shirt} onPick={(i) => set('shirt', i)} />
            <fieldset className="pick-row">
              <legend>Cap</legend>
              {(['cap', 'none'] as const).map((h) => <button key={h} type="button" aria-pressed={a.hat === h} className={a.hat === h ? 'on' : ''} onClick={() => set('hat', h)}>{h === 'cap' ? 'Cap' : 'No cap'}</button>)}
            </fieldset>
          </div>
        </div>
        <TextField label="Your name in town" value={typed} onChange={setTyped} placeholder="e.g. Ngozi" hint="2 to 16 letters. Leave it blank to keep the name from your email." error={nameOk ? undefined : 'At least 2 letters.'} />
        <div className="row creator-actions">
          {onClose && <button type="button" onClick={onClose}>Cancel</button>}
          <button className="primary" disabled={!nameOk} onClick={() => onSave(a, typed.trim() && typed.trim() !== name ? typed.trim() : null)}>{first ? 'Start trading' : 'Save'}</button>
        </div>
      </div>
    </div>
  );
}

function Swatches({ label, colors, value, onPick }: { label: string; colors: string[]; value: number; onPick: (i: number) => void }) {
  return (
    <fieldset className="pick-row">
      <legend>{label}</legend>
      {colors.map((c, i) => (
        <button key={c} type="button" className={`swatch ${value === i ? 'on' : ''}`} style={{ background: c }} aria-label={`${label} ${i + 1}`} aria-pressed={value === i} onClick={() => onPick(i)} />
      ))}
    </fieldset>
  );
}
