import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { BRIDGE_HINT, getDashboardStats, hasBridge, listCases } from '../api';
import { CHART_GRID, CHART_TICK, SEV_ORDER, SEVERITY_COLORS, TOOLTIP_STYLE } from '../constants';
import { EmptyState, NoticeBar, Panel, PriorityBadge, ScoreGauge, SeverityBadge, Spinner, StatCard } from '../components/ui';
import { errorMessage, formatDateTime, priorityRank } from '../format';
import type { Case, DashboardStats } from '../types';

export default function Dashboard() {
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[] | null>(null);
  const [caseId, setCaseId] = useState('');
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');

  const bridgeOk = hasBridge();

  useEffect(() => {
    if (!bridgeOk) return;
    listCases()
      .then((list) => {
        setCases(list);
        if (list.length > 0) setCaseId((current) => current || list[0].id);
      })
      .catch((err) => setError(errorMessage(err)));
  }, [bridgeOk]);

  useEffect(() => {
    if (!caseId) return;
    let cancelled = false;
    getDashboardStats(caseId)
      .then((data) => {
        if (cancelled) return;
        setStats(data);
        setError('');
      })
      .catch((err) => {
        if (cancelled) return;
        setError(errorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [caseId]);

  const severityData = useMemo(() => {
    if (!stats) return [];
    return SEV_ORDER.map((severity) => ({
      severity,
      count: stats.severity_distribution?.[severity] ?? 0,
    })).filter((entry) => entry.count > 0);
  }, [stats]);

  const iocData = useMemo(() => {
    if (!stats) return [];
    return Object.entries(stats.ioc_type_distribution ?? {}).map(([name, count]) => ({ name, count }));
  }, [stats]);

  const risk = stats?.risk ?? {};
  const riskScore = risk.risk_score;
  const hasRisk = typeof riskScore === 'number';
  const recommendations = useMemo(() => {
    const list = risk.recommendations ?? [];
    return [...list].sort((a, b) => priorityRank(a.priority) - priorityRank(b.priority));
  }, [risk.recommendations]);

  if (!bridgeOk) {
    return (
      <div className="page">
        <NoticeBar kind="error" message={BRIDGE_HINT} />
      </div>
    );
  }

  if (cases === null) {
    return (
      <div className="page">
        {error ? <NoticeBar kind="error" message={error} /> : <Spinner label="Loading cases…" />}
      </div>
    );
  }

  if (cases.length === 0) {
    return (
      <div className="page">
        <header className="page-head">
          <div>
            <h1 className="page-title">Overview</h1>
            <p className="page-sub">Investigation posture across all cases.</p>
          </div>
        </header>
        {error ? <NoticeBar kind="error" message={error} /> : null}
        <EmptyState
          title="No cases yet"
          hint="Create your first case to start importing and triaging evidence."
          action={
            <button className="btn btn-primary" type="button" onClick={() => navigate('/cases')}>
              Create a case
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="page dashboard-page">
      <div className="dashboard-orbit" aria-hidden="true">
        <span className="orbit-core" />
        <span className="orbit-ring orbit-ring-inner" />
        <span className="orbit-ring orbit-ring-outer" />
        <span className="orbit-satellite" />
      </div>
      <header className="page-head">
        <div>
          <h1 className="page-title">Overview</h1>
          <p className="page-sub">Investigation posture for the selected case.</p>
        </div>
        <div className="page-actions">
          <select
            className="select"
            value={caseId}
            onChange={(event) => setCaseId(event.target.value)}
            aria-label="Select case"
          >
            {cases.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.id} — {entry.name}
              </option>
            ))}
          </select>
          <button className="btn" type="button" onClick={() => navigate('/cases')}>
            Manage cases
          </button>
          <button className="btn btn-primary" type="button" onClick={() => navigate(`/cases/${caseId}`)}>
            Open case
          </button>
        </div>
      </header>

      {error ? <NoticeBar kind="error" message={error} /> : null}
      {!stats && !error ? <Spinner label="Loading dashboard…" /> : null}

      {stats ? (
        <>
          <div className="stat-grid">
            <StatCard label="Evidence items" value={stats.evidence_count} />
            <StatCard label="Artifacts" value={stats.artifact_count} />
            <StatCard label="IOC findings" value={stats.ioc_count} tone={stats.ioc_count > 0 ? 'warn' : undefined} />
            <StatCard label="Timeline events" value={stats.timeline_events} />
            <StatCard label="High severity" value={stats.high_risk_count} tone="orange" />
            <StatCard label="Critical severity" value={stats.critical_count} tone="red" />
          </div>

          <div className="grid-2">
            <Panel
              title="Composite risk"
              actions={hasRisk ? <SeverityBadge severity={risk.severity} /> : undefined}
            >
              {hasRisk ? (
                <div className="score-row">
                  <ScoreGauge score={riskScore ?? 0} severity={risk.severity} />
                  <div className="risk-meta">
                    <div className="kv">
                      <span className="kv-label">ML anomaly score</span>
                      <span className="kv-value mono">{(risk.ml_score ?? 0).toFixed(2)} / 100</span>
                    </div>
                    <div className="kv">
                      <span className="kv-label">Generated</span>
                      <span className="kv-value">{formatDateTime(risk.created_at ?? stats.case.updated_at)}</span>
                    </div>
                    <h3 className="mini-head">Why this score</h3>
                    <ul className="risk-reasons">
                      {(risk.reasons ?? []).map((reason) => (
                        <li key={reason}>{reason}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ) : (
                <EmptyState
                  title="No analysis yet"
                  hint="Import evidence and run the analysis engine to compute a composite risk score."
                  action={
                    <button className="btn btn-primary" type="button" onClick={() => navigate(`/cases/${caseId}`)}>
                      Go to case
                    </button>
                  }
                />
              )}
            </Panel>

            <Panel title="Artifact severity distribution">
              {severityData.length > 0 ? (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={severityData}>
                      <CartesianGrid stroke={CHART_GRID} vertical={false} />
                      <XAxis dataKey="severity" tick={CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} width={32} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {severityData.map((entry) => (
                          <Cell key={entry.severity} fill={SEVERITY_COLORS[entry.severity] ?? '#64748b'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="No artifacts" hint="Run an analysis to populate severity data." />
              )}
            </Panel>
          </div>

          <div className="grid-2">
            <Panel title="Timeline activity (events per day)">
              {(stats.timeline_activity ?? []).length > 0 ? (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height={220}>
                    <AreaChart data={stats.timeline_activity}>
                      <defs>
                        <linearGradient id="activity" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.55} />
                          <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={CHART_GRID} vertical={false} />
                      <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} width={32} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} />
                      <Area type="monotone" dataKey="count" stroke="#38bdf8" strokeWidth={2} fill="url(#activity)" />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="No timeline events" hint="Timeline activity appears after an analysis run." />
              )}
            </Panel>

            <Panel title="IOC types">
              {iocData.length > 0 ? (
                <div className="chart-box">
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={iocData} layout="vertical" margin={{ left: 8, right: 12 }}>
                      <CartesianGrid stroke={CHART_GRID} horizontal={false} />
                      <XAxis type="number" allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={CHART_TICK} axisLine={false} tickLine={false} width={78} />
                      <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
                      <Bar dataKey="count" fill="#a78bfa" radius={[0, 6, 6, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="No IOCs" hint="No indicators of compromise were extracted for this case." />
              )}
            </Panel>
          </div>

          <Panel title={`Recommendations${recommendations.length > 0 ? ` (${recommendations.length})` : ''}`}>
            {recommendations.length > 0 ? (
              <ul className="reco-list">
                {recommendations.map((reco, index) => (
                  <li className="reco-item" key={`${reco.trigger}-${index}`}>
                    <PriorityBadge priority={reco.priority} />
                    <div>
                      <div className="reco-text">{reco.recommendation}</div>
                      <div className="reco-trigger muted">Trigger: {reco.trigger}</div>
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyState
                title="No recommendations yet"
                hint="Run the analysis engine to generate investigator guidance."
              />
            )}
          </Panel>
        </>
      ) : null}
    </div>
  );
}
