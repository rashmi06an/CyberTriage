import { useState } from 'react';
import type { FormEvent } from 'react';
import { BrandLogo } from '../components/Logo';
import { useAuth } from '../AuthContext';
import { AuthError } from '../auth';
import { errorMessage } from '../format';

type Mode = 'login' | 'signup';

const FEATURES = [
  { icon: '◈', text: 'Import disk artifacts, logs & network captures' },
  { icon: '⚡', text: 'Automated IOC detection & ML anomaly scoring' },
  { icon: '◉', text: 'Interactive timelines and risk recommendations' },
  { icon: '▤', text: 'Export court-ready PDF, JSON & CSV reports' },
];

export default function Welcome() {
  const { login, signup } = useAuth();
  const [mode, setMode] = useState<Mode>('login');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const switchMode = (next: Mode) => {
    setMode(next);
    setError('');
    setPassword('');
    setConfirm('');
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(username, password);
      } else {
        await signup(username, password, confirm, displayName);
      }
      // On success the provider flips the session and the app re-renders.
    } catch (err) {
      setError(err instanceof AuthError ? err.message : errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="welcome">
      <div className="welcome-grid">
        <section className="welcome-hero">
          <div className="welcome-brand">
            <BrandLogo />
            <div>
              <div className="welcome-brand-title">CyberTriage</div>
              <div className="welcome-brand-sub">DFIR Triage Console</div>
            </div>
          </div>

          <h1 className="welcome-headline">
            Triage digital evidence <span className="accent-text">faster</span>, with clarity.
          </h1>
          <p className="welcome-lede">
            A streamlined digital-forensics workspace: import evidence, run automated analysis, surface
            indicators of compromise, and focus on what matters with AI-assisted risk scoring.
          </p>

          <ul className="welcome-features">
            {FEATURES.map((f) => (
              <li key={f.text}>
                <span className="welcome-feature-ico" aria-hidden="true">
                  {f.icon}
                </span>
                {f.text}
              </li>
            ))}
          </ul>

          <p className="welcome-disclaimer">
            Student prototype for academic demonstration. Analysis output is decision support only — not
            court-admissible and not an official NIA product.
          </p>
        </section>

        <section className="welcome-auth">
          <div className="auth-card">
            <div className="auth-tabs" role="tablist" aria-label="Authentication mode">
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'login'}
                className={`auth-tab${mode === 'login' ? ' auth-tab-active' : ''}`}
                onClick={() => switchMode('login')}
              >
                Log in
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === 'signup'}
                className={`auth-tab${mode === 'signup' ? ' auth-tab-active' : ''}`}
                onClick={() => switchMode('signup')}
              >
                Sign up
              </button>
            </div>

            <h2 className="auth-title">{mode === 'login' ? 'Welcome back' : 'Create your account'}</h2>
            <p className="auth-sub">
              {mode === 'login'
                ? 'Sign in to open your investigations.'
                : 'Accounts are stored locally on this machine only.'}
            </p>

            <form className="auth-form" onSubmit={handleSubmit}>
              <label className="field">
                <span>Username</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. analyst01"
                  autoComplete="username"
                  autoFocus
                  maxLength={24}
                />
              </label>

              {mode === 'signup' ? (
                <label className="field">
                  <span>
                    Display name <span className="field-opt">(optional)</span>
                  </span>
                  <input
                    value={displayName}
                    onChange={(e) => setDisplayName(e.target.value)}
                    placeholder="Shown in the app"
                    maxLength={40}
                  />
                </label>
              ) : null}

              <label className="field">
                <span>Password</span>
                <div className="input-affix">
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={mode === 'signup' ? 'At least 6 characters' : 'Your password'}
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                  />
                  <button
                    type="button"
                    className="affix-btn"
                    onClick={() => setShowPw((v) => !v)}
                    aria-label={showPw ? 'Hide password' : 'Show password'}
                  >
                    {showPw ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              {mode === 'signup' ? (
                <label className="field">
                  <span>Confirm password</span>
                  <input
                    type={showPw ? 'text' : 'password'}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                  />
                </label>
              ) : null}

              {error ? (
                <div className="auth-error" role="alert">
                  {error}
                </div>
              ) : null}

              <button className="btn btn-primary btn-block" type="submit" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account & start'}
              </button>
            </form>

            <p className="auth-switch">
              {mode === 'login' ? (
                <>
                  New here?{' '}
                  <button type="button" className="link-btn" onClick={() => switchMode('signup')}>
                    Create an account
                  </button>
                </>
              ) : (
                <>
                  Already have an account?{' '}
                  <button type="button" className="link-btn" onClick={() => switchMode('login')}>
                    Log in
                  </button>
                </>
              )}
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
