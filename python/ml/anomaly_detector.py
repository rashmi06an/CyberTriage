"""
Isolation Forest anomaly detector — a compact, dependency-light implementation.

This is a real Isolation Forest (Liu, Ting & Zhou, 2008): it isolates anomalies
by randomly partitioning the feature space and measuring how short the path to
isolate each point is. It uses only NumPy — no scikit-learn/scipy — which keeps
the packaged engine small while preserving genuine, deterministic ML scoring.

numpy is imported lazily inside run_anomaly_detection so the engine process can
start (and emit its "ready" banner) instantly.
"""
import math
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

N_TREES = 100
SUBSAMPLE = 256


def build_feature_vector(artifact: Dict) -> List[float]:
    """Build a numeric feature vector from an artifact dict."""
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


def _c(n: int) -> float:
    """Average path length of an unsuccessful BST search over n points."""
    if n <= 1:
        return 0.0
    return 2.0 * (math.log(n - 1) + 0.5772156649) - (2.0 * (n - 1) / n)


def _build_tree(X, idx, rng, depth, max_depth):
    import numpy as np
    n = len(idx)
    if depth >= max_depth or n <= 1:
        return {'size': n}
    feats = list(range(X.shape[1]))
    rng.shuffle(feats)
    for f in feats:
        col = X[idx, f]
        mn = float(col.min())
        mx = float(col.max())
        if mx > mn:
            split = rng.uniform(mn, mx)
            left = idx[col < split]
            right = idx[col >= split]
            return {
                'f': f, 's': split,
                'l': _build_tree(X, left, rng, depth + 1, max_depth),
                'r': _build_tree(X, right, rng, depth + 1, max_depth),
            }
    return {'size': n}


def _path_length(x, node, depth):
    while 'size' not in node:
        node = node['l'] if x[node['f']] < node['s'] else node['r']
        depth += 1
    return depth + _c(node['size'])


def run_anomaly_detection(artifacts: List[Dict]) -> List[Dict]:
    """
    Run an Isolation Forest over the artifact feature vectors.
    Returns each artifact with an anomaly_score (0-100, higher = more anomalous).
    """
    if not artifacts:
        return []

    import numpy as np

    features = [build_feature_vector(a) for a in artifacts]
    X = np.array(features, dtype=float)
    n = len(X)

    if n < 2:
        out = []
        for a in artifacts:
            b = dict(a)
            b['anomaly_score'] = 10.0
            b['is_anomaly'] = False
            b['anomaly_features'] = {name: round(features[0][j], 3) for j, name in enumerate(FEATURE_NAMES)}
            out.append(b)
        return out

    rng = np.random.default_rng(42)  # deterministic
    psi = min(SUBSAMPLE, n)
    max_depth = max(1, int(math.ceil(math.log2(psi))))

    trees = []
    all_idx = np.arange(n)
    for _ in range(N_TREES):
        if n > psi:
            sample = rng.choice(all_idx, size=psi, replace=False)
        else:
            sample = all_idx
        trees.append(_build_tree(X, sample, rng, 0, max_depth))

    cn = _c(psi)
    scores = []
    for i in range(n):
        avg_path = sum(_path_length(X[i], t, 0) for t in trees) / len(trees)
        s = 2.0 ** (-avg_path / cn) if cn > 0 else 0.5
        scores.append(s)

    results = []
    for i, artifact in enumerate(artifacts):
        a = dict(artifact)
        a['anomaly_score'] = round(float(scores[i]) * 100.0, 2)
        a['is_anomaly'] = bool(scores[i] >= 0.6)
        a['anomaly_features'] = {name: round(features[i][j], 3) for j, name in enumerate(FEATURE_NAMES)}
        results.append(a)

    return results


def get_top_anomalies(artifacts: List[Dict], n: int = 10) -> List[Dict]:
    """Return the top N most anomalous artifacts."""
    scored = run_anomaly_detection(artifacts)
    return sorted(scored, key=lambda x: x.get('anomaly_score', 0), reverse=True)[:n]
