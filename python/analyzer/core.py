"""
Core CyberTriage analysis orchestrator.
"""
import os
import uuid
import json
import sqlite3
from datetime import datetime
from typing import Dict, List, Optional

from utils.hashing import sha256_file, md5_file
from utils.db import rows_to_list, row_to_dict
from parsers.file_parser import analyze_file, scan_directory
from parsers.log_parser import parse_logs, parse_csv_logs
from parsers.network_parser import analyze_network, parse_network_csv, parse_network_json
from ioc.detector import detect_iocs
from ml.anomaly_detector import run_anomaly_detection, get_top_anomalies
from risk.scorer import compute_risk
from recommendations.engine import generate_recommendations
from timeline.builder import build_timeline
from reports.generator import generate_pdf, generate_json_export, generate_csv_exports


class CaseAnalyzer:
    def __init__(self, db: sqlite3.Connection):
        self.db = db

    def _audit(self, case_id: str, action: str, details: str = ''):
        self.db.execute(
            'INSERT INTO audit_log (case_id, action, details, timestamp) VALUES (?, ?, ?, ?)',
            (case_id, action, details, datetime.now().isoformat())
        )
        self.db.commit()

    # ─── Case Management ───────────────────────────────────────────────

    def create_case(self, name: str, description: str = '', investigator: str = 'Student Investigator') -> Dict:
        now = datetime.now().isoformat()
        case_id = f'CT-{datetime.now().strftime("%Y")}-{str(uuid.uuid4())[:6].upper()}'
        self.db.execute(
            'INSERT INTO cases (id, name, description, investigator, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?)',
            (case_id, name, description, investigator, 'Open', now, now)
        )
        self.db.commit()
        self._audit(case_id, 'Case created', f'Name: {name}')
        return self.get_case(case_id)

    def list_cases(self) -> List[Dict]:
        rows = self.db.execute('SELECT * FROM cases ORDER BY created_at DESC').fetchall()
        return rows_to_list(rows)

    def get_case(self, case_id: str) -> Dict:
        row = self.db.execute('SELECT * FROM cases WHERE id=?', (case_id,)).fetchone()
        return row_to_dict(row)

    def _update_case_status(self, case_id: str, status: str):
        self.db.execute(
            'UPDATE cases SET status=?, updated_at=? WHERE id=?',
            (status, datetime.now().isoformat(), case_id)
        )
        self.db.commit()

    # ─── Evidence Import ────────────────────────────────────────────────

    def import_evidence(self, case_id: str, file_path: str) -> Dict:
        if not os.path.exists(file_path):
            return {'error': f'Path does not exist: {file_path}'}

        evidence_id = str(uuid.uuid4())
        now = datetime.now().isoformat()
        filename = os.path.basename(file_path)
        size = os.path.getsize(file_path) if os.path.isfile(file_path) else 0
        file_type = 'directory' if os.path.isdir(file_path) else 'file'

        sha256 = ''
        md5 = ''
        if os.path.isfile(file_path) and size < 500_000_000:
            try:
                sha256 = sha256_file(file_path)
                md5 = md5_file(file_path)
            except Exception:
                pass

        self.db.execute(
            'INSERT INTO evidence (id, case_id, filename, filepath, type, size, sha256, md5, imported_at, analysis_status) VALUES (?,?,?,?,?,?,?,?,?,?)',
            (evidence_id, case_id, filename, file_path, file_type, size, sha256, md5, now, 'Pending')
        )
        self.db.commit()
        self._audit(case_id, 'Evidence imported', f'{filename} ({file_type})')

        return {
            'id': evidence_id,
            'case_id': case_id,
            'filename': filename,
            'filepath': file_path,
            'type': file_type,
            'size': size,
            'sha256': sha256,
            'md5': md5,
            'imported_at': now,
            'analysis_status': 'Pending',
        }

    def get_evidence(self, case_id: str) -> List[Dict]:
        rows = self.db.execute('SELECT * FROM evidence WHERE case_id=?', (case_id,)).fetchall()
        return rows_to_list(rows)

    # ─── Full Analysis ──────────────────────────────────────────────────

    def run_full_analysis(self, case_id: str) -> Dict:
        evidence_list = self.get_evidence(case_id)
        if not evidence_list:
            return {'error': 'No evidence imported for this case.'}

        self._update_case_status(case_id, 'Analyzing')
        self._audit(case_id, 'Analysis started', f'{len(evidence_list)} evidence items')

        # Re-analysis replaces previous derived results instead of duplicating them
        for table in ('artifacts', 'ioc_findings', 'timeline_events', 'network_activity'):
            self.db.execute(f'DELETE FROM {table} WHERE case_id=?', (case_id,))
        self.db.commit()

        all_file_artifacts = []
        all_log_events = []
        all_log_patterns = []
        all_network_records = []
        all_ioc_findings = []
        all_network_anomalies = []

        for ev in evidence_list:
            fpath = ev['filepath']
            ev_id = ev['id']
            ext = os.path.splitext(fpath)[1].lower()

            try:
                if os.path.isdir(fpath):
                    file_results = scan_directory(fpath)
                    for fr in file_results:
                        fr['evidence_id'] = ev_id
                        fr['id'] = str(uuid.uuid4())
                    all_file_artifacts.extend(file_results)
                elif ext in {'.csv', '.log', '.txt'} and os.path.isfile(fpath):
                    with open(fpath, 'r', errors='replace') as f:
                        content = f.read(1_000_000)
                    log_result = parse_csv_logs(content, fpath) if ext == '.csv' else parse_logs(content, fpath)
                    all_log_events.extend(log_result.get('events', []))
                    all_log_patterns.extend(log_result.get('suspicious_patterns', []))
                    # Also analyze as file
                    fa = analyze_file(fpath)
                    fa['evidence_id'] = ev_id
                    fa['id'] = str(uuid.uuid4())
                    fa['failed_login_count'] = log_result.get('failed_login_count', 0)
                    fa['unique_ip_count'] = len(log_result.get('unique_ips', []))
                    all_file_artifacts.append(fa)
                    # IOCs from log content
                    iocs = detect_iocs(content, fpath)
                    for ioc in iocs:
                        ioc['evidence_id'] = ev_id
                        ioc['first_seen'] = datetime.now().isoformat()
                    all_ioc_findings.extend(iocs)
                elif ext == '.json' and os.path.isfile(fpath):
                    with open(fpath, 'r', errors='replace') as f:
                        content = f.read()
                    # Try network JSON
                    try:
                        net_records = parse_network_json(content)
                        if net_records:
                            all_network_records.extend(net_records)
                            net_analysis = analyze_network(net_records)
                            all_network_anomalies.extend(net_analysis.get('anomalies', []))
                    except Exception:
                        pass
                    # IOCs from JSON content
                    iocs = detect_iocs(content, fpath)
                    for ioc in iocs:
                        ioc['evidence_id'] = ev_id
                        ioc['first_seen'] = datetime.now().isoformat()
                    all_ioc_findings.extend(iocs)
                    fa = analyze_file(fpath)
                    fa['evidence_id'] = ev_id
                    fa['id'] = str(uuid.uuid4())
                    all_file_artifacts.append(fa)
                else:
                    fa = analyze_file(fpath)
                    fa['evidence_id'] = ev_id
                    fa['id'] = str(uuid.uuid4())
                    # IOCs from file content
                    if fa.get('full_content'):
                        iocs = detect_iocs(fa['full_content'], fpath)
                        for ioc in iocs:
                            ioc['evidence_id'] = ev_id
                            ioc['first_seen'] = datetime.now().isoformat()
                        all_ioc_findings.extend(iocs)
                    all_file_artifacts.append(fa)

                # Mark evidence as analyzed
                self.db.execute(
                    'UPDATE evidence SET analysis_status=? WHERE id=?',
                    ('Analyzed', ev_id)
                )
                self.db.commit()

            except Exception as e:
                self.db.execute(
                    'UPDATE evidence SET analysis_status=? WHERE id=?',
                    (f'Error: {str(e)[:50]}', ev_id)
                )
                self.db.commit()

        # Run ML anomaly detection on file artifacts
        ml_input = [{
            **fa,
            'failed_login_count': fa.get('failed_login_count', 0),
            'unique_ip_count': fa.get('unique_ip_count', 0),
            'unusual_hour_flag': 0,
            'network_connection_count': len(all_network_records),
            'destination_count': len(set(r.get('destination_ip', '') for r in all_network_records)),
            'event_frequency': len(all_log_events),
        } for fa in all_file_artifacts if not fa.get('error')]

        ml_results = run_anomaly_detection(ml_input) if ml_input else []
        avg_ml_score = sum(r.get('anomaly_score', 0) for r in ml_results) / max(len(ml_results), 1)

        # Store artifacts
        for art in ml_results[:500]:
            art_id = art.get('id') or str(uuid.uuid4())
            self._store_artifact(art, art_id, case_id, art.get('evidence_id', ''))

        # Store IOCs
        seen_ioc_keys = set()
        for ioc in all_ioc_findings:
            key = f"{ioc.get('ioc_type')}:{ioc.get('value')}"
            if key in seen_ioc_keys:
                continue
            seen_ioc_keys.add(key)
            ioc_id = str(uuid.uuid4())
            self.db.execute(
                'INSERT OR IGNORE INTO ioc_findings (id, case_id, evidence_id, ioc_type, value, source, first_seen, risk, status, explanation) VALUES (?,?,?,?,?,?,?,?,?,?)',
                (ioc_id, case_id, ioc.get('evidence_id', ''), ioc.get('ioc_type', ''),
                 str(ioc.get('value', ''))[:500], ioc.get('source', ''),
                 ioc.get('first_seen', datetime.now().isoformat()),
                 ioc.get('risk', 'UNKNOWN'), ioc.get('status', 'Detected'),
                 ioc.get('explanation', ''))
            )
        self.db.commit()

        # Store network activity
        for rec in all_network_records[:2000]:
            rec_id = str(uuid.uuid4())
            try:
                self.db.execute(
                    'INSERT OR IGNORE INTO network_activity (id, case_id, evidence_id, timestamp, source_ip, destination_ip, source_port, destination_port, protocol, bytes, anomaly_flag) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                    (rec_id, case_id, '', str(rec.get('timestamp', '')),
                     str(rec.get('source_ip', rec.get('src_ip', ''))),
                     str(rec.get('destination_ip', rec.get('dst_ip', ''))),
                     int(rec.get('source_port', rec.get('src_port', 0)) or 0),
                     int(rec.get('destination_port', rec.get('dst_port', 0)) or 0),
                     str(rec.get('protocol', '')),
                     int(rec.get('bytes', 0) or 0),
                     1 if rec.get('anomaly_flag') else 0)
                )
            except Exception:
                pass
        self.db.commit()

        # Risk scoring
        file_findings_for_risk = [fa for fa in all_file_artifacts if fa.get('severity') in ('HIGH', 'CRITICAL', 'MEDIUM')]
        risk = compute_risk(
            iocs=all_ioc_findings,
            file_findings=file_findings_for_risk,
            log_findings=all_log_patterns,
            network_anomalies=all_network_anomalies,
            ml_score=avg_ml_score,
        )

        # Store risk finding
        rf_id = str(uuid.uuid4())
        self.db.execute(
            'INSERT INTO risk_findings (id, case_id, risk_score, severity, reasons, ml_score, recommendations, created_at) VALUES (?,?,?,?,?,?,?,?)',
            (rf_id, case_id, risk['risk_score'], risk['severity'],
             json.dumps(risk['reasons']), avg_ml_score, '', datetime.now().isoformat())
        )
        self.db.commit()

        # Recommendations
        recommendations = generate_recommendations(
            risk_finding=risk,
            log_patterns=all_log_patterns,
            file_findings=all_file_artifacts,
            iocs=all_ioc_findings,
            network_anomalies=all_network_anomalies,
            ml_score=avg_ml_score,
        )
        self.db.execute(
            'UPDATE risk_findings SET recommendations=? WHERE id=?',
            (json.dumps(recommendations), rf_id)
        )
        self.db.commit()

        # Timeline
        timeline_events = build_timeline(
            artifacts=ml_results[:200],
            log_events=all_log_events[:500],
            iocs=all_ioc_findings[:100],
            network_records=all_network_records[:100],
            case_id=case_id,
        )
        for evt in timeline_events[:2000]:
            self.db.execute(
                'INSERT OR IGNORE INTO timeline_events (id, case_id, timestamp, event_type, source, artifact_id, severity, description, ioc_related, risk_score) VALUES (?,?,?,?,?,?,?,?,?,?)',
                (evt['id'], case_id, evt.get('timestamp', ''), evt.get('event_type', ''),
                 evt.get('source', ''), evt.get('artifact_id', ''),
                 evt.get('severity', 'LOW'), evt.get('description', '')[:500],
                 evt.get('ioc_related', 0), evt.get('risk_score', 0))
            )
        self.db.commit()

        self._update_case_status(case_id, 'Analysis Complete')
        self._audit(case_id, 'Analysis completed',
                    f'Artifacts: {len(ml_results)}, IOCs: {len(seen_ioc_keys)}, Risk: {risk["risk_score"]}/{risk["severity"]}')

        return {
            'artifacts_count': len(ml_results),
            'iocs_count': len(seen_ioc_keys),
            'timeline_events': len(timeline_events),
            'risk': risk,
            'recommendations': recommendations,
            'ml_score': round(avg_ml_score, 2),
            'log_patterns': all_log_patterns,
            'network_anomalies': all_network_anomalies,
        }

    def _store_artifact(self, art: Dict, art_id: str, case_id: str, evidence_id: str):
        try:
            stored = {
                k: v for k, v in art.items()
                if k in ('findings', 'anomaly_features')
                or (k not in ('full_content', 'content_preview') and not isinstance(v, (list, dict)))
            }
            self.db.execute(
                'INSERT OR IGNORE INTO artifacts (id, evidence_id, case_id, artifact_type, name, value, timestamp, source, severity, description, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                (art_id, evidence_id, case_id, 'File',
                 str(art.get('name', ''))[:200],
                 json.dumps(stored, default=str),
                 str(art.get('modified', art.get('created', datetime.now().isoformat())))[:19],
                 'File Analysis',
                 art.get('severity', 'LOW'),
                 str(art.get('findings', []))[:500],
                 datetime.now().isoformat())
            )
        except Exception:
            pass

    # ─── Getters ────────────────────────────────────────────────────────

    def get_artifacts(self, case_id: str) -> List[Dict]:
        rows = self.db.execute('SELECT * FROM artifacts WHERE case_id=? ORDER BY severity DESC', (case_id,)).fetchall()
        results = rows_to_list(rows)
        for r in results:
            try:
                parsed = json.loads(r.get('value') or '{}')
            except Exception:
                parsed = {}
            r['value'] = parsed if isinstance(parsed, dict) else {'raw': parsed}
        return results

    def get_iocs(self, case_id: str) -> List[Dict]:
        rows = self.db.execute('SELECT * FROM ioc_findings WHERE case_id=? ORDER BY risk DESC', (case_id,)).fetchall()
        return rows_to_list(rows)

    def get_timeline(self, case_id: str) -> List[Dict]:
        rows = self.db.execute('SELECT * FROM timeline_events WHERE case_id=? ORDER BY timestamp ASC', (case_id,)).fetchall()
        return rows_to_list(rows)

    def get_risk_findings(self, case_id: str) -> List[Dict]:
        rows = self.db.execute('SELECT * FROM risk_findings WHERE case_id=? ORDER BY created_at DESC', (case_id,)).fetchall()
        results = rows_to_list(rows)
        for r in results:
            try:
                r['reasons'] = json.loads(r.get('reasons') or '[]')
                r['recommendations'] = json.loads(r.get('recommendations') or '[]')
            except Exception:
                pass
        return results

    def get_network_activity(self, case_id: str) -> List[Dict]:
        rows = self.db.execute('SELECT * FROM network_activity WHERE case_id=? ORDER BY timestamp ASC', (case_id,)).fetchall()
        return rows_to_list(rows)

    def get_dashboard_stats(self, case_id: str) -> Dict:
        case = self.get_case(case_id)
        evidence_count = self.db.execute('SELECT COUNT(*) FROM evidence WHERE case_id=?', (case_id,)).fetchone()[0]
        artifact_count = self.db.execute('SELECT COUNT(*) FROM artifacts WHERE case_id=?', (case_id,)).fetchone()[0]
        ioc_count = self.db.execute('SELECT COUNT(*) FROM ioc_findings WHERE case_id=?', (case_id,)).fetchone()[0]
        high_risk = self.db.execute("SELECT COUNT(*) FROM artifacts WHERE case_id=? AND severity='HIGH'", (case_id,)).fetchone()[0]
        critical_risk = self.db.execute("SELECT COUNT(*) FROM artifacts WHERE case_id=? AND severity='CRITICAL'", (case_id,)).fetchone()[0]
        timeline_count = self.db.execute('SELECT COUNT(*) FROM timeline_events WHERE case_id=?', (case_id,)).fetchone()[0]

        risk_rows = self.db.execute('SELECT risk_score, severity, ml_score, reasons, recommendations FROM risk_findings WHERE case_id=? ORDER BY created_at DESC LIMIT 1', (case_id,)).fetchone()
        risk_data = {}
        if risk_rows:
            risk_data = dict(risk_rows)
            try:
                risk_data['reasons'] = json.loads(risk_data.get('reasons') or '[]')
                risk_data['recommendations'] = json.loads(risk_data.get('recommendations') or '[]')
            except Exception:
                pass

        # Severity distribution
        sev_dist = {}
        for row in self.db.execute('SELECT severity, COUNT(*) as cnt FROM artifacts WHERE case_id=? GROUP BY severity', (case_id,)).fetchall():
            sev_dist[row[0]] = row[1]

        # IOC type distribution
        ioc_dist = {}
        for row in self.db.execute('SELECT ioc_type, COUNT(*) as cnt FROM ioc_findings WHERE case_id=? GROUP BY ioc_type', (case_id,)).fetchall():
            ioc_dist[row[0]] = row[1]

        # Timeline activity by day
        tl_activity = []
        for row in self.db.execute("SELECT substr(timestamp,1,10) as day, COUNT(*) as cnt FROM timeline_events WHERE case_id=? GROUP BY day ORDER BY day", (case_id,)).fetchall():
            tl_activity.append({'date': row[0], 'count': row[1]})

        return {
            'case': case,
            'evidence_count': evidence_count,
            'artifact_count': artifact_count,
            'ioc_count': ioc_count,
            'high_risk_count': high_risk,
            'critical_count': critical_risk,
            'timeline_events': timeline_count,
            'risk': risk_data,
            'severity_distribution': sev_dist,
            'ioc_type_distribution': ioc_dist,
            'timeline_activity': tl_activity,
        }

    # ─── Reports ────────────────────────────────────────────────────────

    def generate_report(self, case_id: str, format: str = 'json', output_path: str = '') -> Dict:
        case = self.get_case(case_id)
        evidence = self.get_evidence(case_id)
        artifacts = self.get_artifacts(case_id)
        iocs = self.get_iocs(case_id)
        risk_findings = self.get_risk_findings(case_id)
        timeline = self.get_timeline(case_id)
        risk = risk_findings[0] if risk_findings else {}
        recommendations = risk.get('recommendations', [])

        if not output_path:
            reports_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'reports_output')
            os.makedirs(reports_dir, exist_ok=True)
            ts = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_path = os.path.join(reports_dir, f'CyberTriage_Report_{case_id}_{ts}.{format}')

        if format == 'pdf':
            path = generate_pdf(case, evidence, artifacts, iocs, risk, recommendations, timeline, output_path)
        elif format == 'json':
            path = generate_json_export(case, evidence, artifacts, iocs, risk, recommendations, timeline, output_path)
        elif format == 'csv':
            csv_dir = output_path.replace('.csv', '_csv')
            paths = generate_csv_exports(artifacts, iocs, timeline, csv_dir)
            path = csv_dir
        else:
            return {'error': f'Unknown format: {format}'}

        self._audit(case_id, 'Report generated', f'Format: {format}, Path: {path}')
        return {'path': str(path), 'format': format}

    # ─── Sample Data ────────────────────────────────────────────────────

    def load_sample_data(self, case_id: str) -> Dict:
        """Load synthetic demo data into the case."""
        sample_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', 'sample-data')
        already_imported = {ev.get('filepath') for ev in self.get_evidence(case_id)}
        imported = []
        for subdir in ['files', 'logs', 'network']:
            path = os.path.join(sample_dir, subdir)
            if os.path.isdir(path):
                for fname in os.listdir(path):
                    fpath = os.path.join(path, fname)
                    if os.path.isfile(fpath) and fpath not in already_imported:
                        result = self.import_evidence(case_id, fpath)
                        imported.append(result)
        return {'imported': len(imported), 'items': imported}
