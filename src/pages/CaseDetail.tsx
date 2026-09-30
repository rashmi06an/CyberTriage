import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  BRIDGE_HINT,
  generateReport,
  getArtifacts,
  getCase,
  getDashboardStats,
  getEvidence,
  getIocs,
  getNetworkActivity,
  getRiskFindings,
  getTimeline,
  hasBridge,
  importEvidence,
  loadSampleData,
  pickEvidence,
  revealPath,
  runAnalysis,
  saveReportDialog,
} from '../api';
import { FilterChips, EmptyState, NoticeBar, Panel, ScoreGauge, SeverityBadge, Spinner, StatCard } from '../components/ui';
import { NetworkGraph } from '../components/NetworkGraph';
import { RISK_ORDER, SEV_ORDER } from '../constants';
import { errorMessage, formatBytes, formatDateTime, formatTime, shortHash, statusSlug } from '../format';
import type {
  AnalysisResult,
  Artifact,
  Case,
  DashboardStats,
  Evidence,
  IOC,
  NetworkRecord,
  RiskFinding,
  TimelineEvent,
} from '../types';

const TABS = ['evidence', 'artifacts', 'iocs', 'timeline', 'network', 'risk'] as const;
type Tab = (typeof TABS)[number];

const TAB_LABELS: Record<Tab, string> = {
  evidence: 'Evidence',
  artifacts: 'Artifacts',
  iocs: 'IOCs',
  timeline: 'Timeline',
  network: 'Network',
  risk: 'Risk',
};

const SEV_FILTERS = ['ALL', ...SEV_ORDER];
const RISK_FILTERS = ['ALL', ...RISK_ORDER];

const BREAKDOWN_MAX: Record<string, number> = {
  ioc_contribution: 30,
  file_contribution: 25,
  log_contribution: 20,
  network_contribution: 15,
  ml_contribution: 10,
};

interface Notice {
  kind: 'info' | 'error';
  message: string;
  path?: string;
}

function settled<T>(result: PromiseSettledResult<T>): T | undefined {
  return result.status === 'fulfilled' ? result.value : undefined;
}

function timestampDay(value: string | undefined): string {
  return (value ?? '').slice(0, 10) || 'Unknown date';
}

