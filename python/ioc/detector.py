"""IOC Detector — extracts Indicators of Compromise from text."""
import re
from typing import List, Dict

# Regex patterns
IPV4_RE = re.compile(r'\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b')
DOMAIN_RE = re.compile(r'\b(?:[a-zA-Z0-9](?:[a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?\.)+(?:com|net|org|io|gov|edu|co|ru|cn|uk|de|fr|info|biz|xyz|top|club|site|online|tk|ml|ga|cf)\b', re.IGNORECASE)
URL_RE = re.compile(r'https?://[^\s<>"\']+', re.IGNORECASE)
MD5_RE = re.compile(r'\b[0-9a-fA-F]{32}\b')
SHA1_RE = re.compile(r'\b[0-9a-fA-F]{40}\b')
SHA256_RE = re.compile(r'\b[0-9a-fA-F]{64}\b')

# Known suspicious IPs (example list for demo)
SUSPICIOUS_IPS = {
    '192.168.100.254', '10.0.0.254', '172.16.0.254',
    '185.220.101.1', '185.220.101.2', '45.33.32.156',
}

# Known suspicious domains
SUSPICIOUS_DOMAINS = {
    'malware-c2.xyz', 'evil-domain.tk', 'phishing-site.ml',
    'cmd.exe', 'powershell.exe',
}


def detect_iocs(text: str, source: str = 'unknown') -> List[Dict]:
    """Extract all IOCs from a text blob."""
    findings = []
    seen = set()

    def add(ioc_type: str, value: str, risk: str, explanation: str):
        key = f'{ioc_type}:{value}'
        if key not in seen:
            seen.add(key)
            findings.append({
                'ioc_type': ioc_type,
                'value': value,
                'source': source,
                'risk': risk,
                'status': 'Detected',
                'explanation': explanation,
            })

    for ip in IPV4_RE.findall(text):
        # Skip loopback and private ranges (not inherently suspicious)
        parts = ip.split('.')
        if parts[0] == '127':
            continue
        risk = 'HIGH' if ip in SUSPICIOUS_IPS else 'UNKNOWN'
        explanation = (
            f'Detected IP address {ip}. '
            + ('Known suspicious IP.' if ip in SUSPICIOUS_IPS else 'Detected as a potential IOC pattern.')
        )
        add('IPv4', ip, risk, explanation)

    for url in URL_RE.findall(text):
        risk = 'MEDIUM'
        explanation = f'Detected URL pattern: {url[:100]}. Detected as a potential IOC pattern.'
        add('URL', url[:200], risk, explanation)

    for domain in DOMAIN_RE.findall(text):
        if any(url_domain in domain for url_domain in [d.split('/')[0] for d in URL_RE.findall(text)]):
            continue
        risk = 'HIGH' if domain.lower() in SUSPICIOUS_DOMAINS else 'LOW'
        explanation = (
            f'Detected domain pattern: {domain}. '
            + ('Known suspicious domain.' if domain.lower() in SUSPICIOUS_DOMAINS else 'Detected as a potential IOC pattern.')
        )
        add('Domain', domain, risk, explanation)

    for h in SHA256_RE.findall(text):
        add('SHA256', h, 'UNKNOWN', f'Detected SHA-256 hash pattern: {h}. Detected as a potential IOC pattern.')

    for h in SHA1_RE.findall(text):
        add('SHA1', h, 'UNKNOWN', f'Detected SHA-1 hash pattern: {h}. Detected as a potential IOC pattern.')

    for h in MD5_RE.findall(text):
        add('MD5', h, 'UNKNOWN', f'Detected MD5 hash pattern: {h}. Detected as a potential IOC pattern.')

    return findings
