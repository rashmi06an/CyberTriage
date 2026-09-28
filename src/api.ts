import type {
  AnalysisResult,
  Artifact,
  Case,
  DashboardStats,
  EngineState,
  Evidence,
  IOC,
  NetworkRecord,
  RiskFinding,
  TimelineEvent,
} from './types';

interface EngineMessage<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

export interface CtApi {
  ping: () => Promise<string>;
  engineRequest: <T>(action: string, payload?: Record<string, unknown>) => Promise<EngineMessage<T>>;
  engineStatus: () => Promise<EngineState>;
  engineRestart: () => Promise<EngineState>;
  onEngineState: (callback: (state: EngineState) => void) => () => void;
  pickEvidence: () => Promise<string[]>;
  saveReportDialog: (defaultName: string) => Promise<string | null>;
  revealPath: (targetPath: string) => Promise<void>;
}

declare global {
  interface Window {
    api?: CtApi;
  }
}

export const BRIDGE_HINT =
  'Desktop bridge unavailable — run the app with "npm run electron:dev". ' +
  'The browser-only dev server (npm run dev) cannot reach the Python analysis engine.';

export function hasBridge(): boolean {
  return Boolean(window.api);
}

function bridge(): CtApi {
  if (!window.api) throw new Error(BRIDGE_HINT);
  return window.api;
}

async function call<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const message = await bridge().engineRequest<T>(action, payload);
  if (!message.ok) throw new Error(message.error ?? `Engine call failed: ${action}`);
  const result = message.result;
  if (result && typeof result === 'object' && 'error' in result && (result as { error?: unknown }).error) {
    throw new Error(String((result as { error?: unknown }).error));
  }
  return result as T;
}

export const engineStatus = () => bridge().engineStatus();
export const restartEngine = () => bridge().engineRestart();
export const onEngineState = (callback: (state: EngineState) => void) =>
  window.api ? window.api.onEngineState(callback) : () => {};
export const pickEvidence = () => bridge().pickEvidence();
export const saveReportDialog = (defaultName: string) => bridge().saveReportDialog(defaultName);
export const revealPath = (targetPath: string) => bridge().revealPath(targetPath);

export const listCases = () => call<Case[]>('list_cases');
export const createCase = (name: string, description: string, investigator: string) =>
  call<Case>('create_case', { name, description, investigator });
export const getCase = (caseId: string) => call<Case>('get_case', { case_id: caseId });
export const getEvidence = (caseId: string) => call<Evidence[]>('get_evidence', { case_id: caseId });
export const importEvidence = (caseId: string, filePath: string) =>
  call<Evidence>('import_evidence', { case_id: caseId, file_path: filePath });
export const loadSampleData = (caseId: string) =>
  call<{ imported: number; items: Evidence[] }>('load_sample_data', { case_id: caseId });
export const runAnalysis = (caseId: string) => call<AnalysisResult>('run_analysis', { case_id: caseId });
export const getArtifacts = (caseId: string) => call<Artifact[]>('get_artifacts', { case_id: caseId });
export const getIocs = (caseId: string) => call<IOC[]>('get_iocs', { case_id: caseId });
export const getTimeline = (caseId: string) => call<TimelineEvent[]>('get_timeline', { case_id: caseId });
export const getRiskFindings = (caseId: string) => call<RiskFinding[]>('get_risk_findings', { case_id: caseId });
export const getNetworkActivity = (caseId: string) =>
  call<NetworkRecord[]>('get_network_activity', { case_id: caseId });
export const getDashboardStats = (caseId: string) => call<DashboardStats>('get_dashboard_stats', { case_id: caseId });
export const generateReport = (caseId: string, format: 'pdf' | 'json' | 'csv', outputPath: string) =>
  call<{ path: string; format: string }>('generate_report', { case_id: caseId, format, output_path: outputPath });
