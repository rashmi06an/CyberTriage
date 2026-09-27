"""Network activity analyzer."""
import csv
import json
import io
from collections import Counter
from typing import List, Dict

SUSPICIOUS_PORTS = {
    4444, 1337, 31337, 8080, 9999, 6667, 6666,
    23, 2323, 5900, 5901, 3389, 1433, 3306,
}

PRIVATE_RANGES = [
    (10, 0, 0, 0, 8),
    (172, 16, 0, 0, 12),
    (192, 168, 0, 0, 16),
    (127, 0, 0, 1, 32),
]


def is_private_ip(ip: str) -> bool:
    try:
        parts = list(map(int, ip.split('.')))
        if parts[0] == 10:
            return True
        if parts[0] == 172 and 16 <= parts[1] <= 31:
            return True
        if parts[0] == 192 and parts[1] == 168:
            return True
        if parts[0] == 127:
            return True
        return False
    except Exception:
        return False


def analyze_network(records: List[Dict]) -> Dict:
    """Analyze network activity records for anomalies."""
    dest_counts = Counter()
    port_counts = Counter()
    src_counts = Counter()
    protocols = Counter()
    anomalies = []

    for rec in records:
        dst_ip = str(rec.get('destination_ip', rec.get('dst_ip', '')))
        src_ip = str(rec.get('source_ip', rec.get('src_ip', '')))
        dst_port = int(rec.get('destination_port', rec.get('dst_port', 0)) or 0)
        protocol = str(rec.get('protocol', 'UNKNOWN')).upper()

        if dst_ip:
            dest_counts[dst_ip] += 1
        if src_ip:
            src_counts[src_ip] += 1
        if dst_port:
            port_counts[dst_port] += 1
        if protocol:
            protocols[protocol] += 1

        # Check suspicious port
        if dst_port in SUSPICIOUS_PORTS:
            anomalies.append({
                'type': 'Suspicious Port',
                'description': f'Connection to suspicious port {dst_port} from {src_ip} to {dst_ip}.',
                'severity': 'HIGH',
                'record': {k: str(v) for k, v in rec.items()},
            })

        # Check external destination
        if dst_ip and not is_private_ip(dst_ip):
            rec['external'] = True

    # High-frequency destinations
    for ip, count in dest_counts.most_common(5):
        if count >= 10:
            anomalies.append({
                'type': 'High Frequency Destination',
                'description': f'{count} connections to {ip}. May indicate C2 communication or data exfiltration.',
                'severity': 'MEDIUM',
                'ip': ip,
                'count': count,
            })

    # High-frequency sources
    for ip, count in src_counts.most_common(3):
        if count >= 15:
            anomalies.append({
                'type': 'High Frequency Source',
                'description': f'{count} connections from source {ip}. Possible scanning or lateral movement.',
                'severity': 'MEDIUM',
                'ip': ip,
                'count': count,
            })

    external_ips = [ip for ip in dest_counts if not is_private_ip(ip)]

    return {
        'total_records': len(records),
        'unique_destinations': len(dest_counts),
        'unique_sources': len(src_counts),
        'external_ips': external_ips[:20],
        'top_destinations': dict(dest_counts.most_common(10)),
        'top_ports': dict(port_counts.most_common(10)),
        'protocols': dict(protocols),
        'anomalies': anomalies,
    }


def parse_network_csv(content: str) -> List[Dict]:
    reader = csv.DictReader(io.StringIO(content))
    return [dict(row) for row in reader]


def parse_network_json(content: str) -> List[Dict]:
    data = json.loads(content)
    if isinstance(data, list):
        return data
    if isinstance(data, dict) and 'records' in data:
        return data['records']
    return []
