import { useEffect, useRef, useState } from 'react';
import { hasBridge, resetApp } from '../api';
import { useAuth } from '../AuthContext';
import { errorMessage } from '../format';
import { Modal } from './ui';

export function AccountMenu() {
  const { user, logout, resetAuth, startTour } = useAuth();
  const [open, setOpen] = useState(false);
  const [confirmText, setConfirmText] = useState('');
  const [showReset, setShowReset] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onClick);
    return () => window.removeEventListener('mousedown', onClick);
  }, [open]);

  if (!user) return null;

  const initials = user.displayName
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const doReset = async () => {
    setResetBusy(true);
    setResetError('');
    try {
      if (hasBridge()) await resetApp();
      resetAuth(); // clears local accounts + session → returns to Welcome
    } catch (err) {
      setResetError(errorMessage(err));
      setResetBusy(false);
    }
  };

  return (
    <div className="account" ref={ref} data-tour="account">
      <button type="button" className="account-btn" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open}>
        <span className="account-avatar">{initials || 'U'}</span>
        <span className="account-name">{user.displayName}</span>
        <span className="account-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="account-menu" role="menu">
          <div className="account-head">
            <div className="account-avatar account-avatar-lg">{initials || 'U'}</div>
            <div>
              <div className="account-menu-name">{user.displayName}</div>
              <div className="account-menu-user mono">@{user.username}</div>
            </div>
          </div>
          <button
            type="button"
            className="account-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              startTour();
            }}
          >
            <span aria-hidden="true">✦</span> Replay guided tour
          </button>
          <button
            type="button"
            className="account-item account-item-danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              setConfirmText('');
              setResetError('');
              setShowReset(true);
            }}
          >
            <span aria-hidden="true">⟲</span> Reset entire app
          </button>
          <div className="account-sep" />
          <button
            type="button"
            className="account-item"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <span aria-hidden="true">⇥</span> Log out
          </button>
        </div>
      ) : null}

      {showReset ? (
        <Modal
          title="Reset entire app"
          tone="danger"
          onClose={() => (resetBusy ? undefined : setShowReset(false))}
          footer={
            <>
              <button className="btn" type="button" disabled={resetBusy} onClick={() => setShowReset(false)}>
                Cancel
              </button>
              <button
                className="btn btn-danger"
                type="button"
                disabled={resetBusy || confirmText.trim().toUpperCase() !== 'RESET'}
                onClick={doReset}
              >
                {resetBusy ? 'Resetting…' : 'Reset everything'}
              </button>
            </>
          }
        >
          <p>
            This permanently deletes <strong>all cases, evidence, artifacts, IOCs and analysis results</strong>, and
            removes <strong>every local account</strong> on this machine. The app returns to a fresh install. This
            cannot be undone.
          </p>
          <label className="field reset-confirm">
            <span>
              Type <strong>RESET</strong> to confirm
            </span>
            <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="RESET" autoFocus />
          </label>
          {resetError ? <div className="auth-error" role="alert">{resetError}</div> : null}
        </Modal>
      ) : null}
    </div>
  );
}