export default function CaseDetail() {
  const { caseId = '' } = useParams();
  const [caseData, setCaseData] = useState<Case | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [iocs, setIocs] = useState<IOC[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [riskFindings, setRiskFindings] = useState<RiskFinding[]>([]);
  const [network, setNetwork] = useState<NetworkRecord[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [tab, setTab] = useState<Tab>('evidence');
  const [sevFilter, setSevFilter] = useState('ALL');
  const [riskFilter, setRiskFilter] = useState('ALL');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const bridgeOk = hasBridge();

  const refresh = useCallback(() => {
    if (!bridgeOk || !caseId) return Promise.resolve();
    return Promise.allSettled([
      getCase(caseId),
      getEvidence(caseId),
      getArtifacts(caseId),
      getIocs(caseId),
      getTimeline(caseId),
      getRiskFindings(caseId),
      getNetworkActivity(caseId),
      getDashboardStats(caseId),
    ]).then(
      ([caseResult, evidenceResult, artifactResult, iocResult, timelineResult, riskResult, networkResult, statsResult]) => {
        const caseValue = settled(caseResult);
        if (caseValue && caseValue.id) {
          setCaseData(caseValue);
          setNotFound(false);
        } else if (caseValue) {
          setNotFound(true);
        }

        const failed = [
          caseResult,
          evidenceResult,
          artifactResult,
          iocResult,
          timelineResult,
          riskResult,
          networkResult,
          statsResult,
        ].find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failed) setNotice({ kind: 'error', message: errorMessage(failed.reason) });

        setEvidence(settled(evidenceResult) ?? []);
        setArtifacts(settled(artifactResult) ?? []);
        setIocs(settled(iocResult) ?? []);
        setTimeline(settled(timelineResult) ?? []);
        setRiskFindings(settled(riskResult) ?? []);
        setNetwork(settled(networkResult) ?? []);
        setStats(settled(statsResult) ?? null);
        setLoading(false);
      }
    );
  }, [bridgeOk, caseId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const withBusy = async (key: string, task: () => Promise<void>) => {
    setBusy(key);
    setNotice(null);
    try {
      await task();
    } catch (err) {
      setNotice({ kind: 'error', message: errorMessage(err) });
    } finally {
      setBusy('');
    }
  };

  const handleImport = () =>
    withBusy('import', async () => {
      const paths = await pickEvidence();
      if (paths.length === 0) return;
      for (const filePath of paths) {
        await importEvidence(caseId, filePath);
      }
      await refresh();
      setNotice({ kind: 'info', message: `Imported ${paths.length} evidence item(s). Run the analysis when ready.` });
    });

  const handleSample = () =>
    withBusy('sample', async () => {
      const result = await loadSampleData(caseId);
      await refresh();
      setNotice({
        kind: 'info',
        message:
          result.imported > 0
            ? `Loaded ${result.imported} sample evidence file(s) from sample-data/.`
            : 'No sample files found — the sample-data/ folder is empty.',
      });
    });

  const handleAnalyze = () =>
    withBusy('analyze', async () => {
      const result = await runAnalysis(caseId);
      setAnalysis(result);
      await refresh();
      setTab('risk');
      setNotice({
        kind: 'info',
        message: `Analysis complete — ${result.artifacts_count} artifacts, ${result.iocs_count} IOC(s), risk ${result.risk.risk_score}/100 (${result.risk.severity}).`,
      });
    });

  const handleExport = (format: 'pdf' | 'json' | 'csv') =>
    withBusy(`export-${format}`, async () => {
      const chosen = await saveReportDialog(`${caseId}_report.${format}`);
      if (!chosen) return;
      const outputPath = chosen.toLowerCase().endsWith(`.${format}`) ? chosen : `${chosen}.${format}`;
      const result = await generateReport(caseId, format, outputPath);
      setNotice({ kind: 'info', message: `Report saved to ${result.path}`, path: result.path });
    });

  const sevCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: artifacts.length };
    for (const artifact of artifacts) {
      const key = (artifact.severity ?? 'UNKNOWN').toUpperCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [artifacts]);

  const iocCounts = useMemo(() => {
    const counts: Record<string, number> = { ALL: iocs.length };
    for (const ioc of iocs) {
      const key = (ioc.risk ?? 'UNKNOWN').toUpperCase();
      counts[key] = (counts[key] ?? 0) + 1;
    }
    return counts;
  }, [iocs]);

  const query = search.trim().toLowerCase();

  const filteredArtifacts = useMemo(
    () =>
      artifacts.filter((artifact) => {
        const severity = (artifact.severity ?? 'UNKNOWN').toUpperCase();
        if (sevFilter !== 'ALL' && severity !== sevFilter) return false;
        if (!query) return true;
        return `${artifact.name} ${artifact.description} ${artifact.artifact_type} ${artifact.source}`
          .toLowerCase()
          .includes(query);
      }),
    [artifacts, query, sevFilter]
  );

  const filteredIocs = useMemo(
    () =>
      iocs.filter((ioc) => {
        const risk = (ioc.risk ?? 'UNKNOWN').toUpperCase();
        if (riskFilter !== 'ALL' && risk !== riskFilter) return false;
        if (!query) return true;
        return `${ioc.value} ${ioc.ioc_type} ${ioc.source} ${ioc.explanation}`.toLowerCase().includes(query);
      }),
    [iocs, query, riskFilter]
  );

  const filteredTimeline = useMemo(
    () =>
      timeline.filter((event) => {
        const severity = (event.severity ?? 'UNKNOWN').toUpperCase();
        if (sevFilter !== 'ALL' && severity !== sevFilter) return false;
        if (!query) return true;
        return `${event.description} ${event.event_type} ${event.source}`.toLowerCase().includes(query);
      }),
    [query, sevFilter, timeline]
  );

  const timelineDays = useMemo(() => {
    const groups = new Map<string, TimelineEvent[]>();
    for (const event of filteredTimeline) {
      const day = timestampDay(event.timestamp);
      const bucket = groups.get(day);
      if (bucket) bucket.push(event);
      else groups.set(day, [event]);
    }
    return Array.from(groups.entries());
  }, [filteredTimeline]);

  const counts: Record<Tab, number> = {
    evidence: evidence.length,
    artifacts: artifacts.length,
    iocs: iocs.length,
    timeline: timeline.length,
    network: network.length,
    risk: riskFindings.length,
  };

  if (!bridgeOk) {
    return (
      <div className="page">
        <NoticeBar kind="error" message={BRIDGE_HINT} />
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="page">
        <EmptyState
          title="Case not found"
          hint={`No case with ID ${caseId} exists in the case database.`}
          action={
            <Link className="btn btn-primary" to="/cases">
              Back to cases
            </Link>
          }
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="page">
        <Spinner label="Loading case…" />
      </div>
    );
  }

  if (!caseData) {
    return (
      <div className="page">
        {notice ? <NoticeBar kind={notice.kind} message={notice.message} /> : null}
        <EmptyState
          title="Case unavailable"
          hint="The case could not be loaded from the analysis engine."
          action={
            <Link className="btn" to="/cases">
              Back to cases
            </Link>
          }
        />
      </div>
    );
  }

  const latestRisk = riskFindings[0];
  const noticePath = notice?.path;

  return (
    <div className="page">
      <header className="case-head">
        <div>
          <div className="breadcrumb">
            <Link to="/cases">Cases</Link>
            <span>/</span>
            <span className="mono">{caseData.id}</span>
          </div>
          <h1 className="page-title">{caseData.name}</h1>
          <p className="page-sub">
            {caseData.investigator} · created {formatDateTime(caseData.created_at)} ·{' '}
            <span className={`badge status-${statusSlug(caseData.status)}`}>{caseData.status}</span>
            {latestRisk ? (
              <>
                {' '}
                · <SeverityBadge severity={latestRisk.severity} />
              </>
            ) : null}
          </p>
          {caseData.description ? <p className="case-desc">{caseData.description}</p> : null}
        </div>
        <div className="toolbar">
          <button className="btn" type="button" disabled={busy !== ''} onClick={() => void handleImport()}>
            {busy === 'import' ? 'Importing…' : 'Import evidence'}
          </button>
          <button className="btn" type="button" disabled={busy !== ''} onClick={() => void handleSample()}>
            {busy === 'sample' ? 'Loading…' : 'Load sample data'}
          </button>
          <button className="btn btn-primary" type="button" disabled={busy !== ''} onClick={() => void handleAnalyze()}>
            {busy === 'analyze' ? 'Analyzing…' : 'Run analysis'}
          </button>
          {(['pdf', 'json', 'csv'] as const).map((format) => (
            <button
              key={format}
              className="btn"
              type="button"
              disabled={busy !== ''}
              onClick={() => void handleExport(format)}
            >
              {busy === `export-${format}` ? 'Exporting…' : `Export ${format.toUpperCase()}`}
            </button>
          ))}
        </div>
      </header>

      {notice ? (
        <NoticeBar
          kind={notice.kind}
          message={notice.message}
          action={
            noticePath ? (
              <button className="btn btn-mini" type="button" onClick={() => void revealPath(noticePath)}>
                Reveal in Finder
              </button>
            ) : undefined
          }
        />
      ) : null}

      {stats ? (
        <div className="stat-grid">
          <StatCard label="Evidence items" value={stats.evidence_count} />
          <StatCard label="Artifacts" value={stats.artifact_count} />
          <StatCard label="IOC findings" value={stats.ioc_count} tone={stats.ioc_count > 0 ? 'warn' : undefined} />
          <StatCard label="Timeline events" value={stats.timeline_events} />
          <StatCard label="High severity" value={stats.high_risk_count} tone="orange" />
          <StatCard label="Critical severity" value={stats.critical_count} tone="red" />
        </div>
      ) : null}

      <nav className="tabs">
        {TABS.map((entry) => (
          <button
            key={entry}
            type="button"
            className={`tab${entry === tab ? ' tab-active' : ''}`}
            onClick={() => setTab(entry)}
          >
            {TAB_LABELS[entry]}
            <span className="tab-count">{counts[entry]}</span>
          </button>
        ))}
      </nav>

      {tab === 'artifacts' || tab === 'iocs' || tab === 'timeline' ? (
        <div className="filter-row">
          <FilterChips
            options={tab === 'iocs' ? RISK_FILTERS : SEV_FILTERS}
            value={tab === 'iocs' ? riskFilter : sevFilter}
            onChange={tab === 'iocs' ? setRiskFilter : setSevFilter}
            counts={tab === 'iocs' ? iocCounts : sevCounts}
          />
          <input
            className="search-input"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search…"
            aria-label="Search findings"
          />
        </div>
      ) : null}

      {tab === 'evidence' ? (
        <Panel title="Evidence register">
          {evidence.length === 0 ? (
            <EmptyState
              title="No evidence imported"
              hint="Import files, folders, or load the bundled sample dataset to begin triage."
              action={
                <button className="btn btn-primary" type="button" onClick={() => void handleImport()}>
                  Import evidence
                </button>
              }
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Size</th>
                    <th>SHA-256</th>
                    <th>Imported</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {evidence.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <div className="cell-main">{item.filename}</div>
                        <div className="cell-sub mono">{item.filepath}</div>
                      </td>
                      <td>{item.type}</td>
                      <td>{item.size ? formatBytes(item.size) : '—'}</td>
                      <td className="mono">{shortHash(item.sha256, 20)}</td>
                      <td>{formatDateTime(item.imported_at)}</td>
                      <td>
                        <span className={`badge status-${statusSlug(item.analysis_status)}`}>{item.analysis_status}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === 'artifacts' ? (
        <Panel title={`File artifacts (${filteredArtifacts.length})`}>
          {filteredArtifacts.length === 0 ? (
            <EmptyState
              title={artifacts.length === 0 ? 'No artifacts yet' : 'No artifacts match the filter'}
              hint={artifacts.length === 0 ? 'Run the analysis engine to generate file artifacts.' : undefined}
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Artifact</th>
                    <th>Severity</th>
                    <th>ML anomaly</th>
                    <th>Findings</th>
                    <th>Modified</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredArtifacts.map((artifact) => (
                    <tr key={artifact.id}>
                      <td>
                        <div className="cell-main">{artifact.name}</div>
                        <div className="cell-sub mono">{String(artifact.value.path ?? artifact.source)}</div>
                      </td>
                      <td>
                        <SeverityBadge severity={artifact.severity} />
                      </td>
                      <td>
                        {typeof artifact.value.anomaly_score === 'number' ? (
                          <span className={`ml-score${artifact.value.is_anomaly ? ' ml-score-flag' : ''}`}>
                            {artifact.value.anomaly_score.toFixed(1)}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td>
                        {(artifact.value.findings ?? []).length > 0 ? (
                          <ul className="finding-list">
                            {(artifact.value.findings ?? []).map((finding, index) => (
                              <li key={`${finding.type}-${index}`}>
                                <SeverityBadge severity={finding.severity} />
                                <span>{finding.description}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <span className="muted">{artifact.description || 'No rule-based findings.'}</span>
                        )}
                      </td>
                      <td>{formatDateTime(String(artifact.value.modified ?? artifact.timestamp))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === 'iocs' ? (
        <Panel title={`Indicators of compromise (${filteredIocs.length})`}>
          {filteredIocs.length === 0 ? (
            <EmptyState
              title={iocs.length === 0 ? 'No IOCs yet' : 'No IOCs match the filter'}
              hint={iocs.length === 0 ? 'Run the analysis engine to extract indicators from the evidence.' : undefined}
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Indicator</th>
                    <th>Type</th>
                    <th>Risk</th>
                    <th>Source</th>
                    <th>Explanation</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIocs.map((ioc) => (
                    <tr key={ioc.id}>
                      <td className="mono ioc-value">{ioc.value}</td>
                      <td>{ioc.ioc_type}</td>
                      <td>
                        <SeverityBadge severity={ioc.risk} />
                      </td>
                      <td className="cell-sub mono">{ioc.source}</td>
                      <td>{ioc.explanation}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>
      ) : null}

      {tab === 'timeline' ? (
        <Panel title={`Interactive timeline (${filteredTimeline.length})`}>
          {timelineDays.length === 0 ? (
            <EmptyState
              title={timeline.length === 0 ? 'No timeline events yet' : 'No events match the filter'}
              hint={timeline.length === 0 ? 'Run the analysis engine to build the timeline.' : undefined}
            />
          ) : (
            <div className="timeline">
              {timelineDays.map(([day, events]) => (
                <div className="timeline-day" key={day}>
                  <div className="day-head">{day}</div>
                  {events.map((event) => (
                    <div className="timeline-item" key={event.id}>
                      <div className="timeline-time mono">{formatTime(event.timestamp)}</div>
                      <div className="timeline-body">
                        <div className="timeline-title">
                          <SeverityBadge severity={event.severity} />
                          <span>{event.event_type}</span>
                          {event.ioc_related ? <span className="badge ioc-flag">IOC</span> : null}
                        </div>
                        <div className="timeline-desc">{event.description}</div>
                        <div className="timeline-meta muted mono">{event.source}</div>
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </Panel>
      ) : null}

      {tab === 'network' ? (
        <>
          {network.length > 0 ? (
            <Panel title="Network topology map">
              <NetworkGraph records={network} />
            </Panel>
          ) : null}
          <Panel title={`Network activity (${network.length})`}>
          {network.length === 0 ? (
            <EmptyState
              title="No network records"
              hint="Import a network capture export (CSV or JSON) and re-run the analysis."
            />
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Source</th>
                    <th>Destination</th>
                    <th>Port</th>
                    <th>Protocol</th>
                    <th>Bytes</th>
                  </tr>
                </thead>
                <tbody>
                  {network.map((record) => (
                    <tr key={record.id} className={record.anomaly_flag ? 'row-anomaly' : undefined}>
                      <td className="mono">{formatDateTime(record.timestamp)}</td>
                      <td className="mono">{record.source_ip}</td>
                      <td className="mono">
                        {record.destination_ip}
                        {record.anomaly_flag ? <span className="badge prio-high">flagged</span> : null}
                      </td>
                      <td className="mono">{record.destination_port || '—'}</td>
                      <td>{record.protocol || '—'}</td>
                      <td>{record.bytes ? formatBytes(record.bytes) : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </Panel>
        </>
      ) : null}

      {tab === 'risk' ? (
        <>
          {latestRisk ? (
            <div className="grid-2">
              <Panel title="Composite risk score" actions={<SeverityBadge severity={latestRisk.severity} />}>
                <div className="score-row">
                  <ScoreGauge score={latestRisk.risk_score} severity={latestRisk.severity} />
                  <div className="risk-meta">
                    <div className="kv">
                      <span className="kv-label">ML anomaly score</span>
                      <span className="kv-value mono">{(latestRisk.ml_score ?? 0).toFixed(2)} / 100</span>
                    </div>
                    <div className="kv">
                      <span className="kv-label">Generated</span>
                      <span className="kv-value">{formatDateTime(latestRisk.created_at)}</span>
                    </div>
                    <h3 className="mini-head">Why this score</h3>
                    <ul className="risk-reasons">
                      {(latestRisk.reasons ?? []).map((reason, index) => (
                        <li key={`${reason}-${index}`}>{reason}</li>
                      ))}
                    </ul>
                    {analysis?.risk.breakdown ? (
                      <div className="breakdown">
                        {Object.entries(analysis.risk.breakdown).map(([key, value]) => (
                          <div className="breakdown-row" key={key}>
                            <span className="breakdown-label">{key.replace(/_/g, ' ').replace(' contribution', '')}</span>
                            <div className="bar-track">
                              <div
                                className="bar-fill"
                                style={{ width: `${Math.min(100, (value / (BREAKDOWN_MAX[key] ?? 10)) * 100)}%` }}
                              />
                            </div>
                            <span className="breakdown-value mono">
                              {value}/{BREAKDOWN_MAX[key] ?? 10}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              </Panel>

              <Panel title={`Recommendations (${(latestRisk.recommendations ?? []).length})`}>
                {(latestRisk.recommendations ?? []).length > 0 ? (
                  <ul className="reco-list">
                    {(latestRisk.recommendations ?? []).map((reco, index) => (
                      <li className="reco-item" key={`${reco.trigger}-${index}`}>
                        <span className={`badge prio-${(reco.priority ?? 'low').toLowerCase()}`}>{reco.priority}</span>
                        <div>
                          <div className="reco-text">{reco.recommendation}</div>
                          <div className="reco-trigger muted">Trigger: {reco.trigger}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <EmptyState title="No recommendations stored" />
                )}
              </Panel>
            </div>
          ) : (
            <EmptyState
              title="No risk findings yet"
              hint="Run the analysis engine to compute the composite risk score and recommendations."
              action={
                <button className="btn btn-primary" type="button" onClick={() => void handleAnalyze()}>
                  Run analysis
                </button>
              }
            />
          )}

          {analysis && analysis.log_patterns.length > 0 ? (
            <Panel title={`Log patterns from the latest run (${analysis.log_patterns.length})`}>
              <ul className="reco-list">
                {analysis.log_patterns.map((pattern, index) => (
                  <li className="reco-item" key={`${pattern.pattern}-${index}`}>
                    <SeverityBadge severity={pattern.severity} />
                    <div>
                      <div className="reco-text">{pattern.pattern}</div>
                      <div className="reco-trigger muted">{pattern.description}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}

          {analysis && analysis.network_anomalies.length > 0 ? (
            <Panel title={`Network anomalies from the latest run (${analysis.network_anomalies.length})`}>
              <ul className="reco-list">
                {analysis.network_anomalies.map((anomaly, index) => (
                  <li className="reco-item" key={`${anomaly.type}-${index}`}>
                    <SeverityBadge severity={anomaly.severity} />
                    <div>
                      <div className="reco-text">{anomaly.type}</div>
                      <div className="reco-trigger muted">{anomaly.description}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </Panel>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
