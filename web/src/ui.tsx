import { useState, type ReactNode } from 'react';

export function Panel({ id, title, hint, children, aside }: { id: string; title: string; hint?: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="panel" id={`panel-${id}`}>
      <header className="panel-head">
        <h2 className="serif-title">{title}</h2>
        {aside}
      </header>
      {hint && <p className="panel-hint">{hint}</p>}
      {children}
    </section>
  );
}

export function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="group">
      <div className="group-label">{label}</div>
      {children}
    </div>
  );
}

export function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className={`check ${checked ? 'on' : ''}`}>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span className="box" aria-hidden>
        {checked ? '✓' : ''}
      </span>
      <span>{label}</span>
    </label>
  );
}

export function Chips<V extends string>({
  value,
  options,
  onChange,
}: {
  value: V;
  options: { value: V; label: string }[];
  onChange: (v: V) => void;
}) {
  return (
    <div className="chips" role="radiogroup">
      {options.map((o) => (
        <button key={o.value} role="radio" aria-checked={o.value === value} className={`chip ${o.value === value ? 'on' : ''}`} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export const fmtTime = (s: number, decimals = 0) => {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  const sec = decimals ? rest.toFixed(decimals).padStart(decimals + 3, '0') : String(Math.floor(rest)).padStart(2, '0');
  return `${m}:${sec}`;
};

// One shared <audio> for previews, so two never play at once.
let previewAudio: HTMLAudioElement | null = null;
let previewSrc = '';
export const playPreview = (url: string, onEnd?: () => void): boolean => {
  if (previewAudio && previewSrc === url && !previewAudio.paused) {
    previewAudio.pause();
    return false;
  }
  previewAudio?.pause();
  previewAudio = new Audio(url);
  previewSrc = url;
  previewAudio.onended = () => onEnd?.();
  previewAudio.play().catch(() => onEnd?.());
  return true;
};
export const stopPreview = () => previewAudio?.pause();

// A small "?" that shows a one-line tip.
export function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="help-tip">
      <button type="button" className="help-btn" aria-label="?" aria-expanded={open} onClick={(e) => (e.stopPropagation(), setOpen((o) => !o))} onBlur={() => setOpen(false)}>
        ?
      </button>
      {open && <span className="help-pop" role="tooltip">{text}</span>}
    </span>
  );
}
