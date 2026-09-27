"""Composite risk scoring engine."""
from typing import Dict, List


SEVERITY_MAP = {
    'CRITICAL': 4,
    'HIGH': 3,
    'MEDIUM': 2,
    'LOW': 1,
    'UNKNOWN': 0,
}


def score_to_severity(score: int) -> str:
    if score >= 81:
        return 'CRITICAL'
    elif score >= 61:
        return 'HIGH'
    elif score >= 31:
        return 'MEDIUM'
    else:
        return 'LOW'


def compute_risk(
    iocs: List[Dict],
    file_findings: List[Dict],
    log_findings: List[Dict],
    network_anomalies: List[Dict],
    ml_score: float,
) -> Dict:
    """
    Compute a composite risk score (0-100) with explanation.

    Sources:
    - IOC matches (up to 30 points)
    - File suspicious findings (up to 25 points)
    - Log suspicious patterns (up to 20 points)
    - Network anomalies (up to 15 points)
    - ML anomaly score (up to 10 points)
    """
    reasons = []
    score = 0

    # --- IOC contribution (max 30) ---
    ioc_score = 0
    high_risk_iocs = [i for i in iocs if i.get('risk') in ('HIGH', 'CRITICAL')]
    medium_risk_iocs = [i for i in iocs if i.get('risk') == 'MEDIUM']
    if high_risk_iocs:
        ioc_score += min(20, len(high_risk_iocs) * 8)
        reasons.append(f'{len(high_risk_iocs)} high-risk IOC(s) detected')
    if medium_risk_iocs:
        ioc_score += min(10, len(medium_risk_iocs) * 3)
        reasons.append(f'{len(medium_risk_iocs)} medium-risk IOC(s) detected')
    if iocs and not high_risk_iocs and not medium_risk_iocs:
        ioc_score += min(5, len(iocs))
        reasons.append(f'{len(iocs)} potential IOC pattern(s) detected')
    score += min(30, ioc_score)

    # --- File findings contribution (max 25) ---
    file_score = 0
    critical_files = [f for f in file_findings if f.get('severity') in ('CRITICAL', 'HIGH')]
    medium_files = [f for f in file_findings if f.get('severity') == 'MEDIUM']
    if critical_files:
        file_score += min(18, len(critical_files) * 6)
        reasons.append(f'{len(critical_files)} suspicious file(s) (HIGH/CRITICAL severity)')
    if medium_files:
        file_score += min(7, len(medium_files) * 2)
        reasons.append(f'{len(medium_files)} moderately suspicious file(s)')
    score += min(25, file_score)

    # --- Log findings contribution (max 20) ---
    log_score = 0
    for pattern in log_findings:
        sev = pattern.get('severity', 'LOW')
        if sev == 'HIGH':
            log_score += 8
            reasons.append(f"Log: {pattern.get('pattern', 'Suspicious pattern')}")
        elif sev == 'MEDIUM':
            log_score += 4
            reasons.append(f"Log: {pattern.get('pattern', 'Pattern')}")
    score += min(20, log_score)

    # --- Network anomalies (max 15) ---
    net_score = 0
    for anomaly in network_anomalies:
        sev = anomaly.get('severity', 'LOW')
        if sev == 'HIGH':
            net_score += 6
            reasons.append(f"Network: {anomaly.get('type', 'Anomaly')}")
        elif sev == 'MEDIUM':
            net_score += 3
    score += min(15, net_score)

    # --- ML anomaly score (max 10) ---
    ml_contribution = round(ml_score / 10, 1)
    score += min(10, ml_contribution)
    if ml_score > 60:
        reasons.append(f'ML anomaly score: {ml_score:.1f}/100 (statistically unusual behavior)')

    score = min(100, max(0, int(score)))
    severity = score_to_severity(score)
    reasons = list(dict.fromkeys(reasons))

    return {
        'risk_score': score,
        'severity': severity,
        'reasons': reasons,
        'ml_score': round(ml_score, 2),
        'breakdown': {
            'ioc_contribution': min(30, ioc_score),
            'file_contribution': min(25, file_score),
            'log_contribution': min(20, log_score),
            'network_contribution': min(15, net_score),
            'ml_contribution': min(10, ml_contribution),
        }
    }
