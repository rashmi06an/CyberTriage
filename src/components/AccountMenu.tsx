import { useEffect, useRef, useState } from 'react';
import { hasBridge, resetApp } from '../api';
import { useAuth } from '../AuthContext';
import { fileToAvatar } from '../avatar';
import { errorMessage } from '../format';
import { Avatar, Modal } from './ui';

export function AccountMenu() {
  const { user, logout, resetAuth, startTour, updateProfile } = useAuth();
  const [open, setOpen] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
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
        <Avatar name={user.displayName} src={user.avatar} size={26} />
        <span className="account-name">{user.displayName}</span>
        <span className="account-caret" aria-hidden="true">
          ▾
        </span>
      </button>

      {open ? (
        <div className="account-menu" role="menu">
          <div className="account-head">
            <Avatar name={user.displayName} src={user.avatar} size={40} />
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
              setShowProfile(true);
            }}
          >
            <span aria-hidden="true">◎</span> Edit profile
          </button>
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

      {showProfile ? (
        <EditProfileModal
          name={user.displayName}
          avatar={user.avatar}
          username={user.username}
          onClose={() => setShowProfile(false)}
          onSave={(updates) => {
            updateProfile(updates);
            setShowProfile(false);
          }}
        />
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

function EditProfileModal({
  name,
  avatar,
  username,
  onClose,
  onSave,
}: {
  name: string;
  avatar?: string;
  username: string;
  onClose: () => void;
  onSave: (updates: { displayName: string; avatar: string | null }) => void;
}) {
  const [displayName, setDisplayName] = useState(name);
  const [pic, setPic] = useState<string | null>(avatar ?? null);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    try {
      setPic(await fileToAvatar(file));
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <Modal
      title="Edit profile"
      onClose={onClose}
      footer={
        <>
          <button className="btn" type="button" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            onClick={() => onSave({ displayName: displayName.trim() || username, avatar: pic })}
          >
            Save changes
          </button>
        </>
      }
    >
      <div className="profile-edit">
        <div className="profile-avatar-row">
          <Avatar name={displayName || username} src={pic} size={72} />
          <div className="profile-avatar-actions">
            <span className="profile-avatar-label">Profile picture</span>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onPick} />
            <div className="avatar-picker">
              <button type="button" className="btn btn-mini" onClick={() => fileRef.current?.click()}>
                {pic ? 'Change' : 'Upload'}
              </button>
              {pic ? (
                <button type="button" className="btn btn-mini" onClick={() => setPic(null)}>
                  Remove
                </button>
              ) : null}
            </div>
          </div>
        </div>

        <label className="field">
          <span>Display name</span>
          <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={40} placeholder={username} />
        </label>
        <p className="muted form-hint mono">@{username}</p>

        {error ? <div className="auth-error" role="alert">{error}</div> : null}
      </div>
    </Modal>
  );
}
