import { useEffect, useMemo, useState } from 'react';
import type { EngineState } from '../types';

/**
 * Persistent SOC-style command bar shown above every page. Live UTC + local
 * clock, a session identifier, engine heartbeat, and a scrolling status ticker
 * to sell the "network operations centre" feel.
 */

const TICKER = [
  'IsolationForest anomaly model loaded',
  'IOC signature set synced',
  'Timeline correlation engine online',
  'Evidence hashing: SHA-256 / MD5',
  'Recommendation engine armed',
  'Report exporters: PDF · JSON · CSV',
];

export function TopBar({ engine }: { engine: EngineState | null }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const sessionId = useMemo(
    () => `SOC-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${new Date().getFullYear()}`,
    []
  );

  const status = engine?.state ?? 'stopped';
  const utc = now.toISOString().slice(11, 19);
  const local = now.toLocaleTimeString(undefined, { hour12: false });

  return (
    <div className="topbar" role="banner">
      <div className="topbar-left">
        <span className={`live-dot live-${status}`} aria-hidden="true" />
        <span className="topbar-title">THREAT TRIAGE CONSOLE</span>
        <span className="topbar-sep" />
        <span className="topbar-session mono">{sessionId}</span>
      </div>

      <div className="topbar-ticker" aria-hidden="true">
        <div className="ticker-track">
          {[...TICKER, ...TICKER].map((item, i) => (
            <span className="ticker-item" key={i}>
              <i className="ticker-mark" />
              {item}
            </span>
          ))}
        </div>
      </div>

      <div className="topbar-right mono">
        <span className="clock-block">
          <small>UTC</small>
          {utc}
        </span>
        <span className="clock-block">
          <small>LOCAL</small>
          {local}
        </span>
      </div>
    </div>
  );
}
