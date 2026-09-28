import { Link } from 'react-router-dom';

const WORKFLOW = [
  {
    number: '01',
    title: 'Create an investigation',
    text: 'Open Cases and give the investigation a clear name, a short description, and an investigator name.',
  },
  {
    number: '02',
    title: 'Add evidence',
    text: 'Open the case and choose Import evidence. You can also load the bundled sample dataset for a guided demo.',
  },
  {
    number: '03',
    title: 'Run triage',
    text: 'Select Run analysis. The local analysis engine extracts artifacts, IOCs, timeline events, network records, and risk findings.',
  },
  {
    number: '04',
    title: 'Review and export',
    text: 'Use the case tabs to review results, then export a PDF, JSON, or CSV report for discussion or documentation.',
  },
];

const RESULT_AREAS = [
  ['Artifacts', 'Files and parsed records with rule-based observations and anomaly scores.'],
  ['IOCs', 'Potential indicators such as domains, hashes, IP addresses, or suspicious values.'],
  ['Timeline', 'Events arranged by time so you can understand the investigation sequence.'],
  ['Network', 'Imported connection records, including any activity marked anomalous.'],
  ['Risk', 'A composite score, the signals behind it, and suggested next investigative steps.'],
];

export default function Help() {
  return (
    <div className="page help-page">
      <section className="help-hero">
        <div className="help-hero-copy">
          <p className="eyebrow">CyberTriage field guide</p>
          <h1 className="page-title">From evidence to a focused investigation.</h1>
          <p className="help-lede">
            CyberTriage keeps a local case record, analyzes the evidence you select, and presents the results in one investigator
            workspace.
          </p>
          <div className="page-actions">
            <Link className="btn btn-primary" to="/cases">
              Open cases
            </Link>
            <Link className="btn" to="/">
              View overview
            </Link>
          </div>
        </div>
        <div className="help-signal" aria-hidden="true">
          <div className="signal-ring signal-ring-one" />
          <div className="signal-ring signal-ring-two" />
          <div className="signal-ring signal-ring-three" />
          <div className="signal-core" />
        </div>
      </section>

      <section className="help-section">
        <div className="section-heading">
          <p className="eyebrow">Start here</p>
          <h2>Investigation workflow</h2>
          <p>Use this sequence for a complete first analysis.</p>
        </div>
        <div className="workflow-grid">
          {WORKFLOW.map((step) => (
            <article className="workflow-card" key={step.number}>
              <span className="workflow-number">{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid-2 help-grid">
        <section className="help-card">
          <div className="section-heading compact">
            <p className="eyebrow">Understand results</p>
            <h2>What each tab means</h2>
          </div>
          <dl className="result-list">
            {RESULT_AREAS.map(([label, description]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{description}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section className="help-card">
          <div className="section-heading compact">
            <p className="eyebrow">Good practice</p>
            <h2>Use findings carefully</h2>
          </div>
          <ul className="help-checklist">
            <li>Keep the original evidence files unchanged and work from copies where possible.</li>
            <li>Use filters and search to narrow a large result set before drawing conclusions.</li>
            <li>Treat anomaly scores and IOC matches as leads to investigate, not proof of malicious activity.</li>
            <li>Export reports after your review. Re-running analysis replaces the previous derived findings.</li>
          </ul>
        </section>
      </div>

      <section className="help-card help-troubleshooting">
        <div className="section-heading compact">
          <p className="eyebrow">Need a hand?</p>
          <h2>Quick troubleshooting</h2>
        </div>
        <div className="troubleshooting-grid">
          <div>
            <h3>Engine unavailable</h3>
            <p>Start the desktop shell with <code>npm run electron:dev</code>, not the browser-only Vite command.</p>
          </div>
          <div>
            <h3>No findings after analysis</h3>
            <p>Confirm that evidence was imported first. Safe or small files may also produce no high-risk findings.</p>
          </div>
          <div>
            <h3>Want a clean demo?</h3>
            <p>Create a new case, load sample data, run analysis, then review Risk and Timeline before exporting a report.</p>
          </div>
        </div>
      </section>
    </div>
  );
}
