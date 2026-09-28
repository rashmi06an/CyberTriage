export interface Case {
  id: string;
  name: string;
  description: string;
  investigator: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Evidence {
  id: string;
  case_id: string;
  filename: string;
  filepath: string;
  type: string;
  size: number;
  sha256: string;
  md5: string;
  imported_at: string;
  analysis_status: string;
}

export interface FileFinding {
  type: string;
  description: string;
  severity: string;
}

export interface ArtifactValue {
  name?: string;
  path?: string;
  extension?: string;
  size?: number;
  modified?: string;
  severity?: string;
  findings?: FileFinding[];
  anomaly_score?: number;
  is_anomaly?: boolean;
  anomaly_features?: Record<string, number>;
  failed_login_count?: number;
  unique_ip_count?: number;
  [key: string]: unknown;
}

export interface Artifact {
  id: string;
  case_id: string;
  evidence_id: string;
  artifact_type: string;
  name: string;
  value: ArtifactValue;
  timestamp: string;
  source: string;
  severity: string;
  description: string;
  created_at: string;
}

export interface IOC {
  id: string;
  case_id: string;
  evidence_id: string;
  ioc_type: string;
  value: string;
  source: string;
  first_seen: string;
  risk: string;
  status: string;
  explanation: string;
}

export interface TimelineEvent {
  id: string;
  case_id: string;
  timestamp: string;
  event_type: string;
  source: string;
  severity: string;
  description: string;
  ioc_related: number;
}

export interface NetworkRecord {
  id: string;
  case_id: string;
  timestamp: string;
  source_ip: string;
  destination_ip: string;
  source_port: number;
  destination_port: number;
  protocol: string;
  bytes: number;
  anomaly_flag: number;
}

export interface Recommendation {
  trigger: string;
  recommendation: string;
  priority: string;
}

export interface RiskFinding {
  id: string;
  case_id: string;
  risk_score: number;
  severity: string;
  reasons: string[];
  ml_score: number;
  recommendations: Recommendation[];
  created_at: string;
  breakdown?: Record<string, number>;
}

export interface LogPattern {
  pattern: string;
  description: string;
  severity: string;
}

export interface NetworkAnomaly {
  type: string;
  description: string;
  severity: string;
}

export interface AnalysisResult {
  artifacts_count: number;
  iocs_count: number;
  timeline_events: number;
  risk: RiskFinding;
  recommendations: Recommendation[];
  ml_score: number;
  log_patterns: LogPattern[];
  network_anomalies: NetworkAnomaly[];
}

export interface DashboardStats {
  case: Case;
  evidence_count: number;
  artifact_count: number;
  ioc_count: number;
  high_risk_count: number;
  critical_count: number;
  timeline_events: number;
  risk: Partial<RiskFinding>;
  severity_distribution: Record<string, number>;
  ioc_type_distribution: Record<string, number>;
  timeline_activity: Array<{ date: string; count: number }>;
}

export interface EngineState {
  state: 'starting' | 'ready' | 'stopped' | 'error';
  detail: string;
}
