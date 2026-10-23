"""
RAW forensic disk-image support (FAT12/16/32), dependency-free.

Reads a raw image (``.dd`` / ``.raw`` / ``.img`` / ``.001``), walks the FAT
filesystem (handling an optional MBR partition table, subdirectories and VFAT
long file names) and returns every regular file as ``{name, data}`` so the rest
of the CyberTriage pipeline can analyse them exactly as if they'd been imported
loose. A small writer (:func:`make_fat16_image`) builds the bundled demo image.

Pure Python on purpose: no pytsk3/libewf/native deps, so it freezes cleanly
into the packaged engine.
"""
import os
import struct
from typing import Dict, List, Optional

RAW_IMAGE_EXTS = {'.dd', '.raw', '.img', '.001', '.ewf', '.e01'}
EOC = 0xFFF8  # FAT16 end-of-chain threshold


def is_disk_image(path: str) -> bool:
    return os.path.splitext(path)[1].lower() in RAW_IMAGE_EXTS


# ── Reader ────────────────────────────────────────────────────────────────

def _find_fat_offset(data: bytes) -> int:
    """Return the byte offset of the FAT volume (0, or the first partition)."""
    # A FAT boot sector carries a recognisable FS type string.
    if data[54:57] in (b'FAT', b'FAT') or data[82:85] == b'FAT':
        return 0
    # Otherwise look for an MBR partition table and jump to the first partition.
    if len(data) >= 512 and data[510:512] == b'\x55\xaa':
        for i in range(446, 510, 16):
            entry = data[i:i + 16]
            ptype = entry[4]
            if ptype in (0x01, 0x04, 0x06, 0x0B, 0x0C, 0x0E, 0x0F):  # FAT variants
                start_lba = struct.unpack('<I', entry[8:12])[0]
                if start_lba:
                    return start_lba * 512
    return 0


