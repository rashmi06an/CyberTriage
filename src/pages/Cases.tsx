import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { BRIDGE_HINT, createCase, hasBridge, listCases } from '../api';
import { EmptyState, NoticeBar, Panel, Spinner } from '../components/ui';
import { errorMessage, formatDateTime, statusSlug } from '../format';
import type { Case } from '../types';

export default function Cases() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [investigator, setInvestigator] = useState('Student Investigator');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const bridgeOk = hasBridge();

  useEffect(() => {
    if (!bridgeOk) return;
    listCases()
      .then(setCases)
      .catch((err) => setError(errorMessage(err)));
  }, [bridgeOk]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) {
      setError('Case name is required.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const created = await createCase(name.trim(), description.trim(), investigator.trim() || 'Student Investigator');
      navigate(`/cases/${created.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1 className="page-title">Cases</h1>
          <p className="page-sub">Every investigation is tracked as a case with its own evidence and findings.</p>
        </div>
      </header>

      {!bridgeOk ? <NoticeBar kind="error" message={BRIDGE_HINT} /> : null}
      {error ? <NoticeBar kind="error" message={error} /> : null}

      <div className="split">
        <Panel title={`Case register${cases ? ` (${cases.length})` : ''}`}>
          {cases === null ? (
            <Spinner label="Loading cases…" />
          ) : cases.length === 0 ? (
            <EmptyState title="No cases yet" hint="Create the first case using the form on the right." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Case</th>
                    <th>Name</th>
                    <th>Investigator</th>
                    <th>Status</th>
                    <th>Created</th>
                    <th aria-label="Actions" />
                  </tr>
                </thead>
                <tbody>
                  {cases.map((entry) => (
                    <tr key={entry.id}>
                      <td className="mono">{entry.id}</td>
                      <td>
                        <div className="cell-main">{entry.name}</div>
                        {entry.description ? <div className="cell-sub">{entry.description}</div> : null}
                      </td>
                      <td>{entry.investigator}</td>
                      <td>
                        <span className={`badge status-${statusSlug(entry.status)}`}>{entry.status}</span>
                      </td>
                      <td>{formatDateTime(entry.created_at)}</td>
                      <td>
                        <button className="btn btn-mini" type="button" onClick={() => navigate(`/cases/${entry.id}`)}>
                          Open
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="New case">
          <form className="form-grid" onSubmit={handleCreate}>
            <label className="field">
              <span>Case name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="e.g. Ransomware intrusion — finance workstation"
                maxLength={120}
                required
              />
            </label>
            <label className="field">
              <span>Description</span>
              <textarea
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Short summary of the incident, scope, and source of evidence."
                rows={4}
              />
            </label>
            <label className="field">
              <span>Investigator</span>
              <input value={investigator} onChange={(event) => setInvestigator(event.target.value)} maxLength={80} />
            </label>
            <button className="btn btn-primary" type="submit" disabled={busy || !bridgeOk}>
              {busy ? 'Creating…' : 'Create case'}
            </button>
            <p className="muted form-hint">
              Case IDs are generated automatically (format CT-YYYY-XXXXXX). Sample data can be loaded from the case page.
            </p>
          </form>
        </Panel>
      </div>
    </div>
  );
}
