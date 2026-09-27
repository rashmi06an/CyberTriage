"""File artifact parser."""
import os
import stat
import mimetypes
from datetime import datetime
from typing import Dict, List

SUSPICIOUS_EXTENSIONS = {
    '.exe', '.bat', '.cmd', '.ps1', '.vbs', '.js', '.jar', '.sh',
    '.scr', '.pif', '.com', '.hta', '.msi', '.dll', '.so', '.dylib',
}

DOUBLE_EXTENSION_RE = [
    '.pdf.exe', '.doc.exe', '.docx.exe', '.jpg.exe', '.png.exe',
    '.pdf.bat', '.txt.exe', '.xls.exe', '.xlsx.exe',
]


def analyze_file(file_path: str) -> Dict:
    """Analyze a single file and return artifact data."""
    if not os.path.exists(file_path):
        return {'error': 'File not found'}

    try:
        st = os.stat(file_path)
        name = os.path.basename(file_path)
        ext = os.path.splitext(name)[1].lower()
        mime_type, _ = mimetypes.guess_type(file_path)
        size = st.st_size
        created = datetime.fromtimestamp(st.st_birthtime if hasattr(st, 'st_birthtime') else st.st_ctime).isoformat()
        modified = datetime.fromtimestamp(st.st_mtime).isoformat()
        accessed = datetime.fromtimestamp(st.st_atime).isoformat()
        is_hidden = name.startswith('.')
        is_executable = bool(st.st_mode & (stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH))

        findings = []
        severity = 'LOW'

        # Check executable
        if ext in SUSPICIOUS_EXTENSIONS:
            findings.append({
                'type': 'Suspicious Extension',
                'description': f'File has suspicious extension: {ext}',
                'severity': 'HIGH',
            })
            severity = 'HIGH'

        # Check double extension
        for de in DOUBLE_EXTENSION_RE:
            if name.lower().endswith(de):
                findings.append({
                    'type': 'Double Extension',
                    'description': f'Suspicious double extension detected: {name}. Executable file using a document-like filename.',
                    'severity': 'HIGH',
                })
                severity = 'CRITICAL'

        # Hidden file
        if is_hidden:
            findings.append({
                'type': 'Hidden File',
                'description': f'File is hidden: {name}',
                'severity': 'MEDIUM',
            })
            if severity == 'LOW':
                severity = 'MEDIUM'

        # Executable permission
        if is_executable and ext not in {'.sh', '.py', '.rb'}:
            findings.append({
                'type': 'Executable Permission',
                'description': f'File has executable permissions set.',
                'severity': 'MEDIUM',
            })
            if severity == 'LOW':
                severity = 'MEDIUM'

        # Very small executable
        if is_executable and size < 1024 and size > 0:
            findings.append({
                'type': 'Suspiciously Small Executable',
                'description': f'Executable file is unusually small ({size} bytes). May be a dropper.',
                'severity': 'MEDIUM',
            })

        # Try to read text content for IOC extraction
        content = ''
        try:
            if size < 5_000_000 and (mime_type and 'text' in mime_type or ext in {'.txt', '.log', '.csv', '.json', '.xml', '.html', '.js', '.ps1', '.bat', '.cmd', '.sh'}):
                with open(file_path, 'r', errors='replace') as f:
                    content = f.read(500_000)
        except Exception:
            pass

        return {
            'name': name,
            'path': file_path,
            'extension': ext,
            'mime_type': mime_type or 'application/octet-stream',
            'size': size,
            'created': created,
            'modified': modified,
            'accessed': accessed,
            'is_hidden': is_hidden,
            'is_executable': is_executable,
            'severity': severity,
            'findings': findings,
            'content_preview': content[:2000] if content else '',
            'full_content': content,
        }
    except Exception as e:
        return {'error': str(e), 'name': os.path.basename(file_path)}


def scan_directory(dir_path: str) -> List[Dict]:
    """Recursively scan a directory and analyze all files."""
    results = []
    for root, dirs, files in os.walk(dir_path):
        # Skip hidden directories
        dirs[:] = [d for d in dirs if not d.startswith('.') and d not in {'__pycache__', 'node_modules', '.git', 'venv'}]
        for filename in files:
            fp = os.path.join(root, filename)
            results.append(analyze_file(fp))
    return results
