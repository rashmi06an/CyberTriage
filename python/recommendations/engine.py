"""Recommendation engine — generates investigation-oriented recommendations."""
from typing import List, Dict


TEMPLATES = {
    'Repeated Failed Logins': (
        'Review authentication events and correlate failed login timestamps with other evidence. '
        'Identify the source IP and check for successful logins following the failures. '
        'Consider whether this indicates a brute-force attempt.'
    ),
    'Repeated Attempts from Single IP': (
        'Investigate the source IP for signs of automated scanning or brute-force activity. '
        'Review all events associated with this IP across all evidence items. '
        'Check whether the IP appears in the network activity and whether it made successful connections.'
    ),
    'Activity During Unusual Hours': (
        'Review events occurring outside normal business hours (midnight to 6am). '
        'Correlate with user accounts involved to determine whether this activity is authorized. '
        'Cross-reference with network activity during the same timeframe.'
    ),
    'Suspicious Extension': (
        'Review the executable file carefully. Verify whether it was authorized to be present on the system. '
        'Check the file hash against known-good baselines if available. '
        'Examine the file creation and modification timestamps.'
    ),
    'Double Extension': (
        'This file uses a double extension which is a common social engineering technique. '
        'Treat this file as potentially malicious until proven otherwise. '
        'Examine the file metadata, creation source, and any related process execution evidence.'
    ),
    'Hidden File': (
        'Examine hidden files carefully as adversaries commonly use hidden directories to conceal tools or data. '
        'Review when the file was created and whether its timestamp aligns with other suspicious activity.'
    ),
    'Suspicious Port': (
        'Review network connections to this port. Common ports like 4444 are associated with known exploit frameworks. '
        'Determine whether these connections were initiated by known authorized processes.'
    ),
    'High Frequency Destination': (
        'Investigate repeated connections to this destination IP. '
        'Repeated high-frequency outbound connections may indicate command-and-control (C2) communication. '
        'Review the timing and volume of data transferred.'
    ),
    'IOC Detected': (
        'An Indicator of Compromise pattern was detected. Review the IOC in context. '
        'Determine whether the value appears in multiple evidence sources. '
        'Use the full context of the surrounding data to determine significance.'
    ),
    'ML Anomaly': (
        'The ML anomaly detector flagged this as statistically unusual. '
        'This is an ML-assisted finding — it indicates statistical unusualness, not confirmed malicious activity. '
        'Review the flagged artifact in the context of other findings before drawing conclusions.'
    ),
    'High Risk Score': (
        'This case has a high composite risk score based on multiple signals. '
        'Prioritize reviewing the HIGH and CRITICAL severity findings first. '
        'Correlate artifacts across the timeline before forming conclusions.'
    ),
}

DEFAULT_REC = (
    'Review this finding in the context of all other evidence. '
    'Determine whether it correlates with other suspicious activity in the timeline. '
    'Document your reasoning before forming conclusions.'
)


def generate_recommendations(
    risk_finding: Dict,
    log_patterns: List[Dict],
    file_findings: List[Dict],
    iocs: List[Dict],
    network_anomalies: List[Dict],
    ml_score: float,
) -> List[Dict]:
    """Generate actionable investigation recommendations."""
    recommendations = []
    seen = set()

    def add_rec(trigger: str, priority: str = 'MEDIUM'):
        text = TEMPLATES.get(trigger, DEFAULT_REC)
        if text not in seen:
            seen.add(text)
            recommendations.append({
                'trigger': trigger,
                'recommendation': text,
                'priority': priority,
            })

    # Log-based
    for pattern in log_patterns:
        pattern_name = pattern.get('pattern', '')
        if pattern_name in TEMPLATES:
            sev = pattern.get('severity', 'LOW')
            add_rec(pattern_name, 'HIGH' if sev == 'HIGH' else 'MEDIUM')

    # File-based
    for finding in file_findings:
        for f in finding.get('findings', []):
            t = f.get('type', '')
            if t in TEMPLATES:
                sev = f.get('severity', 'LOW')
                add_rec(t, 'HIGH' if sev in ('HIGH', 'CRITICAL') else 'MEDIUM')

    # IOC-based
    if iocs:
        add_rec('IOC Detected', 'HIGH')

    # Network
    for anomaly in network_anomalies:
        t = anomaly.get('type', '')
        if t in TEMPLATES:
            add_rec(t, 'HIGH')

    # ML
    if ml_score > 50:
        add_rec('ML Anomaly', 'MEDIUM')

    # High overall risk
    if risk_finding.get('risk_score', 0) >= 61:
        add_rec('High Risk Score', 'HIGH')

    if not recommendations:
        recommendations.append({
            'trigger': 'General',
            'recommendation': DEFAULT_REC,
            'priority': 'LOW',
        })

    return recommendations
