import { useEffect, useState } from 'react';
import { hasBridge } from '../api';
import './LaunchSequence.css';

/**
 * One-time launch overlay: a control-room globe with evidence arcs, booting
 * monitor panels and a staged progress bar. Purely presentational — it sits
 * above the app while it loads and never blocks or alters any app logic.
 */

const DURATION = 5600;
const STAGES = ['PARSING ARTEFACTS', 'EXTRACTING INDICATORS', 'CORRELATING TIMELINE', 'SCORING RISK', 'READY'];

const FEED: Array<[string, string, string]> = [
  ['CRIT', '#ef4444', '185.220.101.4:443'],
  ['HIGH', '#f97316', 'rundll32 → net'],
  ['MED ', '#eab308', '4672 special privs'],
  ['LOW ', '#22c55e', '4634 logoff'],
  ['HIGH', '#f97316', 'schtasks /create'],
  ['CRIT', '#ef4444', 'mimikatz sha256'],
  ['MED ', '#eab308', 'wevtutil cl'],
  ['HIGH', '#f97316', 'vssadmin delete'],
];

const MERIDIAN_DELAYS = [0, -1, -2, -3, -4, -5];

const pad = (n: number) => String(n).padStart(2, '0');

function useStageScale() {
  const calc = () => Math.min(window.innerWidth / 1440, window.innerHeight / 900);
  const [scale, setScale] = useState(calc);
  useEffect(() => {
    const onResize = () => setScale(calc());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  return scale;
}

export function LaunchSequence({ onDone }: { onDone: () => void }) {
  const scale = useStageScale();
  const [elapsed, setElapsed] = useState(0);
  const [now, setNow] = useState(() => new Date());
  const [leaving, setLeaving] = useState(false);
  const bridgeOk = hasBridge();

  useEffect(() => {
    const start = performance.now();
    const id = window.setInterval(() => {
      setElapsed(performance.now() - start);
      setNow(new Date());
    }, 100);
    return () => window.clearInterval(id);
  }, []);

  const dismiss = () => setLeaving(true);

  useEffect(() => {
    if (!leaving) return;
    const id = window.setTimeout(onDone, 600);
    return () => window.clearTimeout(id);
  }, [leaving, onDone]);

  useEffect(() => {
    const id = window.setTimeout(dismiss, DURATION + 1400);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' || e.key === 'Enter') dismiss();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(id);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const pct = Math.min(100, Math.round((elapsed / DURATION) * 100));
  const stage = STAGES[Math.min(4, Math.floor(pct / 25))];
  const clock = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())} LOCAL`;

  return (
    <div className={`ls-root${leaving ? ' ls-leaving' : ''}`} role="dialog" aria-modal="true" aria-label="CyberTriage is starting">
      <div className="ls-stage" style={{ transform: `translate(-50%, -50%) scale(${scale})` }}>
        <div className="ls-scan" />

        <header className="ls-head">
          <span className="ls-head-left">
            <span className="ls-dot" />
            FORENSIC WORKSTATION · LOCAL
          </span>
          <span>{clock}</span>
          <span className="ls-head-left">
            BRIDGE <span className={bridgeOk ? 'ls-ok' : 'ls-bad'}>{bridgeOk ? 'ONLINE' : 'OFFLINE'}</span>
            <button type="button" className="ls-skip" onClick={dismiss}>
              SKIP
            </button>
          </span>
        </header>

        <svg className="ls-svg" width="1440" height="900" viewBox="0 0 1440 900" aria-hidden="true">
          <defs>
            <radialGradient id="ls-core" cx="50%" cy="50%" r="50%">
              <stop offset="0" stopColor="#49e0d0" stopOpacity=".22" />
              <stop offset=".7" stopColor="#49e0d0" stopOpacity=".05" />
              <stop offset="1" stopColor="#49e0d0" stopOpacity="0" />
            </radialGradient>
            <filter id="ls-glow" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="3" result="b" />
              <feMerge>
                <feMergeNode in="b" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <clipPath id="ls-globe-clip">
              <circle cx="720" cy="400" r="200" />
            </clipPath>
          </defs>

          <circle cx="720" cy="400" r="290" fill="url(#ls-core)" />
          <g className="ls-halo" fill="none" stroke="#2a2e3c">
            <circle cx="720" cy="400" r="262" strokeDasharray="2 8" />
            <path d="M720 138 v16 M720 646 v16 M458 400 h16 M966 400 h16" stroke="#878da0" />
          </g>
          <g className="ls-halo2" fill="none">
            <circle cx="720" cy="400" r="236" stroke="#49e0d0" strokeOpacity=".35" strokeDasharray="90 30 8 30" />
            <circle cx="956" cy="400" r="4" fill="#c6f34a" />
          </g>
          <circle cx="720" cy="400" r="200" fill="#0d1018" stroke="#49e0d0" strokeOpacity=".7" filter="url(#ls-glow)" />
          <g clipPath="url(#ls-globe-clip)" fill="none" stroke="#49e0d0" strokeOpacity=".32">
            {MERIDIAN_DELAYS.map((d) => (
              <ellipse key={d} className="ls-mer" style={{ animationDelay: `${d}s` }} cx="720" cy="400" rx="200" ry="200" />
            ))}
            <ellipse cx="720" cy="400" rx="200" ry="22" />
            <ellipse cx="720" cy="331" rx="188" ry="20" />
            <ellipse cx="720" cy="469" rx="188" ry="20" />
            <ellipse cx="720" cy="271" rx="153" ry="16" />
            <ellipse cx="720" cy="529" rx="153" ry="16" />
            <ellipse cx="720" cy="226" rx="98" ry="10" />
            <ellipse cx="720" cy="574" rx="98" ry="10" />
          </g>
          <g fill="none" strokeWidth="1.6" filter="url(#ls-glow)">
            <path className="ls-arc" style={{ animationDelay: '.2s' }} stroke="#c6f34a" d="M630 330 Q712 200 795 300" />
            <path className="ls-arc" style={{ animationDelay: '.6s' }} stroke="#c6f34a" d="M795 300 Q860 380 820 450" />
            <path className="ls-arc" style={{ animationDelay: '1s' }} stroke="#ef4444" d="M820 450 Q720 330 600 420" />
            <path className="ls-arc" style={{ animationDelay: '1.4s' }} stroke="#c6f34a" d="M600 420 Q620 520 700 480" />
            <path className="ls-arc" style={{ animationDelay: '1.8s' }} stroke="#f97316" d="M700 480 Q740 560 770 520" />
            <path className="ls-arc" style={{ animationDelay: '2.2s' }} stroke="#c6f34a" d="M630 330 Q610 380 600 420" />
          </g>
          <g>
            <circle cx="630" cy="330" r="4" fill="#c6f34a" />
            <circle className="ls-ping" cx="630" cy="330" r="6" fill="none" stroke="#c6f34a" />
            <circle cx="795" cy="300" r="4" fill="#c6f34a" />
            <circle className="ls-ping" style={{ animationDelay: '.6s' }} cx="795" cy="300" r="6" fill="none" stroke="#c6f34a" />
            <circle cx="820" cy="450" r="4" fill="#ef4444" />
            <circle className="ls-ping" style={{ animationDelay: '1.2s' }} cx="820" cy="450" r="6" fill="none" stroke="#ef4444" />
            <circle cx="600" cy="420" r="4" fill="#c6f34a" />
            <circle cx="700" cy="480" r="4" fill="#c6f34a" />
            <circle cx="770" cy="520" r="4" fill="#f97316" />
            <circle className="ls-ping" style={{ animationDelay: '1.8s' }} cx="770" cy="520" r="6" fill="none" stroke="#f97316" />
          </g>
          <g fontFamily="JetBrains Mono, monospace" fontSize="10" fill="#878da0">
            <text x="540" y="318">HOST-01 · evtx</text>
            <text x="806" y="290">$MFT</text>
            <text x="832" y="462" fill="#ef4444">185.220.101.4</text>
            <text x="782" y="536" fill="#f97316">schtasks</text>
          </g>
          <g stroke="#2a2e3c" fill="none">
            <path d="M356 170 H470 L520 230" />
            <path d="M356 520 H460 L540 470" />
            <path d="M1084 170 H970 L920 230" />
            <path d="M1084 520 H980 L900 470" />
          </g>
        </svg>

        <div className="ls-col ls-col-left">
          <div className="ls-mon" style={{ animationDelay: '.1s' }}>
            <div className="ls-mon-head">
              <span>EVIDENCE INGEST</span>
              <span className="ls-ok">LIVE</span>
            </div>
            <div className="ls-ingest">
              <span>disk.E01</span>
              <span className="ls-track"><span style={{ width: '100%', background: '#c6f34a' }} /></span>
              <span>100</span>
              <span>memory.raw</span>
              <span className="ls-track"><span style={{ width: '74%', background: '#c6f34a' }} /></span>
              <span>74</span>
              <span>triage.zip</span>
              <span className="ls-track"><span style={{ width: '41%', background: '#49e0d0' }} /></span>
              <span>41</span>
            </div>
          </div>
          <div className="ls-mon" style={{ animationDelay: '.35s' }}>
            <div className="ls-mon-head">
              <span>IOC STREAM</span>
              <span>EVENTS / SEC</span>
            </div>
            <div className="ls-feed-box">
              <div className="ls-feed">
                {[...FEED, ...FEED].map(([sev, color, text], i) => (
                  <span key={i}>
                    <span style={{ color }}>{sev}</span> {text}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <div className="ls-mon" style={{ animationDelay: '.6s' }}>
            <div className="ls-mon-head">
              <span>SEVERITY</span>
            </div>
            <div className="ls-sev">
              <span style={{ height: '30%', background: '#ef4444' }} />
              <span style={{ height: '62%', background: '#f97316' }} />
              <span style={{ height: '100%', background: '#eab308' }} />
              <span style={{ height: '74%', background: '#22c55e' }} />
              <span style={{ height: '18%', background: '#64748b' }} />
            </div>
          </div>
        </div>

        <div className="ls-col ls-col-right">
          <div className="ls-mon" style={{ animationDelay: '.2s' }}>
            <div className="ls-mon-head">
              <span>TIMELINE</span>
              <span>24H</span>
            </div>
            <svg viewBox="0 0 268 60" width="100%" height="60" aria-hidden="true">
              <polyline
                fill="none"
                stroke="#c6f34a"
                strokeWidth="1.5"
                points="0,50 20,46 40,48 60,40 80,44 100,30 120,36 140,12 160,28 180,22 200,34 220,18 240,26 268,8"
              />
              <line x1="140" y1="0" x2="140" y2="60" stroke="#ef4444" strokeDasharray="2 3" />
            </svg>
          </div>
          <div className="ls-mon" style={{ animationDelay: '.45s' }}>
            <div className="ls-mon-head">
              <span>NETWORK</span>
              <span>TOPOLOGY</span>
            </div>
            <svg viewBox="0 0 268 110" width="100%" height="110" aria-hidden="true">
              <g stroke="#2a2e3c" fill="none">
                <path d="M30 55 H90 V20 H150" />
                <path d="M90 55 H150" />
                <path d="M90 55 V90 H150" />
                <path d="M150 20 H210" />
                <path d="M150 90 H210 V55 H240" />
              </g>
              <path d="M30 55 H90 V90 H150 H210 V55 H240" fill="none" stroke="#f97316" strokeWidth="1.5" filter="url(#ls-glow)" />
              <g fill="#15161e" stroke="#878da0">
                <rect x="22" y="47" width="16" height="16" />
                <rect x="142" y="12" width="16" height="16" />
                <rect x="142" y="47" width="16" height="16" />
                <rect x="202" y="12" width="16" height="16" />
              </g>
              <g fill="#15161e">
                <rect x="142" y="82" width="16" height="16" stroke="#f97316" />
                <rect x="232" y="47" width="16" height="16" stroke="#ef4444" />
              </g>
            </svg>
          </div>
          <div className="ls-mon ls-mon-row" style={{ animationDelay: '.7s' }}>
            <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden="true">
              <circle cx="32" cy="32" r="26" fill="none" stroke="#2a2e3c" strokeWidth="5" />
              <circle cx="32" cy="32" r="26" fill="none" stroke="#c6f34a" strokeWidth="5" strokeDasharray="118 164" transform="rotate(-90 32 32)" />
            </svg>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="ls-mon-head">RISK MODEL</span>
              <span style={{ color: '#f5f6f9', fontSize: 13 }}>CALIBRATED</span>
            </div>
          </div>
        </div>

        <div className="ls-foot">
          <h1 className="ls-word">
            <span className="ls-word-light">Cyber</span>
            <span className="ls-word-bold">Triage</span>
          </h1>
          <div className="ls-progress">
            <div className="ls-progress-row">
              <span>{stage}</span>
              <strong>{String(pct).padStart(3, '0')}%</strong>
            </div>
            <div className="ls-bar">
              <div style={{ transform: `scaleX(${pct / 100})` }} />
            </div>
          </div>
          <button type="button" className="ls-enter" onClick={dismiss} autoFocus>
            ENTER WORKSPACE <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </div>
  );
}
