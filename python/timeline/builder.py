"""Timeline event builder."""
from datetime import datetime
from typing import List, Dict
import uuid


def build_timeline(
    artifacts: List[Dict],
    log_events: List[Dict],
    iocs: List[Dict],
    network_records: List[Dict],
    case_id: str,
) -> List[Dict]:
    """Combine all events into a unified, sorted timeline."""
    events = []

    # File artifact events
    for art in artifacts:
        for ts_field in ['modified', 'created', 'accessed']:
            ts = art.get(ts_field)
            if ts:
                sev = art.get('severity', 'LOW')
                events.append({
                    'id': str(uuid.uuid4()),
                    'case_id': case_id,
                    'timestamp': ts[:19],
                    'event_type': f'File {ts_field.capitalize()}',
                    'source': 'File Analysis',
                    'artifact_id': art.get('id', ''),
                    'severity': sev,
                    'description': f"{art.get('name', 'Unknown')} — {ts_field}",
                    'ioc_related': 0,
                    'risk_score': 0,
                })

    # Log events
    for evt in log_events:
        ts = evt.get('timestamp')
        if not ts:
            continue
        sev = evt.get('severity', 'LOW')
        events.append({
            'id': str(uuid.uuid4()),
            'case_id': case_id,
            'timestamp': ts[:19] if ts else '',
            'event_type': 'Log Event',
            'source': evt.get('source', 'Log'),
            'artifact_id': '',
            'severity': 'HIGH' if evt.get('is_failed_login') else sev,
            'description': evt.get('message', '')[:200],
            'ioc_related': 0,
            'risk_score': 0,
        })

    # IOC events
    for ioc in iocs:
        ts = ioc.get('first_seen', datetime.now().isoformat())
        events.append({
            'id': str(uuid.uuid4()),
            'case_id': case_id,
            'timestamp': ts[:19] if ts else '',
            'event_type': f"IOC Detected: {ioc.get('ioc_type', 'Unknown')}",
            'source': 'IOC Detector',
            'artifact_id': '',
            'severity': 'HIGH' if ioc.get('risk') in ('HIGH', 'CRITICAL') else 'MEDIUM',
            'description': f"{ioc.get('ioc_type')}: {str(ioc.get('value', ''))[:100]}",
            'ioc_related': 1,
            'risk_score': 0,
        })

    # Network events
    for rec in network_records[:100]:  # cap at 100
        ts = rec.get('timestamp', '')
        if not ts:
            continue
        events.append({
            'id': str(uuid.uuid4()),
            'case_id': case_id,
            'timestamp': str(ts)[:19],
            'event_type': 'Network Connection',
            'source': 'Network Analysis',
            'artifact_id': '',
            'severity': 'MEDIUM' if rec.get('anomaly_flag') else 'LOW',
            'description': f"{rec.get('source_ip', '?')} → {rec.get('destination_ip', '?')}:{rec.get('destination_port', '?')}",
            'ioc_related': 0,
            'risk_score': 0,
        })

    # Sort by timestamp
    def sort_key(e):
        try:
            return datetime.fromisoformat(e['timestamp'])
        except Exception:
            return datetime.min

    events.sort(key=sort_key)
    return events
