import { useEffect, useRef, useState } from 'react';

type Format = 'pdf' | 'json' | 'csv';

const OPTIONS: { format: Format; label: string; hint: string }[] = [
  { format: 'pdf', label: 'Export as PDF', hint: 'Formatted investigator report' },
  { format: 'csv', label: 'Export as CSV', hint: 'Artifacts, IOCs & timeline tables' },
  { format: 'json', label: 'Export as JSON', hint: 'Full structured case data' },
];

export function ExportMenu({
  onExport,
  busy,
  disabled,
}: {
  onExport: (format: Format) => void;
  busy: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const exporting = busy.startsWith('export-');

  return (
    <div className="export-menu" ref={ref}>
      <button
        type="button"
        className="btn"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {exporting ? 'Exporting…' : 'Export'}
        <span className="export-caret" aria-hidden="true">▾</span>
      </button>
      {open ? (
        <div className="export-dropdown" role="menu">
          {OPTIONS.map((opt) => (
            <button
              key={opt.format}
              type="button"
              role="menuitem"
              className="export-item"
              disabled={exporting}
              onClick={() => {
                setOpen(false);
                onExport(opt.format);
              }}
            >
              <span className="export-item-label">{opt.label}</span>
              <span className="export-item-hint">{opt.hint}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
