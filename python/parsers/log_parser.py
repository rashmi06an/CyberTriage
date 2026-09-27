"""Log parser — parses structured and plain text logs."""
import re
import csv
import json
import io
from datetime import datetime
from typing import List, Dict
from collections import Counter

# Common log timestamp patterns
TS_PATTERNS = [
    re.compile(r'(\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2})'),
    re.compile(r'(\d{2}/\d{2}/\d{4} \d{2}:\d{2}:\d{2})'),
    re.compile(r'(\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})'),
]

FAILED_LOGIN_RE = re.compile(r'(?:failed|invalid|wrong|incorrect|denied).{0,30}(?:login|auth|password|credential)', re.IGNORECASE)
AUTH_SUCCESS_RE = re.compile(r'(?:accepted|success|logged in|authenticated)', re.IGNORECASE)
IP_RE = re.compile(r'\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b')
USER_RE = re.compile(r'(?:user|username|for)\s+([a-zA-Z0-9_\-.@]+)', re.IGNORECASE)

UNUSUAL_HOURS = set(range(0, 6))  # Midnight to 6am


def extract_timestamp(line: str):
    for pat in TS_PATTERNS:
        m = pat.search(line)
        if m:
            return m.group(1)
    return None


def parse_logs(content: str, source: str = 'log') -> Dict:
    """Parse log content and return structured events + suspicious patterns."""
    lines = content.splitlines()
    events = []
    failed_logins = []
    ip_counts = Counter()
    hour_counts = Counter()

    for line in lines:
        if not line.strip():
            continue
        ts = extract_timestamp(line)
        ip_match = IP_RE.search(line)
        ip = ip_match.group() if ip_match else None
        user_match = USER_RE.search(line)
        user = user_match.group(1) if user_match else None

        # Determine hour
        hour = None
        if ts:
            for fmt in ['%Y-%m-%dT%H:%M:%S', '%Y-%m-%d %H:%M:%S', '%m/%d/%Y %H:%M:%S']:
                try:
                    dt = datetime.strptime(ts[:19], fmt)
                    hour = dt.hour
                    break
                except ValueError:
                    continue

        if ip:
            ip_counts[ip] += 1
        if hour is not None:
            hour_counts[hour] += 1

        is_failed = bool(FAILED_LOGIN_RE.search(line))
        is_success = bool(AUTH_SUCCESS_RE.search(line))

        severity = 'LOW'
        if is_failed:
            severity = 'MEDIUM'
            failed_logins.append({'line': line[:300], 'ip': ip, 'user': user, 'timestamp': ts})

        events.append({
            'timestamp': ts,
            'source': source,
            'message': line[:300],
            'ip': ip,
            'user': user,
            'is_failed_login': is_failed,
            'is_success': is_success,
            'hour': hour,
            'severity': severity,
        })

    # Detect suspicious patterns
    suspicious = []

    # Repeated failed logins
    if len(failed_logins) >= 3:
        suspicious.append({
            'pattern': 'Repeated Failed Logins',
            'description': f'{len(failed_logins)} failed login attempts detected.',
            'severity': 'HIGH',
            'count': len(failed_logins),
        })

    # IP brute force
    for ip, count in ip_counts.items():
        if count >= 5:
            suspicious.append({
                'pattern': 'Repeated Attempts from Single IP',
                'description': f'{count} events from IP {ip}. May indicate brute force or scanning.',
                'severity': 'HIGH',
                'ip': ip,
                'count': count,
            })

    # Unusual hours
    unusual_hour_events = sum(hour_counts[h] for h in UNUSUAL_HOURS)
    if unusual_hour_events >= 2:
        suspicious.append({
            'pattern': 'Activity During Unusual Hours',
            'description': f'{unusual_hour_events} events detected between midnight and 6am.',
            'severity': 'MEDIUM',
            'count': unusual_hour_events,
        })

    return {
        'events': events,
        'suspicious_patterns': suspicious,
        'failed_login_count': len(failed_logins),
        'unique_ips': list(ip_counts.keys()),
        'ip_counts': dict(ip_counts.most_common(10)),
        'total_events': len(events),
    }


def parse_csv_logs(content: str, source: str = 'csv_log') -> Dict:
    """Parse CSV-formatted logs."""
    reader = csv.DictReader(io.StringIO(content))
    rows = list(reader)
    text_content = '\n'.join(str(row) for row in rows)
    result = parse_logs(text_content, source)
    result['structured_rows'] = rows[:500]
    return result
