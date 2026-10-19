import { useEffect, useLayoutEffect, useState } from 'react';
import type { CSSProperties } from 'react';

interface Step {
  selector?: string;
  title: string;
  body: string;
}

const STEPS: Step[] = [
  {
    title: 'Welcome to CyberTriage 👋',
    body: 'A quick 30-second tour of your digital-forensics workspace. You can skip at any time.',
  },
  {
    selector: '[data-tour="nav"]',
    title: 'Navigate your workspace',
    body: 'Jump between the Home overview, your Cases register, and the Help guide from here.',
  },
  {
    selector: '[data-tour="quick-actions"]',
    title: 'Start fast',
    body: 'Use these shortcuts to spin up a new investigation or jump straight into your cases.',
  },
  {
    selector: '[data-tour="kpis"]',
    title: 'Live command centre',
    body: 'Every case, artifact and indicator you triage rolls up into these combined metrics.',
  },
  {
    selector: '[data-tour="account"]',
    title: 'Your account',
    body: 'Open this menu to replay this tour, reset the entire app, or log out.',
  },
];

const PAD = 8;

export function Tour({ onFinish }: { onFinish: () => void }) {
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);

  const step = STEPS[index];
  const isLast = index === STEPS.length - 1;

  useLayoutEffect(() => {
    const measure = () => {
      if (!step.selector) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.selector);
      if (el) {
        el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        setRect(el.getBoundingClientRect());
      } else {
        setRect(null);
      }
    };
    measure();
    const id = window.setTimeout(measure, 120); // settle after scroll
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [step]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onFinish();
      if (e.key === 'ArrowRight') setIndex((i) => Math.min(STEPS.length - 1, i + 1));
      if (e.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onFinish]);

  const next = () => (isLast ? onFinish() : setIndex((i) => i + 1));
  const back = () => setIndex((i) => Math.max(0, i - 1));

  // Position the tooltip card: below the target if there's room, else above; centred when no target.
  let cardStyle: CSSProperties = { left: '50%', top: '50%', transform: 'translate(-50%, -50%)' };
  if (rect) {
    const belowSpace = window.innerHeight - rect.bottom;
    const cardW = 340;
    let left = rect.left + rect.width / 2 - cardW / 2;
    left = Math.max(16, Math.min(left, window.innerWidth - cardW - 16));
    if (belowSpace > 220) {
      cardStyle = { left, top: rect.bottom + PAD + 10 };
    } else {
      cardStyle = { left, top: Math.max(16, rect.top - PAD - 10), transform: 'translateY(-100%)' };
    }
  }

  const holeStyle: CSSProperties | undefined = rect
    ? {
        left: rect.left - PAD,
        top: rect.top - PAD,
        width: rect.width + PAD * 2,
        height: rect.height + PAD * 2,
      }
    : undefined;

  return (
    <div className="tour-overlay" role="dialog" aria-modal="true" aria-label="Guided tour">
      <div className="tour-scrim" onClick={onFinish} />
      {holeStyle ? <div className="tour-hole" style={holeStyle} /> : null}
      <div className="tour-card" style={cardStyle}>
        <div className="tour-step-count">
          Step {index + 1} of {STEPS.length}
        </div>
        <h3 className="tour-title">{step.title}</h3>
        <p className="tour-body">{step.body}</p>
        <div className="tour-dots" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`tour-dot${i === index ? ' tour-dot-active' : ''}`} />
          ))}
        </div>
        <div className="tour-actions">
          <button type="button" className="link-btn" onClick={onFinish}>
            Skip tour
          </button>
          <div className="tour-nav">
            {index > 0 ? (
              <button type="button" className="btn btn-mini" onClick={back}>
                Back
              </button>
            ) : null}
            <button type="button" className="btn btn-primary btn-mini" onClick={next}>
              {isLast ? 'Get started' : 'Next'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
