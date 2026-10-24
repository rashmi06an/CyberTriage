"""
Core CyberTriage analysis orchestrator.
"""
import os
import re
import uuid
import json
import sqlite3
import hashlib
import secrets
import tempfile
from datetime import datetime
from typing import Dict, List, Optional

from utils.hashing import sha256_file, md5_file
from utils.db import rows_to_list, row_to_dict
from parsers.file_parser import analyze_file, scan_directory
from parsers.log_parser import parse_logs, parse_csv_logs
from parsers.network_parser import analyze_network, parse_network_csv, parse_network_json
from parsers.disk_image import is_disk_image, read_disk_image
from parsers.registry import is_registry_hive, parse_hive
from ioc.detector import detect_iocs
from ml.anomaly_detector import run_anomaly_detection, get_top_anomalies
from risk.scorer import compute_risk
from recommendations.engine import generate_recommendations
from timeline.builder import build_timeline
from reports.generator import generate_pdf, generate_json_export, generate_csv_exports


class CaseAnalyzer:
    def __init__(self, db: sqlite3.Connection, sample_dir: Optional[str] = None, reports_dir: Optional[str] = None):
        self.db = db
        source_root = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..')
        self.sample_dir = sample_dir or os.path.join(source_root, 'sample-data')
        self.reports_dir = reports_dir or os.path.join(source_root, 'python', 'reports_output')

    def _audit(self, case_id: str, action: str, details: str = ''):
        self.db.execute(
            'INSERT INTO audit_log (case_id, action, details, timestamp) VALUES (?, ?, ?, ?)',
            (case_id, action, details, datetime.now().isoformat())
        )
        self.db.commit()

    # ─── User Accounts ──────────────────────────────────────────────────

    _USERNAME_RE = re.compile(r'^[a-zA-Z0-9_.-]{3,24}$')

    @staticmethod
    def _hash_pw(salt: str, password: str) -> str:
        """Salted SHA-256 — matches the earlier client-side scheme so migrated accounts still work."""
        return hashlib.sha256(f'{salt}:{password}'.encode('utf-8')).hexdigest()

    @staticmethod
    def _user_public(row) -> Dict:
        return {'username': row['username'], 'display_name': row['display_name'], 'avatar': row['avatar']}

    def signup_user(self, username: str, password: str, display_name: str = '', avatar: str = '') -> Dict:
        username = (username or '').strip()
        if not username:
            return {'error': 'Choose a username.'}
        if not self._USERNAME_RE.match(username):
            return {'error': 'Username must be 3–24 characters: letters, numbers, dot, dash or underscore.'}
        if not password:
            return {'error': 'Choose a password.'}
        if len(password) < 6:
            return {'error': 'Password must be at least 6 characters.'}
        if self.db.execute('SELECT 1 FROM users WHERE username=? COLLATE NOCASE', (username,)).fetchone():
            return {'error': 'That username already exists on this machine. Pick a different one so each account keeps its own cases.'}

        salt = secrets.token_hex(16)
        ph = self._hash_pw(salt, password)
        dn = (display_name or username).strip()[:40] or username
        self.db.execute(
            'INSERT INTO users (username, display_name, salt, password_hash, avatar, created_at) VALUES (?,?,?,?,?,?)',
            (username, dn, salt, ph, avatar or None, datetime.now().isoformat())
        )
        self.db.commit()
        return {'username': username, 'display_name': dn, 'avatar': avatar or None}

    def login_user(self, username: str, password: str) -> Dict:
        username = (username or '').strip()
        if not username or not password:
            return {'error': 'Enter your username and password.'}
        row = self.db.execute(
            'SELECT username, display_name, salt, password_hash, avatar FROM users WHERE username=? COLLATE NOCASE',
            (username,)
        ).fetchone()
        if not row:
            return {'error': 'No account found with that username.'}
        if self._hash_pw(row['salt'], password) != row['password_hash']:
            return {'error': 'Incorrect password.'}
        return self._user_public(row)

    def update_user_profile(self, username: str, display_name: Optional[str] = None,
                            avatar: Optional[str] = None) -> Dict:
        if not self.db.execute('SELECT 1 FROM users WHERE username=? COLLATE NOCASE', (username,)).fetchone():
            return {'error': 'Account not found.'}
        fields, vals = [], []
        if display_name is not None:
            fields.append('display_name=?'); vals.append((display_name.strip()[:40]) or username)
        if avatar is not None:
            fields.append('avatar=?'); vals.append(avatar or None)
        if fields:
            vals.append(username)
            self.db.execute(f'UPDATE users SET {", ".join(fields)} WHERE username=? COLLATE NOCASE', vals)
            self.db.commit()
        row = self.db.execute(
            'SELECT username, display_name, avatar FROM users WHERE username=? COLLATE NOCASE', (username,)
        ).fetchone()
        return self._user_public(row)

    def import_legacy_users(self, users: List[Dict]) -> Dict:
        """One-time migration of accounts that previously lived in the browser's localStorage.
        They already carry a salt + SHA-256 hash in the same scheme, so they migrate as-is."""
        imported = 0
        for u in users or []:
            uname = (u.get('username') or '').strip()
            salt, ph = u.get('salt'), u.get('hash')
            if not uname or not salt or not ph:
                continue
            if self.db.execute('SELECT 1 FROM users WHERE username=? COLLATE NOCASE', (uname,)).fetchone():
                continue
            self.db.execute(
                'INSERT INTO users (username, display_name, salt, password_hash, avatar, created_at) VALUES (?,?,?,?,?,?)',
                (uname, (u.get('displayName') or uname)[:40], salt, ph, u.get('avatar'),
                 u.get('createdAt') or datetime.now().isoformat())
            )
            imported += 1
        self.db.commit()
        return {'imported': imported}

    # ─── Case Management ───────────────────────────────────────────────

    def create_case(self, name: str, description: str = '', investigator: str = 'Student Investigator',
                    owner: str = '') -> Dict:
        now = datetime.now().isoformat()
        case_id = f'CT-{datetime.now().strftime("%Y")}-{str(uuid.uuid4())[:6].upper()}'
        self.db.execute(
            'INSERT INTO cases (id, name, description, investigator, owner, status, created_at, updated_at) VALUES (?,?,?,?,?,?,?,?)',
            (case_id, name, description, investigator, owner or '', 'Open', now, now)
        )
        self.db.commit()
        self._audit(case_id, 'Case created', f'Name: {name}')
        return self.get_case(case_id)

    def list_cases(self, owner: Optional[str] = None) -> List[Dict]:
        """List cases. owner=None returns everything (CLI); any string (even '')
        scopes to that owner so a signed-in user never sees another account's cases."""
        if owner is not None:
            rows = self.db.execute(
                'SELECT * FROM cases WHERE owner=? ORDER BY created_at DESC', (owner,)
            ).fetchall()
        else:
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

    def update_case(self, case_id: str, name: Optional[str] = None, description: Optional[str] = None,
                    investigator: Optional[str] = None, status: Optional[str] = None) -> Dict:
        existing = self.get_case(case_id)
        if not existing:
            return {'error': f'Case not found: {case_id}'}
        fields = []
        values = []
        if name is not None and name.strip():
            fields.append('name=?'); values.append(name.strip())
        if description is not None:
            fields.append('description=?'); values.append(description.strip())
        if investigator is not None and investigator.strip():
            fields.append('investigator=?'); values.append(investigator.strip())
        if status is not None and status.strip():
            fields.append('status=?'); values.append(status.strip())
        if not fields:
            return existing
        fields.append('updated_at=?'); values.append(datetime.now().isoformat())
        values.append(case_id)
        self.db.execute(f'UPDATE cases SET {", ".join(fields)} WHERE id=?', values)
        self.db.commit()
        self._audit(case_id, 'Case updated', f'Fields: {", ".join(f.split("=")[0] for f in fields[:-1])}')
        return self.get_case(case_id)

    # ─── Case Deletion ──────────────────────────────────────────────────

    _DERIVED_TABLES = ('artifacts', 'ioc_findings', 'timeline_events', 'network_activity',
                       'risk_findings', 'evidence', 'audit_log')

    def delete_case(self, case_id: str) -> Dict:
        if not self.get_case(case_id):
            return {'error': f'Case not found: {case_id}'}
        for table in self._DERIVED_TABLES:
            self.db.execute(f'DELETE FROM {table} WHERE case_id=?', (case_id,))
        self.db.execute('DELETE FROM cases WHERE id=?', (case_id,))
        self.db.commit()
        return {'deleted': 1, 'case_id': case_id}

    def delete_cases(self, case_ids: List[str]) -> Dict:
        deleted = 0
        for cid in case_ids:
            if self.get_case(cid):
                for table in self._DERIVED_TABLES:
                    self.db.execute(f'DELETE FROM {table} WHERE case_id=?', (cid,))
                self.db.execute('DELETE FROM cases WHERE id=?', (cid,))
                deleted += 1
        self.db.commit()
        return {'deleted': deleted, 'requested': len(case_ids)}

    def reset_app(self) -> Dict:
        """Factory reset — wipe every case and all derived data."""
        counts = {}
        # Child tables first, then cases last — foreign_keys=ON would otherwise
        # reject deleting a case that still has evidence/artifacts referencing it.
        for table in ('artifacts', 'ioc_findings', 'timeline_events', 'network_activity',
                      'risk_findings', 'evidence', 'audit_log', 'cases', 'users'):
            try:
                counts[table] = self.db.execute(f'SELECT COUNT(*) FROM {table}').fetchone()[0]
                self.db.execute(f'DELETE FROM {table}')
            except Exception:
                counts[table] = 0
        self.db.commit()
        try:
            self.db.execute('VACUUM')
        except Exception:
            pass
        return {'reset': True, 'cleared': counts}

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
        for table in ('artifacts', 'ioc_findings', 'timeline_events', 'network_activity', 'risk_findings'):
            self.db.execute(f'DELETE FROM {table} WHERE case_id=?', (case_id,))
        self.db.commit()

        buckets = {
            'files': [],        # all_file_artifacts
            'log_events': [],
            'log_patterns': [],
            'network_records': [],
            'iocs': [],
            'network_anomalies': [],
            'registry': [],      # registry findings (also feed risk/artifacts)
        }

        for ev in evidence_list:
            fpath = ev['filepath']
            ev_id = ev['id']

            try:
                if is_disk_image(fpath) and os.path.isfile(fpath):
                    # RAW forensic image: carve its filesystem, analyse every file inside.
                    extracted = read_disk_image(fpath)
                    tmpdir = tempfile.mkdtemp(prefix='ct_img_')
                    for item in extracted:
                        safe = item['name'].replace('/', '__').replace('\\', '__')
                        tpath = os.path.join(tmpdir, safe)
                        try:
                            with open(tpath, 'wb') as out:
                                out.write(item['data'])
                            self._process_file(tpath, ev_id, buckets, display_name=item['name'])
                        except Exception:
                            pass
                elif os.path.isdir(fpath):
                    file_results = scan_directory(fpath)
                    for fr in file_results:
                        fr['evidence_id'] = ev_id
                        fr['id'] = str(uuid.uuid4())
                    buckets['files'].extend(file_results)
                else:
                    self._process_file(fpath, ev_id, buckets)

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

        all_file_artifacts = buckets['files']
        all_log_events = buckets['log_events']
        all_log_patterns = buckets['log_patterns']
        all_network_records = buckets['network_records']
        all_ioc_findings = buckets['iocs']
        all_network_anomalies = buckets['network_anomalies']
        all_registry_findings = buckets['registry']

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

    def _process_file(self, fpath: str, ev_id: str, buckets: Dict, display_name: Optional[str] = None):
        """Analyse a single file (loose, or carved from a disk image)."""
        name = display_name or os.path.basename(fpath)
        ext = os.path.splitext(name)[1].lower()

        # Registry hives (including those carved out of a disk image)
        if is_registry_hive(fpath):
            self._process_registry(fpath, ev_id, buckets, name)
            return

        if ext in {'.csv', '.log', '.txt'} and os.path.isfile(fpath):
            with open(fpath, 'r', errors='replace') as f:
                content = f.read(1_000_000)
            log_result = parse_csv_logs(content, name) if ext == '.csv' else parse_logs(content, name)
            buckets['log_events'].extend(log_result.get('events', []))
            buckets['log_patterns'].extend(log_result.get('suspicious_patterns', []))
            fa = analyze_file(fpath)
            fa['evidence_id'] = ev_id
            fa['id'] = str(uuid.uuid4())
            fa['name'] = name
            fa['failed_login_count'] = log_result.get('failed_login_count', 0)
            fa['unique_ip_count'] = len(log_result.get('unique_ips', []))
            buckets['files'].append(fa)
            for ioc in detect_iocs(content, name):
                ioc['evidence_id'] = ev_id
                ioc['first_seen'] = datetime.now().isoformat()
                buckets['iocs'].append(ioc)
        elif ext == '.json' and os.path.isfile(fpath):
            with open(fpath, 'r', errors='replace') as f:
                content = f.read()
            try:
                net_records = parse_network_json(content)
                if net_records:
                    buckets['network_records'].extend(net_records)
                    buckets['network_anomalies'].extend(analyze_network(net_records).get('anomalies', []))
            except Exception:
                pass
            for ioc in detect_iocs(content, name):
                ioc['evidence_id'] = ev_id
                ioc['first_seen'] = datetime.now().isoformat()
                buckets['iocs'].append(ioc)
            fa = analyze_file(fpath)
            fa['evidence_id'] = ev_id
            fa['id'] = str(uuid.uuid4())
            fa['name'] = name
            buckets['files'].append(fa)
        else:
            fa = analyze_file(fpath)
            fa['evidence_id'] = ev_id
            fa['id'] = str(uuid.uuid4())
            fa['name'] = name
            if fa.get('full_content'):
                for ioc in detect_iocs(fa['full_content'], name):
                    ioc['evidence_id'] = ev_id
                    ioc['first_seen'] = datetime.now().isoformat()
                    buckets['iocs'].append(ioc)
            buckets['files'].append(fa)

    def _process_registry(self, fpath: str, ev_id: str, buckets: Dict, display_name: str):
        """Parse a Windows registry hive and surface autostart/persistence findings."""
        try:
            res = parse_hive(fpath)
        except Exception as e:
            buckets['files'].append({
                'id': str(uuid.uuid4()), 'evidence_id': ev_id, 'name': display_name,
                'severity': 'LOW', 'artifact_type': 'Registry', 'size': 0,
                'is_hidden': False, 'is_executable': False, 'modified': datetime.now().isoformat(),
                'findings': [{'type': 'Registry', 'description': f'Could not parse hive: {e}', 'severity': 'LOW'}],
                'source': 'Registry Analysis',
            })
            return
        for f in res['findings']:
            buckets['registry'].append(f)
            buckets['files'].append({
                'id': str(uuid.uuid4()), 'evidence_id': ev_id,
                'name': f"{display_name}: {f['key']}\\{f['name']}",
                'severity': f['severity'], 'artifact_type': 'Registry', 'size': 0,
                'is_hidden': False, 'is_executable': False, 'modified': datetime.now().isoformat(),
                'findings': [{
                    'type': 'Registry Autostart',
                    'description': f"{f['description']}  Value: {f['value']}",
                    'severity': f['severity'],
                }],
                'source': 'Registry Analysis',
            })
        for ioc in detect_iocs(res['text'], display_name):
            ioc['evidence_id'] = ev_id
            ioc['first_seen'] = datetime.now().isoformat()
            buckets['iocs'].append(ioc)

    def _store_artifact(self, art: Dict, art_id: str, case_id: str, evidence_id: str):
        try:
            stored = {
                k: v for k, v in art.items()
                if k in ('findings', 'anomaly_features')
                or (k not in ('full_content', 'content_preview') and not isinstance(v, (list, dict)))
            }
            artifact_type = art.get('artifact_type', 'File')
            self.db.execute(
                'INSERT OR IGNORE INTO artifacts (id, evidence_id, case_id, artifact_type, name, value, timestamp, source, severity, description, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
                (art_id, evidence_id, case_id, artifact_type,
                 str(art.get('name', ''))[:200],
                 json.dumps(stored, default=str),
                 str(art.get('modified', art.get('created', datetime.now().isoformat())))[:19],
                 art.get('source', 'File Analysis'),
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

    def get_global_stats(self, owner: Optional[str] = None) -> Dict:
        """Aggregate statistics for a user's cases — powers the Home dashboard.

        When an owner is given, every metric is scoped to the cases that account
        owns, so a brand-new account starts with an empty dashboard.
        """
        # Case ids visible to this request. owner=None → all (CLI); any string → scoped.
        if owner is not None:
            owned_ids = [r[0] for r in self.db.execute('SELECT id FROM cases WHERE owner=?', (owner,)).fetchall()]
        else:
            owned_ids = [r[0] for r in self.db.execute('SELECT id FROM cases').fetchall()]

        empty = {
            'total_cases': 0, 'analyzed_cases': 0, 'total_evidence': 0, 'total_artifacts': 0,
            'total_iocs': 0, 'total_timeline': 0, 'total_network': 0, 'high_severity': 0,
            'critical_severity': 0, 'avg_risk_score': 0, 'highest_risk_case': None,
            'severity_distribution': {}, 'ioc_type_distribution': {}, 'status_distribution': {},
            'risk_band_distribution': {}, 'recent_cases': [], 'cases_over_time': [],
        }
        if not owned_ids:
            return empty

        ph = ','.join('?' * len(owned_ids))

        def scalar(q, params=()):
            row = self.db.execute(q, params).fetchone()
            return row[0] if row else 0

        total_cases = len(owned_ids)
        total_evidence = scalar(f'SELECT COUNT(*) FROM evidence WHERE case_id IN ({ph})', owned_ids)
        total_artifacts = scalar(f'SELECT COUNT(*) FROM artifacts WHERE case_id IN ({ph})', owned_ids)
        total_iocs = scalar(f'SELECT COUNT(*) FROM ioc_findings WHERE case_id IN ({ph})', owned_ids)
        total_timeline = scalar(f'SELECT COUNT(*) FROM timeline_events WHERE case_id IN ({ph})', owned_ids)
        total_network = scalar(f'SELECT COUNT(*) FROM network_activity WHERE case_id IN ({ph})', owned_ids)
        high_severity = scalar(f"SELECT COUNT(*) FROM artifacts WHERE severity='HIGH' AND case_id IN ({ph})", owned_ids)
        critical_severity = scalar(f"SELECT COUNT(*) FROM artifacts WHERE severity='CRITICAL' AND case_id IN ({ph})", owned_ids)
        analyzed_cases = scalar(f"SELECT COUNT(DISTINCT case_id) FROM risk_findings WHERE case_id IN ({ph})", owned_ids)

        # Severity distribution across the owner's artifacts
        severity_distribution = {}
        for row in self.db.execute(f'SELECT severity, COUNT(*) FROM artifacts WHERE case_id IN ({ph}) GROUP BY severity', owned_ids).fetchall():
            severity_distribution[row[0]] = row[1]

        # IOC type distribution
        ioc_type_distribution = {}
        for row in self.db.execute(f'SELECT ioc_type, COUNT(*) FROM ioc_findings WHERE case_id IN ({ph}) GROUP BY ioc_type', owned_ids).fetchall():
            ioc_type_distribution[row[0]] = row[1]

        # Cases by status
        status_distribution = {}
        for row in self.db.execute(f'SELECT status, COUNT(*) FROM cases WHERE id IN ({ph}) GROUP BY status', owned_ids).fetchall():
            status_distribution[row[0]] = row[1]

        # Latest risk score per case
        latest_risk = {}
        for row in self.db.execute(
            f'SELECT case_id, risk_score, severity, MAX(created_at) FROM risk_findings WHERE case_id IN ({ph}) GROUP BY case_id',
            owned_ids
        ).fetchall():
            latest_risk[row[0]] = {'risk_score': row[1], 'severity': row[2]}

        scores = [v['risk_score'] for v in latest_risk.values()]
        avg_risk = round(sum(scores) / len(scores), 1) if scores else 0

        # Risk-band distribution (by latest per-case severity)
        risk_band_distribution = {}
        for v in latest_risk.values():
            sev = v.get('severity') or 'UNKNOWN'
            risk_band_distribution[sev] = risk_band_distribution.get(sev, 0) + 1

        # Recent cases (newest first) with their latest risk
        recent_cases = []
        for row in self.db.execute(
            f'SELECT id, name, investigator, status, created_at, updated_at FROM cases WHERE id IN ({ph}) ORDER BY created_at DESC LIMIT 8',
            owned_ids
        ).fetchall():
            c = dict(row)
            risk = latest_risk.get(c['id'], {})
            c['risk_score'] = risk.get('risk_score')
            c['risk_severity'] = risk.get('severity')
            c['evidence_count'] = scalar('SELECT COUNT(*) FROM evidence WHERE case_id=?', (c['id'],))
            recent_cases.append(c)

        # Cases created per day ("uploaded till date")
        cases_over_time = []
        for row in self.db.execute(
            f"SELECT substr(created_at,1,10) AS day, COUNT(*) FROM cases WHERE id IN ({ph}) GROUP BY day ORDER BY day",
            owned_ids
        ).fetchall():
            cases_over_time.append({'date': row[0], 'count': row[1]})

        highest = None
        if latest_risk:
            top_id = max(latest_risk, key=lambda k: latest_risk[k]['risk_score'])
            top_case = self.get_case(top_id)
            if top_case:
                highest = {
                    'id': top_id,
                    'name': top_case.get('name', ''),
                    'risk_score': latest_risk[top_id]['risk_score'],
                    'severity': latest_risk[top_id]['severity'],
                }

        return {
            'total_cases': total_cases,
            'analyzed_cases': analyzed_cases,
            'total_evidence': total_evidence,
            'total_artifacts': total_artifacts,
            'total_iocs': total_iocs,
            'total_timeline': total_timeline,
            'total_network': total_network,
            'high_severity': high_severity,
            'critical_severity': critical_severity,
            'avg_risk_score': avg_risk,
            'highest_risk_case': highest,
            'severity_distribution': severity_distribution,
            'ioc_type_distribution': ioc_type_distribution,
            'status_distribution': status_distribution,
            'risk_band_distribution': risk_band_distribution,
            'recent_cases': recent_cases,
            'cases_over_time': cases_over_time,
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
            os.makedirs(self.reports_dir, exist_ok=True)
            ts = datetime.now().strftime('%Y%m%d_%H%M%S')
            output_path = os.path.join(self.reports_dir, f'CyberTriage_Report_{case_id}_{ts}.{format}')

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
        already_imported = {ev.get('filepath') for ev in self.get_evidence(case_id)}
        imported = []
        for subdir in ['files', 'logs', 'network']:
            path = os.path.join(self.sample_dir, subdir)
            if os.path.isdir(path):
                for fname in os.listdir(path):
                    fpath = os.path.join(path, fname)
                    if os.path.isfile(fpath) and fpath not in already_imported:
                        result = self.import_evidence(case_id, fpath)
                        imported.append(result)
        return {'imported': len(imported), 'items': imported}
