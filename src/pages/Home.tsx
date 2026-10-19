import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { BRIDGE_HINT, getGlobalStats, hasBridge } from '../api';
import { CHART_GRID, CHART_TICK, SEV_ORDER, SEVERITY_COLORS, TOOLTIP_STYLE } from '../constants';
import { EmptyState, NoticeBar, Panel, SeverityBadge, Spinner, StatCard } from '../components/ui';
import { errorMessage, formatDateTime, statusSlug } from '../format';
import { useAuth } from '../AuthContext';
import type { GlobalStats } from '../types';

const QUICK_ACTIONS = [
  { key: 'new', title: 'New investigation', hint: 'Create a case and import evidence', icon: '＋', to: '/cases' },
  { key: 'cases', title: 'Open cases', hint: 'Review and manage the case register', icon: '▤', to: '/cases' },
  { key: 'help', title: 'Help guide', hint: 'Learn the triage workflow', icon: '✦', to: '/help' },
];

export default function Home() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [stats, setStats] = useState<GlobalStats | null>(null);
  const [error, setError] = useState('');
  const bridgeOk = hasBridge();

  const load = useCallback(() => {
    if (!bridgeOk) return;
    getGlobalStats()
      .then((data) => {
        setStats(data);
        setError('');
      })
      .catch((err) => setError(errorMessage(err)));
  }, [bridgeOk]);

  useEffect(() => {
    load();
  }, [load]);

  const severityData = useMemo(() => {
    if (!stats) return [];
    return SEV_ORDER.map((severity) => ({
      severity,
      count: stats.severity_distribution?.[severity] ?? 0,
    })).filter((e) => e.count > 0);
  }, [stats]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
  }, []);

  const firstName = user?.displayName?.split(' ')[0] ?? 'analyst';

  if (!bridgeOk) {
    return (
      <div className="page">
        <NoticeBar kind="error" message={BRIDGE_HINT} />
      </div>
    );
  }

  const hasCases = (stats?.total_cases ?? 0) > 0;

  return (
    <div className="page home-page">
      <section className="home-hero" data-tour="home-hero">
        <div className="home-hero-text">
          <p className="home-eyebrow">{greeting}</p>
          <h1 className="home-title">
            Welcome back, <span className="accent-text">{firstName}</span>
          </h1>
          <p className="page-sub">
            Your investigation command centre — a live roll-up of every case, artifact and indicator triaged
            on this workstation.
          </p>
        </div>
        <button className="btn btn-primary btn-lg" type="button" onClick={() => navigate('/cases')}>
          ＋ New case
        </button>
      </section>

      <div className="quick-actions" data-tour="quick-actions">
        {QUICK_ACTIONS.map((a) => (
          <button key={a.key} type="button" className="quick-card" onClick={() => navigate(a.to)}>
            <span className="quick-ico" aria-hidden="true">
              {a.icon}
            </span>
            <span className="quick-body">
              <span className="quick-title">{a.title}</span>
              <span className="quick-hint">{a.hint}</span>
            </span>
            <span className="quick-arrow" aria-hidden="true">
              →
            </span>
          </button>
        ))}
      </div>

      {error ? <NoticeBar kind="error" message={error} /> : null}
      {!stats && !error ? <Spinner label="Loading workspace…" /> : null}

      {stats ? (
        <>
          <div className="stat-grid" data-tour="kpis">
            <StatCard label="Cases to date" value={stats.total_cases} />
            <StatCard label="Evidence items" value={stats.total_evidence} />
            <StatCard label="Artifacts" value={stats.total_artifacts} />
            <StatCard
              label="IOC findings"
              value={stats.total_iocs}
              tone={stats.total_iocs > 0 ? 'warn' : undefined}
            />
            <StatCard label="Timeline events" value={stats.total_timeline} />
            <StatCard label="Network records" value={stats.total_network} />
            <StatCard label="High severity" value={stats.high_severity} tone="orange" />
            <StatCard label="Critical severity" value={stats.critical_severity} tone="red" />
          </div>

          {hasCases ? (
            <>
              <div className="grid-2">
                <Panel title="Cases uploaded over time">
                  {stats.cases_over_time.length > 0 ? (
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={stats.cases_over_time}>
                          <defs>
                            <linearGradient id="casesTrend" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#27e9b5" stopOpacity={0.5} />
                              <stop offset="95%" stopColor="#27e9b5" stopOpacity={0.02} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke={CHART_GRID} vertical={false} />
                          <XAxis dataKey="date" tick={CHART_TICK} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} width={32} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} />
                          <Area type="monotone" dataKey="count" stroke="#27e9b5" strokeWidth={2} fill="url(#casesTrend)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState title="No case history yet" />
                  )}
                </Panel>

                <Panel title="Risk posture">
                  <div className="posture">
                    <div className="posture-metric">
                      <span className="posture-value">{stats.avg_risk_score}</span>
                      <span className="posture-label">Avg. case risk</span>
                    </div>
                    <div className="posture-metric">
                      <span className="posture-value">
                        {stats.analyzed_cases}
                        <small>/{stats.total_cases}</small>
                      </span>
                      <span className="posture-label">Cases analysed</span>
                    </div>
                    <div className="posture-divider" aria-hidden="true" />
                    {stats.highest_risk_case ? (
                      <button
                        type="button"
                        className="posture-top"
                        onClick={() => navigate(`/cases/${stats.highest_risk_case!.id}`)}
                      >
                        <span className="posture-top-label">Highest-risk case</span>
                        <span className="posture-top-name">{stats.highest_risk_case.name}</span>
                        <span className="posture-top-score">
                          <SeverityBadge severity={stats.highest_risk_case.severity} />
                          <span className="mono">{stats.highest_risk_case.risk_score}/100</span>
                        </span>
                      </button>
                    ) : (
                      <p className="muted">No analysis has been run yet.</p>
                    )}
                  </div>
                </Panel>
              </div>

              <div className="grid-2">
                <Panel title="Artifact severity (all cases)">
                  {severityData.length > 0 ? (
                    <div className="chart-box">
                      <ResponsiveContainer width="100%" height={220}>
                        <BarChart data={severityData}>
                          <CartesianGrid stroke={CHART_GRID} vertical={false} />
                          <XAxis dataKey="severity" tick={CHART_TICK} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={CHART_TICK} axisLine={false} tickLine={false} width={32} />
                          <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'rgba(148, 163, 184, 0.08)' }} />
                          <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                            {severityData.map((e) => (
                              <Cell key={e.severity} fill={SEVERITY_COLORS[e.severity] ?? '#64748b'} />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : (
                    <EmptyState title="No artifacts yet" hint="Run an analysis to populate severity data." />
                  )}
                </Panel>

                <Panel
                  title="Recent cases"
                  actions={
                    <button className="btn btn-mini" type="button" onClick={() => navigate('/cases')}>
                      View all
                    </button>
                  }
                >
                  {stats.recent_cases.length > 0 ? (
                    <div className="recent-list">
                      {stats.recent_cases.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          className="recent-row"
                          onClick={() => navigate(`/cases/${c.id}`)}
                        >
                          <div className="recent-main">
                            <div className="recent-name">{c.name}</div>
                            <div className="recent-meta mono">
                              {c.id} · {c.evidence_count} evidence · {formatDateTime(c.created_at)}
                            </div>
                          </div>
                          <div className="recent-right">
                            {typeof c.risk_score === 'number' ? (
                              <>
                                <SeverityBadge severity={c.risk_severity} />
                                <span className="mono recent-score">{c.risk_score}</span>
                              </>
                            ) : (
                              <span className={`badge status-${statusSlug(c.status)}`}>{c.status}</span>
                            )}
                          </div>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <EmptyState title="No cases yet" />
                  )}
                </Panel>
              </div>
            </>
          ) : (
            <EmptyState
              title="No cases yet"
              hint="Create your first investigation, then import evidence or load a sample dataset to see your dashboard come alive."
              action={
                <button className="btn btn-primary" type="button" onClick={() => navigate('/cases')}>
                  Create your first case
                </button>
              }
            />
          )}
        </>
      ) : null}
    </div>
  );
}
