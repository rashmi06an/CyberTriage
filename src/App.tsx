import { useCallback, useEffect, useState } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { engineStatus, hasBridge, onEngineState, restartEngine } from './api';
import { BrandLogo } from './components/Logo';
import { EnginePill } from './components/ui';
import { CyberBackground } from './components/CyberBackground';
import { LaunchSequence } from './components/LaunchSequence';
import { TopBar } from './components/TopBar';
import { Tour } from './components/Tour';
import { AuthProvider, useAuth } from './AuthContext';
import Welcome from './pages/Welcome';
import Cases from './pages/Cases';
import CaseDetail from './pages/CaseDetail';
import Home from './pages/Home';
import Help from './pages/Help';
import type { EngineState } from './types';

function Sidebar({ state, onRetry }: { state: EngineState | null; onRetry: () => void }) {
  return (
    <aside className="sidebar">
      <div className="brand" data-tour="brand">
        <BrandLogo />
        <div>
          <div className="brand-title">CyberTriage</div>
          <div className="brand-sub">DFIR Triage Console</div>
        </div>
      </div>

      <nav className="nav" aria-label="Primary navigation" data-tour="nav">
        <span className="nav-label">Workspace</span>
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
          <span className="nav-ico" aria-hidden="true">◈</span>
          Home
        </NavLink>
        <NavLink to="/cases" className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
          <span className="nav-ico" aria-hidden="true">▤</span>
          Cases
        </NavLink>
        <span className="nav-label">Support</span>
        <NavLink to="/help" className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
          <span className="nav-ico" aria-hidden="true">✦</span>
          Help guide
        </NavLink>
      </nav>

      <div className="sidebar-foot">
        <EnginePill state={state} onRetry={onRetry} />
        <p className="disclaimer">
          Student prototype for academic demonstration. Analysis output is decision support only — not court-admissible
          and not an official NIA product.
        </p>
      </div>
    </aside>
  );
}

function Workspace() {
  const { user, ready, showTour, finishTour } = useAuth();
  const [state, setState] = useState<EngineState | null>(() =>
    hasBridge() ? null : { state: 'error', detail: 'Desktop bridge unavailable — run npm run electron:dev' }
  );

  useEffect(() => {
    if (!hasBridge()) return;
    engineStatus()
      .then(setState)
      .catch(() => setState({ state: 'error', detail: 'Engine status check failed' }));
    return onEngineState(setState);
  }, []);

  const handleRetry = () => {
    restartEngine()
      .then(setState)
      .catch(() => setState({ state: 'error', detail: 'Engine restart failed' }));
  };

  if (!ready) {
    return <div className="boot-screen" aria-hidden="true" />;
  }

  if (!user) {
    return <Welcome />;
  }

  return (
    <>
      <div className="app-shell">
        <Sidebar state={state} onRetry={handleRetry} />
        <div className="content-col">
          <TopBar engine={state} />
          <main className="main">
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/cases" element={<Cases />} />
              <Route path="/cases/:caseId" element={<CaseDetail />} />
              <Route path="/help" element={<Help />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </main>
        </div>
      </div>
      {showTour ? <Tour onFinish={finishTour} /> : null}
    </>
  );
}

const LAUNCH_SEEN_KEY = 'cybertriage-launch-seen';

function shouldShowLaunch() {
  try {
    return sessionStorage.getItem(LAUNCH_SEEN_KEY) !== '1';
  } catch {
    return true;
  }
}

export default function App() {
  const [showLaunch, setShowLaunch] = useState(shouldShowLaunch);

  const finishLaunch = useCallback(() => {
    try {
      sessionStorage.setItem(LAUNCH_SEEN_KEY, '1');
    } catch {
      // storage unavailable — the overlay simply shows again next load
    }
    setShowLaunch(false);
  }, []);

  return (
    <HashRouter>
      <CyberBackground />
      <AuthProvider>
        <Workspace />
      </AuthProvider>
      {showLaunch ? <LaunchSequence onDone={finishLaunch} /> : null}
    </HashRouter>
  );
}
