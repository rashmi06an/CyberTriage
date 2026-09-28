import { useEffect, useState } from 'react';
import { HashRouter, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { engineStatus, hasBridge, onEngineState, restartEngine } from './api';
import { BrandLogo } from './components/Logo';
import { EnginePill } from './components/ui';
import Cases from './pages/Cases';
import CaseDetail from './pages/CaseDetail';
import Dashboard from './pages/Dashboard';
import Help from './pages/Help';
import type { EngineState } from './types';

function Sidebar() {
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

  return (
    <aside className="sidebar">
      <div className="brand">
        <BrandLogo />
        <div>
          <div className="brand-title">CyberTriage</div>
          <div className="brand-sub">DFIR Triage Console</div>
        </div>
      </div>

      <nav className="nav" aria-label="Primary navigation">
        <span className="nav-label">Workspace</span>
        <NavLink to="/" end className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
          Overview
        </NavLink>
        <NavLink to="/cases" className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
          Cases
        </NavLink>
        <span className="nav-label">Support</span>
        <NavLink to="/help" className={({ isActive }) => `nav-link${isActive ? ' nav-link-active' : ''}`}>
          Help guide
        </NavLink>
      </nav>

      <div className="sidebar-foot">
        <EnginePill state={state} onRetry={handleRetry} />
        <p className="disclaimer">
          Student prototype for academic demonstration. Analysis output is decision support only — not court-admissible
          and not an official NIA product.
        </p>
      </div>
    </aside>
  );
}

export default function App() {
  return (
    <HashRouter>
      <div className="app-shell">
        <Sidebar />
        <main className="main">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/cases" element={<Cases />} />
            <Route path="/cases/:caseId" element={<CaseDetail />} />
            <Route path="/help" element={<Help />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  );
}
