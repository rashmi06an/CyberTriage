CREATE TABLE IF NOT EXISTS cases (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  investigator TEXT,
  status TEXT DEFAULT 'Open',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS evidence (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  filename TEXT NOT NULL,
  filepath TEXT NOT NULL,
  type TEXT,
  size INTEGER,
  sha256 TEXT,
  md5 TEXT,
  imported_at TEXT NOT NULL,
  analysis_status TEXT DEFAULT 'Pending',
  FOREIGN KEY (case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS artifacts (
  id TEXT PRIMARY KEY,
  evidence_id TEXT NOT NULL,
  case_id TEXT NOT NULL,
  artifact_type TEXT NOT NULL,
  name TEXT,
  value TEXT,
  timestamp TEXT,
  source TEXT,
  severity TEXT DEFAULT 'LOW',
  description TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (evidence_id) REFERENCES evidence(id),
  FOREIGN KEY (case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS ioc_findings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  evidence_id TEXT,
  ioc_type TEXT NOT NULL,
  value TEXT NOT NULL,
  source TEXT,
  first_seen TEXT,
  risk TEXT DEFAULT 'UNKNOWN',
  status TEXT DEFAULT 'Detected',
  explanation TEXT,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS risk_findings (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  evidence_id TEXT,
  risk_score INTEGER DEFAULT 0,
  severity TEXT DEFAULT 'LOW',
  reasons TEXT,
  ml_score REAL DEFAULT 0,
  recommendations TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS timeline_events (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  timestamp TEXT NOT NULL,
  event_type TEXT,
  source TEXT,
  artifact_id TEXT,
  severity TEXT DEFAULT 'LOW',
  description TEXT,
  ioc_related INTEGER DEFAULT 0,
  risk_score INTEGER DEFAULT 0,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  case_id TEXT,
  action TEXT NOT NULL,
  details TEXT,
  timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS network_activity (
  id TEXT PRIMARY KEY,
  case_id TEXT NOT NULL,
  evidence_id TEXT,
  timestamp TEXT,
  source_ip TEXT,
  destination_ip TEXT,
  source_port INTEGER,
  destination_port INTEGER,
  protocol TEXT,
  bytes INTEGER,
  anomaly_flag INTEGER DEFAULT 0,
  FOREIGN KEY (case_id) REFERENCES cases(id)
);
