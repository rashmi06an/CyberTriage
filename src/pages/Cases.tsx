import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BRIDGE_HINT,
  createCase,
  deleteCase,
  deleteCases,
  hasBridge,
  listCases,
  updateCase,
} from '../api';
import { EmptyState, Modal, NoticeBar, Panel, Spinner } from '../components/ui';
import { errorMessage, formatDateTime, statusSlug } from '../format';
import type { Case } from '../types';

const STATUS_OPTIONS = ['Open', 'Analyzing', 'Analysis Complete', 'Closed'];

export default function Cases() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [investigator, setInvestigator] = useState('Student Investigator');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<Case | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{ ids: string[]; label: string } | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const bridgeOk = hasBridge();

  const reload = () => {
    listCases()
      .then((list) => {
        setCases(list);
        setSelected((prev) => {
          const valid = new Set(list.map((c) => c.id));
          return new Set([...prev].filter((id) => valid.has(id)));
        });
      })
      .catch((err) => setError(errorMessage(err)));
  };

  useEffect(() => {
    if (!bridgeOk) return;
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bridgeOk]);

  const allSelected = useMemo(
    () => cases !== null && cases.length > 0 && selected.size === cases.length,
    [cases, selected]
  );

  const toggleOne = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const toggleAll = () =>
    setSelected((prev) => (prev.size === (cases?.length ?? 0) ? new Set() : new Set((cases ?? []).map((c) => c.id))));

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

  const runDelete = async () => {
    if (!confirmDelete) return;
    setActionBusy(true);
    setError('');
    try {
      if (confirmDelete.ids.length === 1) await deleteCase(confirmDelete.ids[0]);
      else await deleteCases(confirmDelete.ids);
      setNotice(`Deleted ${confirmDelete.ids.length} case${confirmDelete.ids.length > 1 ? 's' : ''}.`);
      setConfirmDelete(null);
      setSelected(new Set());
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActionBusy(false);
    }
  };

  const saveEdit = async (fields: { name: string; description: string; investigator: string; status: string }) => {
    if (!editing) return;
    setActionBusy(true);
    setError('');
    try {
      await updateCase(editing.id, fields);
      setNotice(`Updated ${editing.id}.`);
      setEditing(null);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setActionBusy(false);
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
      {error ? <NoticeBar kind="error" message={error} action={<button className="btn btn-mini" type="button" onClick={() => setError('')}>Dismiss</button>} /> : null}
      {notice ? <NoticeBar kind="info" message={notice} action={<button className="btn btn-mini" type="button" onClick={() => setNotice('')}>Dismiss</button>} /> : null}

      <div className="split">
        <Panel
          title={`Case register${cases ? ` (${cases.length})` : ''}`}
          actions={
            selected.size > 0 ? (
              <div className="bulk-bar">
                <span className="bulk-count">{selected.size} selected</span>
                <button
                  className="btn btn-mini btn-danger"
                  type="button"
                  onClick={() =>
                    setConfirmDelete({ ids: [...selected], label: `${selected.size} selected case${selected.size > 1 ? 's' : ''}` })
                  }
                >
                  Delete selected
                </button>
                <button className="btn btn-mini" type="button" onClick={() => setSelected(new Set())}>
                  Clear
                </button>
              </div>
            ) : undefined
          }
        >
          {cases === null ? (
            <Spinner label="Loading cases…" />
          ) : cases.length === 0 ? (
            <EmptyState title="No cases yet" hint="Create the first case using the form on the right." />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th className="col-check">
                      <input
                        type="checkbox"
                        checked={allSelected}
                        aria-label="Select all cases"
                        onChange={toggleAll}
                      />
                    </th>
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
                    <tr key={entry.id} className={selected.has(entry.id) ? 'row-selected' : undefined}>
                      <td className="col-check">
                        <input
                          type="checkbox"
                          checked={selected.has(entry.id)}
                          aria-label={`Select ${entry.name}`}
                          onChange={() => toggleOne(entry.id)}
                        />
                      </td>
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
                        <div className="row-actions">
                          <button className="btn btn-mini" type="button" onClick={() => navigate(`/cases/${entry.id}`)}>
                            Open
                          </button>
                          <button className="btn btn-mini" type="button" onClick={() => setEditing(entry)}>
                            Edit
                          </button>
                          <button
                            className="btn btn-mini btn-danger"
                            type="button"
                            onClick={() => setConfirmDelete({ ids: [entry.id], label: entry.name })}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel title="New case">
          <form className="form-grid" onSubmit={handleCreate} data-tour="new-case-form">
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
              Case IDs are generated automatically (format CT-YYYY-XXXXXX). After creating a case you can import
              evidence or load a sample dataset from the case page.
            </p>
          </form>
        </Panel>
      </div>

      {editing ? <EditCaseModal case={editing} busy={actionBusy} onCancel={() => setEditing(null)} onSave={saveEdit} /> : null}

      {confirmDelete ? (
        <Modal
          title="Delete case"
          tone="danger"
          onClose={() => (actionBusy ? undefined : setConfirmDelete(null))}
          footer={
            <>
              <button className="btn" type="button" disabled={actionBusy} onClick={() => setConfirmDelete(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" type="button" disabled={actionBusy} onClick={runDelete}>
                {actionBusy ? 'Deleting…' : `Delete ${confirmDelete.ids.length > 1 ? `${confirmDelete.ids.length} cases` : 'case'}`}
              </button>
            </>
          }
        >
          <p>
            Permanently delete <strong>{confirmDelete.label}</strong> and all associated evidence, artifacts, IOCs and
            analysis results? This cannot be undone.
          </p>
        </Modal>
      ) : null}
    </div>
  );
}

function EditCaseModal({
  case: entry,
  busy,
  onCancel,
  onSave,
}: {
  case: Case;
  busy: boolean;
  onCancel: () => void;
  onSave: (fields: { name: string; description: string; investigator: string; status: string }) => void;
}) {
  const [name, setName] = useState(entry.name);
  const [description, setDescription] = useState(entry.description ?? '');
  const [investigator, setInvestigator] = useState(entry.investigator ?? '');
  const [status, setStatus] = useState(entry.status ?? 'Open');
  const statusOptions = STATUS_OPTIONS.includes(status) ? STATUS_OPTIONS : [status, ...STATUS_OPTIONS];

  return (
    <Modal
      title={`Edit ${entry.id}`}
      onClose={() => (busy ? undefined : onCancel())}
      footer={
        <>
          <button className="btn" type="button" disabled={busy} onClick={onCancel}>
            Cancel
          </button>
          <button
            className="btn btn-primary"
            type="button"
            disabled={busy || !name.trim()}
            onClick={() => onSave({ name: name.trim(), description: description.trim(), investigator: investigator.trim(), status })}
          >
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </>
      }
    >
      <div className="form-grid">
        <label className="field">
          <span>Case name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
        </label>
        <label className="field">
          <span>Description</span>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} />
        </label>
        <label className="field">
          <span>Investigator</span>
          <input value={investigator} onChange={(e) => setInvestigator(e.target.value)} maxLength={80} />
        </label>
        <label className="field">
          <span>Status</span>
          <select className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
            {statusOptions.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>
    </Modal>
  );
}