def read_disk_image(path: str, max_files: int = 5000, max_bytes: int = 50_000_000) -> List[Dict]:
    """Extract regular files from a raw FAT image. Returns [{name, data}]."""
    with open(path, 'rb') as f:
        data = f.read()
    base = _find_fat_offset(data)
    vol = data[base:]

    bps = struct.unpack('<H', vol[11:13])[0]
    spc = vol[13]
    if bps not in (512, 1024, 2048, 4096) or spc == 0:
        raise ValueError('Not a recognisable FAT filesystem (bad BPB).')
    reserved = struct.unpack('<H', vol[14:16])[0]
    num_fats = vol[16]
    root_entries = struct.unpack('<H', vol[17:19])[0]
    total16 = struct.unpack('<H', vol[19:21])[0]
    fatsz16 = struct.unpack('<H', vol[22:24])[0]
    total32 = struct.unpack('<I', vol[32:36])[0]
    fatsz32 = struct.unpack('<I', vol[36:40])[0]

    fat_size = fatsz16 or fatsz32
    total_sectors = total16 or total32
    fat_start = reserved * bps
    root_dir_sectors = ((root_entries * 32) + (bps - 1)) // bps
    root_start = fat_start + num_fats * fat_size * bps
    data_start = root_start + root_dir_sectors * bps

    data_sectors = total_sectors - (reserved + num_fats * fat_size + root_dir_sectors)
    cluster_count = data_sectors // spc if spc else 0
    if cluster_count < 4085:
        fat_type = 12
    elif cluster_count < 65525:
        fat_type = 16
    else:
        fat_type = 32

    fat = vol[fat_start:fat_start + fat_size * bps]

    def next_cluster(c: int) -> int:
        if fat_type == 16:
            off = c * 2
            return struct.unpack('<H', fat[off:off + 2])[0]
        if fat_type == 32:
            off = c * 4
            return struct.unpack('<I', fat[off:off + 4])[0] & 0x0FFFFFFF
        # FAT12
        off = c + (c // 2)
        val = struct.unpack('<H', fat[off:off + 2])[0]
        return (val >> 4) if (c & 1) else (val & 0x0FFF)

    def eoc(c: int) -> bool:
        if fat_type == 16:
            return c >= 0xFFF8
        if fat_type == 32:
            return c >= 0x0FFFFFF8
        return c >= 0xFF8

    def read_chain(start: int, limit: Optional[int] = None) -> bytes:
        out = bytearray()
        c = start
        seen = set()
        while c >= 2 and not eoc(c) and c not in seen:
            seen.add(c)
            off = data_start + (c - 2) * spc * bps
            out += vol[off:off + spc * bps]
            if limit is not None and len(out) >= limit:
                break
            c = next_cluster(c)
        return bytes(out)

    results: List[Dict] = []
    total = [0]

    def parse_dir(entries: bytes, prefix: str, root_cluster: int = 0):
        lfn_parts: Dict[int, str] = {}
        i = 0
        while i + 32 <= len(entries):
            e = entries[i:i + 32]
            i += 32
            first = e[0]
            if first == 0x00:
                break
            if first == 0xE5:
                lfn_parts.clear()
                continue
            attr = e[11]
            if attr == 0x0F:  # LFN entry
                seq = e[0] & 0x1F
                chars = e[1:11] + e[14:26] + e[28:32]
                try:
                    name = chars.decode('utf-16-le')
                except Exception:
                    name = ''
                name = name.split('\x00')[0].replace('￿', '')
                lfn_parts[seq] = name
                continue
            if attr & 0x08:  # volume label
                lfn_parts.clear()
                continue
            # Short entry → assemble name
            if lfn_parts:
                long_name = ''.join(lfn_parts[k] for k in sorted(lfn_parts))
                name = long_name
            else:
                base_n = e[0:8].decode('ascii', 'replace').rstrip()
                ext_n = e[8:11].decode('ascii', 'replace').rstrip()
                name = f'{base_n}.{ext_n}' if ext_n else base_n
            lfn_parts.clear()
            if name in ('.', '..'):
                continue
            start_cluster = (struct.unpack('<H', e[20:22])[0] << 16) | struct.unpack('<H', e[26:28])[0]
            size = struct.unpack('<I', e[28:32])[0]
            full = f'{prefix}{name}'
            if attr & 0x10:  # directory
                if start_cluster >= 2 and total[0] < max_files:
                    parse_dir(read_chain(start_cluster), f'{full}/')
            else:
                if total[0] >= max_files:
                    continue
                content = read_chain(start_cluster, limit=size)[:size] if start_cluster >= 2 else b''
                results.append({'name': full, 'data': content})
                total[0] += 1

    # FAT32 root is a cluster chain; FAT12/16 root is a fixed region.
    if fat_type == 32:
        root_cluster = struct.unpack('<I', vol[44:48])[0]
        parse_dir(read_chain(root_cluster), '')
    else:
        root_region = vol[root_start:root_start + root_dir_sectors * bps]
        parse_dir(root_region, '')

    return results


# ── Writer (builds the bundled demo image) ────────────────────────────────

_INVALID = set('+,;=[] ')


def _short_name(name: str, used: set) -> bytes:
    base, _, ext = name.rpartition('.')
    if not base:
        base, ext = name, ''
    def clean(s):
        return ''.join(c for c in s.upper() if c.isalnum() or c in '_-~').lstrip() or 'X'
    b = clean(base)[:6]
    x = clean(ext)[:3]
    n = 1
    while True:
        short = f'{b}~{n}'[:8]
        key = (short, x)
        if key not in used:
            used.add(key)
            break
        n += 1
    out = short.ljust(8)[:8] + x.ljust(3)[:3]
    return out.encode('ascii', 'replace')


def _lfn_checksum(short11: bytes) -> int:
    s = 0
    for b in short11:
        s = (((s & 1) << 7) + (s >> 1) + b) & 0xFF
    return s


def _lfn_entries(long_name: str, short11: bytes) -> bytes:
    chksum = _lfn_checksum(short11)
    chars = long_name.encode('utf-16-le')
    # pad with 0x0000 terminator then 0xFFFF
    chars += b'\x00\x00'
    while len(chars) % 26 != 0:
        chars += b'\xff\xff'
    count = len(chars) // 26
    out = bytearray()
    for idx in range(count):
        chunk = chars[idx * 26:(idx + 1) * 26]
        seq = idx + 1
        if idx == count - 1:
            seq |= 0x40  # last (first physically) entry
        entry = bytearray(32)
        entry[0] = seq
        entry[1:11] = chunk[0:10]
        entry[11] = 0x0F
        entry[12] = 0x00
        entry[13] = chksum
        entry[14:26] = chunk[10:22]
        entry[26:28] = b'\x00\x00'
        entry[28:32] = chunk[22:26]
        out[0:0] = entry  # prepend (entries stored in reverse)
    return bytes(out)


def make_fat16_image(files: Dict[str, bytes]) -> bytes:
    """Build a bare (no-partition-table) FAT16 raw image containing ``files``."""
    bps = 512
    spc = 1
    reserved = 1
    num_fats = 1
    root_entries = 512

    data_clusters_needed = sum(max(1, (len(d) + bps - 1) // bps) for d in files.values())
    total_clusters = max(data_clusters_needed + 16, 4200)  # stay safely in FAT16 range
    fat_entries = total_clusters + 2
    fat_size = ((fat_entries * 2) + bps - 1) // bps
    root_dir_sectors = (root_entries * 32 + bps - 1) // bps
    data_start_sector = reserved + num_fats * fat_size + root_dir_sectors
    total_sectors = data_start_sector + total_clusters

    img = bytearray(total_sectors * bps)

    # Boot sector / BPB
    img[0:3] = b'\xeb\x3c\x90'
    img[3:11] = b'MSDOS5.0'
    struct.pack_into('<H', img, 11, bps)
    img[13] = spc
    struct.pack_into('<H', img, 14, reserved)
    img[16] = num_fats
    struct.pack_into('<H', img, 17, root_entries)
    struct.pack_into('<H', img, 19, total_sectors if total_sectors < 0x10000 else 0)
    img[21] = 0xF8  # media
    struct.pack_into('<H', img, 22, fat_size)
    struct.pack_into('<H', img, 24, 63)   # sectors per track
    struct.pack_into('<H', img, 26, 255)  # heads
    struct.pack_into('<I', img, 28, 0)    # hidden sectors
    struct.pack_into('<I', img, 32, total_sectors if total_sectors >= 0x10000 else 0)
    img[36] = 0x80  # drive number
    img[38] = 0x29  # extended boot signature
    struct.pack_into('<I', img, 39, 0x12345678)
    img[43:54] = b'EVIDENCE   '
    img[54:62] = b'FAT16   '
    img[510:512] = b'\x55\xaa'

    fat_off = reserved * bps
    root_off = (reserved + num_fats * fat_size) * bps
    data_off = data_start_sector * bps

    fat = bytearray(fat_size * bps)
    struct.pack_into('<H', fat, 0, 0xFFF8)
    struct.pack_into('<H', fat, 2, 0xFFFF)

    next_free = 2
    root = bytearray()
    used_short = set()

    for name, content in files.items():
        nclusters = max(1, (len(content) + bps - 1) // bps)
        start = next_free
        for j in range(nclusters):
            cluster = next_free
            is_last = j == nclusters - 1
            struct.pack_into('<H', fat, cluster * 2, 0xFFFF if is_last else cluster + 1)
            seg = content[j * bps:(j + 1) * bps]
            off = data_off + (cluster - 2) * bps
            img[off:off + len(seg)] = seg
            next_free += 1

        short11 = _short_name(name, used_short)
        root += _lfn_entries(name, short11)
        entry = bytearray(32)
        entry[0:11] = short11
        entry[11] = 0x20  # archive
        struct.pack_into('<H', entry, 20, (start >> 16) & 0xFFFF)
        struct.pack_into('<H', entry, 26, start & 0xFFFF)
        struct.pack_into('<I', entry, 28, len(content))
        root += entry

    img[fat_off:fat_off + len(fat)] = fat
    img[root_off:root_off + len(root)] = root
    return bytes(img)
