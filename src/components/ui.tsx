import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import type { ReactNode } from 'react';
import { SEVERITY_COLORS } from '../constants';
import type { EngineState } from '../types';

export function Modal({
  title,
  children,
  onClose,
  footer,
  tone,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  footer?: ReactNode;
  tone?: 'danger';
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Rendered through a portal to <body> so the fixed overlay escapes any ancestor
  // with backdrop-filter/transform (e.g. the top bar), which would otherwise clip it.
  return createPortal(
    <div className="modal-overlay" onMouseDown={onClose}>
      <div
        className={`modal${tone ? ` modal-${tone}` : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <header className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="modal-close" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </header>
        <div className="modal-body">{children}</div>
        {footer ? <footer className="modal-foot">{footer}</footer> : null}
      </div>
    </div>,
    document.body
  );
}

export function Avatar({
  name,
  src,
  size = 26,
  className,
}: {
  name: string;
  src?: string | null;
  size?: number;
  className?: string;
}) {
  const initials =
    name
      .split(/\s+/)
      .map((p) => p[0])
      .slice(0, 2)
      .join('')
      .toUpperCase() || 'U';
  return (
    <span
      className={`avatar${className ? ` ${className}` : ''}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
    >
      {src ? <img src={src} alt="" /> : initials}
    </span>
  );
}

export function SeverityBadge({ severity }: { severity?: string | null }) {
  const value = (severity ?? 'UNKNOWN').toUpperCase();
  return <span className={`badge sev-${value.toLowerCase()}`}>{value}</span>;
}

export function PriorityBadge({ priority }: { priority?: string }) {
  const value = (priority ?? 'LOW').toUpperCase();
  return <span className={`badge prio-${value.toLowerCase()}`}>{value}</span>;
}

export function StatCard({
  label,
  value,
  tone,
  onClick,
  hint,
}: {
  label: string;
  value: number | string;
  tone?: string;
  onClick?: () => void;
  hint?: string;
}) {
  const className = `stat-card${tone ? ` tone-${tone}` : ''}${onClick ? ' stat-card-link' : ''}`;
  if (onClick) {
    return (
      <button type="button" className={className} onClick={onClick} title={hint}>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {hint ? <span className="stat-jump" aria-hidden="true">→</span> : null}
      </button>
    );
  }
  return (
    <div className={className}>
      <div className="stat-value">{value}</div>
      <div className="stat-label">{label}</div>
    </div>
  );
}

export function Panel({
  title,
  actions,
  children,
  className,
}: {
  title?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`panel${className ? ` ${className}` : ''}`}>
      {title || actions ? (
        <header className="panel-head">
          <h2>{title}</h2>
          {actions ? <div className="panel-actions">{actions}</div> : null}
        </header>
      ) : null}
      <div className="panel-body">{children}</div>
    </section>
  );
}

export interface Insight {
  summary: string;
  good: string[];
  issues: string[];
  missing?: { reason: string; fixes: string[] };
}

export function InsightCard({ insight, tone }: { insight: Insight; tone?: string }) {
  return (
    <section className={`insight${tone ? ` insight-${tone}` : ''}`}>
      <div className="insight-head">
        <span className="insight-ico" aria-hidden="true">ⓘ</span>
        <span className="insight-what">What this page is telling you</span>
      </div>
      <p className="insight-summary">{insight.summary}</p>

      {insight.missing ? (
        <div className="insight-missing">
          <div className="insight-missing-reason">
            <span className="insight-label insight-label-warn">Not available</span>
            {insight.missing.reason}
          </div>
          {insight.missing.fixes.length > 0 ? (
            <div className="insight-fixes">
              <span className="insight-label">Suggestions &amp; fixes</span>
              <ul>
                {insight.missing.fixes.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      {insight.issues.length > 0 || insight.good.length > 0 ? (
        <div className="insight-cols">
          {insight.issues.length > 0 ? (
            <div className="insight-col">
              <span className="insight-label insight-label-bad">Needs attention</span>
              <ul>
                {insight.issues.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
          {insight.good.length > 0 ? (
            <div className="insight-col">
              <span className="insight-label insight-label-ok">Looks OK</span>
              <ul>
                {insight.good.map((t, i) => (
                  <li key={i}>{t}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty">
      <h3>{title}</h3>
      {hint ? <p>{hint}</p> : null}
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function Spinner({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="spinner-row">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function NoticeBar({
  kind,
  message,
  action,
}: {
  kind: 'info' | 'error';
  message: string;
  action?: ReactNode;
}) {
  return (
    <div className={`notice notice-${kind}`}>
      <span className="notice-message">{message}</span>
      {action ? <span className="notice-action">{action}</span> : null}
    </div>
  );
}

export function FilterChips({
  options,
  value,
  onChange,
  counts,
}: {
  options: string[];
  value: string;
  onChange: (next: string) => void;
  counts?: Record<string, number>;
}) {
  return (
    <div className="chips">
      {options.map((option) => (
        <button
          key={option}
          type="button"
          className={`chip${option === value ? ' chip-active' : ''}`}
          onClick={() => onChange(option)}
        >
          {option}
          {counts && counts[option] !== undefined ? ` (${counts[option]})` : ''}
        </button>
      ))}
    </div>
  );
}

export function ScoreGauge({ score, severity }: { score: number; severity?: string }) {
  const clamped = Math.max(0, Math.min(100, Math.round(score)));
  const label = severity ? severity.toUpperCase() : 'NO DATA';
  const color = SEVERITY_COLORS[label] ?? '#64748b';
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  return (
    <div className="gauge">
      <svg viewBox="0 0 140 140" width="150" height="150" role="img" aria-label={`Risk score ${clamped} of 100`}>
        <circle cx="70" cy="70" r={radius} fill="none" stroke="rgba(148, 163, 184, 0.15)" strokeWidth="12" />
        <circle
          cx="70"
          cy="70"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - clamped / 100)}
          transform="rotate(-90 70 70)"
        />
        <text x="70" y="70" textAnchor="middle" className="gauge-score">
          {clamped}
        </text>
        <text x="70" y="92" textAnchor="middle" className="gauge-label" fill={color}>
          {label}
        </text>
      </svg>
      <div className="gauge-caption">Composite risk score (0–100)</div>
    </div>
  );
}

export function EnginePill({ state, onRetry }: { state: EngineState | null; onRetry: () => void }) {
  const status = state?.state ?? 'stopped';
  const label =
    status === 'ready'
      ? 'Engine ready'
      : status === 'starting'
        ? 'Engine starting…'
        : status === 'error'
          ? 'Engine error'
          : 'Engine offline';
  return (
    <div className={`engine-pill state-${status}`}>
      <span className={`dot dot-${status}`} aria-hidden="true" />
      <div className="engine-pill-text">
        <span>{label}</span>
        {state?.detail ? <small title={state.detail}>{state.detail}</small> : null}
      </div>
      {status === 'error' ? (
        <button className="btn btn-mini" type="button" onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}
