"""
Windows Registry hive support.

Reads binary ``regf`` hives (NTUSER.DAT / SOFTWARE / SYSTEM / SAM …) with the
pure-Python ``python-registry`` library and surfaces the forensically useful
autostart/persistence entries (Run / RunOnce keys, services) as findings the
CyberTriage pipeline can score. :func:`make_demo_hive` builds the bundled demo
hive so the feature is self-contained.
"""
import os
import struct
from datetime import datetime, timezone
from typing import Dict, List

HIVE_NAMES = {'ntuser.dat', 'software', 'system', 'sam', 'security', 'usrclass.dat', 'default'}

# Autostart locations worth flagging wherever they appear in a hive.
RUN_PATHS = [
    'Microsoft\\Windows\\CurrentVersion\\Run',
    'Microsoft\\Windows\\CurrentVersion\\RunOnce',
    'Software\\Microsoft\\Windows\\CurrentVersion\\Run',
    'Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce',
]

_SUSPICIOUS_HINTS = ('\\temp\\', '\\appdata\\', 'powershell', '-enc', 'http://', 'https://',
                     '\\users\\public\\', 'cmd.exe', 'rundll32', 'regsvr32', 'mshta', '.scr')


def is_registry_hive(path: str) -> bool:
    if os.path.basename(path).lower() in HIVE_NAMES:
        return True
    try:
        with open(path, 'rb') as f:
            return f.read(4) == b'regf'
    except Exception:
        return False


def _rate(value_data: str) -> str:
    low = value_data.lower()
    return 'HIGH' if any(h in low for h in _SUSPICIOUS_HINTS) else 'MEDIUM'


def parse_hive(path: str) -> Dict:
    """Return {findings: [...], text: str} for a registry hive."""
    from Registry import Registry

    reg = Registry.Registry(path)
    findings: List[Dict] = []
    text_parts: List[str] = []

    def add(key_path, name, data, severity, desc):
        findings.append({
            'key': key_path, 'name': name, 'value': str(data)[:400],
            'severity': severity, 'description': desc,
        })
        text_parts.append(f'{key_path}\\{name} = {data}')

    # 1) Autostart / persistence keys
    for rp in RUN_PATHS:
        try:
            key = reg.open(rp)
        except Exception:
            continue
        for v in key.values():
            try:
                data = v.value()
            except Exception:
                data = ''
            sev = _rate(str(data))
            add(rp, v.name(), data,
                sev,
                f'Autostart entry ({"RunOnce" if "RunOnce" in rp else "Run"}) — program launched automatically at '
                f'{"logon" if "Software" in rp or "NTUSER" in rp else "boot"}.'
                + (' Path looks suspicious (temp/appdata/script/remote).' if sev == 'HIGH' else ''))

    # 2) Services with suspicious ImagePath (SYSTEM hive)
    for cs in ('ControlSet001\\Services', 'CurrentControlSet\\Services', 'Select'):
        try:
            svc_root = reg.open(cs)
        except Exception:
            continue
        for sub in svc_root.subkeys():
            try:
                image = sub.value('ImagePath').value()
            except Exception:
                continue
            if any(h in str(image).lower() for h in _SUSPICIOUS_HINTS):
                add(f'{cs}\\{sub.name()}', 'ImagePath', image, 'HIGH',
                    'Service points to a suspicious executable path.')

    return {'findings': findings, 'text': '\n'.join(text_parts)}


# ── Minimal regf hive writer (builds the bundled demo hive) ───────────────

def _filetime(dt: datetime) -> int:
    epoch = datetime(1601, 1, 1, tzinfo=timezone.utc)
    return int((dt - epoch).total_seconds() * 10_000_000)


