"""
Isolation Forest anomaly detector.
Uses real scikit-learn IsolationForest — not synthetic scores.
"""
import numpy as np
from sklearn.ensemble import IsolationForest
from typing import List, Dict


FEATURE_NAMES = [
    'file_age_days',
    'file_size_kb',
    'is_executable',
    'is_hidden',
    'has_double_extension',
    'failed_login_count',
    'unique_ip_count',
    'unusual_hour_flag',
    'network_connection_count',
    'destination_count',
    'event_frequency',
    'suspicious_ext_flag',
]


def build_feature_vector(artifact: Dict) -> List[float]:
    """Build a numeric feature vector from an artifact dict."""
    import os, time

    # File age in days
    try:
        modified = artifact.get('modified', '')
        if modified:
            from datetime import datetime
            dt = datetime.fromisoformat(modified[:19])
            age = (datetime.now() - dt).days
        else:
            age = 0
    except Exception:
        age = 0

    size_kb = float(artifact.get('size', 0) or 0) / 1024.0
    is_exec = 1.0 if artifact.get('is_executable', False) else 0.0
    is_hidden = 1.0 if artifact.get('is_hidden', False) else 0.0

    findings = artifact.get('findings', [])
    has_double_ext = 1.0 if any(f.get('type') == 'Double Extension' for f in findings) else 0.0
    sus_ext = 1.0 if any(f.get('type') == 'Suspicious Extension' for f in findings) else 0.0

    failed_logins = float(artifact.get('failed_login_count', 0) or 0)
    unique_ips = float(artifact.get('unique_ip_count', 0) or 0)
    unusual_hour = float(artifact.get('unusual_hour_flag', 0) or 0)
    net_connections = float(artifact.get('network_connection_count', 0) or 0)
    dest_count = float(artifact.get('destination_count', 0) or 0)
    event_freq = float(artifact.get('event_frequency', 0) or 0)

    return [
        age, size_kb, is_exec, is_hidden, has_double_ext,
        failed_logins, unique_ips, unusual_hour, net_connections,
        dest_count, event_freq, sus_ext,
    ]


def run_anomaly_detection(artifacts: List[Dict]) -> List[Dict]:
    """
    Run Isolation Forest on a list of artifact feature vectors.
    Returns each artifact with an anomaly_score (0-100, higher = more anomalous).
    """
    if not artifacts:
        return []

    features = [build_feature_vector(a) for a in artifacts]
    X = np.array(features, dtype=float)

    # Need at least 2 samples to train
    if len(X) < 2:
        for a in artifacts:
            a['anomaly_score'] = 10.0
            a['is_anomaly'] = False
        return artifacts

    # contamination: assume ~10% of items may be anomalous
    contamination = min(0.5, max(0.01, 1.0 / len(X) * 2))

    clf = IsolationForest(
        n_estimators=100,
        contamination=contamination,
        random_state=42,
    )
    clf.fit(X)

    # decision_function: more negative = more anomalous
    scores = clf.decision_function(X)
    predictions = clf.predict(X)  # -1 = anomaly, 1 = normal

    # Normalize scores to 0-100 (higher = more anomalous)
    min_s, max_s = scores.min(), scores.max()
    if max_s == min_s:
        normalized = [50.0] * len(scores)
    else:
        normalized = [100.0 * (1.0 - (s - min_s) / (max_s - min_s)) for s in scores]

    results = []
    for i, artifact in enumerate(artifacts):
        a = dict(artifact)
        a['anomaly_score'] = round(normalized[i], 2)
        a['is_anomaly'] = predictions[i] == -1
        a['anomaly_features'] = {
            name: round(features[i][j], 3)
            for j, name in enumerate(FEATURE_NAMES)
        }
        results.append(a)

    return results


def get_top_anomalies(artifacts: List[Dict], n: int = 10) -> List[Dict]:
    """Return the top N most anomalous artifacts."""
    scored = run_anomaly_detection(artifacts)
    return sorted(scored, key=lambda x: x.get('anomaly_score', 0), reverse=True)[:n]