class _HiveBuilder:
    """Builds a tiny but valid regf hive readable by python-registry."""

    def __init__(self):
        self.cells = bytearray()  # cell area (after the 32-byte hbin header)
        self.sk_off = None

    def _add(self, payload: bytes) -> int:
        total = 4 + len(payload)
        pad = (-total) % 8
        total += pad
        off = 32 + len(self.cells)
        self.cells += struct.pack('<i', -total) + payload + b'\x00' * pad
        return off

    def _patch_u32(self, cell_off: int, field: int, value: int):
        pos = (cell_off - 32) + 4 + field
        struct.pack_into('<I', self.cells, pos, value)

    def add_sk(self, key_count: int) -> int:
        # Minimal self-referential security cell with a tiny valid descriptor.
        sd = struct.pack('<BBH IIII', 1, 0, 0x8004, 0, 0, 0, 0)  # rev, sbz, control, owner/group/sacl/dacl offsets=0
        payload = b'sk\x00\x00'
        payload += struct.pack('<III', 0, 0, key_count)  # flink, blink, refcount (patched to self below)
        payload += struct.pack('<I', len(sd)) + sd
        off = self._add(payload)
        # point flink/blink to self
        self._patch_u32(off, 4, off)
        self._patch_u32(off, 8, off)
        self.sk_off = off
        return off

    def add_data(self, raw: bytes) -> int:
        return self._add(raw)

    def add_value(self, name: str, data_str: str, vtype: int = 1) -> int:
        enc = (data_str + '\x00').encode('utf-16-le')
        data_off = self.add_data(enc)
        nb = name.encode('ascii', 'replace')
        payload = b'vk' + struct.pack('<H', len(nb)) + struct.pack('<I', len(enc))
        payload += struct.pack('<I', data_off) + struct.pack('<I', vtype)
        payload += struct.pack('<H', 0x0001) + struct.pack('<H', 0) + nb
        return self._add(payload)

    def add_value_list(self, offsets: List[int]) -> int:
        return self._add(b''.join(struct.pack('<I', o) for o in offsets))

    def add_subkey_list(self, children: List) -> int:
        payload = b'lf' + struct.pack('<H', len(children))
        for off, name in children:
            hint = name.encode('ascii', 'replace')[:4].ljust(4, b'\x00')
            payload += struct.pack('<I', off) + hint
        return self._add(payload)

    def add_key(self, name: str, children: List, values: List, root: bool = False) -> int:
        nb = name.encode('ascii', 'replace')
        subkey_list_off = self.add_subkey_list(children) if children else 0xFFFFFFFF
        value_offsets = [self.add_value(n, d) for (n, d) in values]
        value_list_off = self.add_value_list(value_offsets) if value_offsets else 0xFFFFFFFF
        flags = 0x2C if root else 0x20
        ts = _filetime(datetime(2026, 10, 17, 3, 8, tzinfo=timezone.utc))
        payload = b'nk' + struct.pack('<H', flags) + struct.pack('<Q', ts)
        payload += struct.pack('<I', 0)                      # access/spare
        payload += struct.pack('<I', 0xFFFFFFFF)             # parent (patched later)
        payload += struct.pack('<I', len(children))          # num subkeys
        payload += struct.pack('<I', 0)                      # num subkeys volatile
        payload += struct.pack('<I', subkey_list_off)        # subkey list
        payload += struct.pack('<I', 0xFFFFFFFF)             # volatile subkey list
        payload += struct.pack('<I', len(values))            # num values
        payload += struct.pack('<I', value_list_off)         # value list
        payload += struct.pack('<I', self.sk_off)            # sk
        payload += struct.pack('<I', 0xFFFFFFFF)             # class name
        payload += struct.pack('<IIIII', 0, 0, 0, 0, 0)      # largest-* + workvar
        payload += struct.pack('<H', len(nb)) + struct.pack('<H', 0) + nb
        off = self._add(payload)
        # patch children parents to this key
        for child_off, _ in children:
            self._patch_u32(child_off, 16, off)
        return off

    def build(self, root_off: int) -> bytes:
        hbin_data = bytearray(b'hbin')
        hbin_data += struct.pack('<I', 0)                    # offset of this hbin
        size = 32 + len(self.cells)
        size = (size + 4095) & ~4095                         # round hbin up to 4096
        hbin_data += struct.pack('<I', size)
        hbin_data += b'\x00' * 8                             # reserved
        hbin_data += struct.pack('<Q', 0)                    # timestamp
        hbin_data += struct.pack('<I', 0)                    # spare
        hbin_data += self.cells
        hbin_data += b'\x00' * (size - len(hbin_data))

        base = bytearray(4096)
        base[0:4] = b'regf'
        struct.pack_into('<I', base, 4, 1)                   # primary seq
        struct.pack_into('<I', base, 8, 1)                   # secondary seq
        struct.pack_into('<Q', base, 12, _filetime(datetime(2026, 10, 17, tzinfo=timezone.utc)))
        struct.pack_into('<I', base, 20, 1)                  # major
        struct.pack_into('<I', base, 24, 3)                  # minor
        struct.pack_into('<I', base, 28, 0)                  # file type (primary)
        struct.pack_into('<I', base, 32, 1)                  # file format (direct)
        struct.pack_into('<I', base, 36, root_off)           # root key offset
        struct.pack_into('<I', base, 40, size)               # hive bins data size
        struct.pack_into('<I', base, 44, 1)                  # clustering factor
        name = 'CyberTriageDemoHive'.encode('utf-16-le')
        base[48:48 + len(name)] = name
        # checksum: XOR of first 127 uint32s
        chk = 0
        for i in range(0, 508, 4):
            chk ^= struct.unpack('<I', base[i:i + 4])[0]
        struct.pack_into('<I', base, 508, chk & 0xFFFFFFFF)
        return bytes(base) + bytes(hbin_data)


def make_demo_hive() -> bytes:
    """A small SOFTWARE-style hive with a malicious Run key (persistence)."""
    b = _HiveBuilder()
    b.add_sk(key_count=5)

    # Leaf: ...CurrentVersion\Run with suspicious autostart values
    run = b.add_key('Run', [], [
        ('SecurityHealth', 'C:\\Windows\\System32\\SecurityHealthSystray.exe'),
        ('Updater', 'powershell -enc aQBlAHgAIAAoAG4AZQB3AC0AbwBiAGoA'),
        ('svchost', 'C:\\Users\\Public\\AppData\\Local\\Temp\\svchost_update.exe'),
    ])
    curver = b.add_key('CurrentVersion', [(run, 'Run')], [])
    windows = b.add_key('Windows', [(curver, 'CurrentVersion')], [])
    microsoft = b.add_key('Microsoft', [(windows, 'Windows')], [])
    root = b.add_key('ROOT', [(microsoft, 'Microsoft')], [], root=True)
    return b.build(root)
