#!/usr/bin/env python3
"""
Regenerate the synthetic forensic demo evidence:

  sample-data/datasets/05-disk-image/apt-workstation.dd   (RAW FAT image)
  sample-data/datasets/06-registry-hive/NTUSER.DAT        (Windows registry hive)

The disk image contains the 04-apt-breach evidence files plus the demo registry
hive, so importing that one image exercises disk-image carving AND registry
parsing. Everything is synthetic — placeholder IPs/domains and dummy files.

Run from the project root:  python3 scripts/make_demo_evidence.py
"""
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, 'python'))

from parsers.disk_image import make_fat16_image  # noqa: E402
from parsers.registry import make_demo_hive       # noqa: E402

DATASETS = os.path.join(ROOT, 'sample-data', 'datasets')


def write(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f:
        f.write(data)
    print(f'  wrote {os.path.relpath(path, ROOT)} ({len(data):,} bytes)')


def main():
    hive = make_demo_hive()

    # 06 — standalone registry hive
    write(os.path.join(DATASETS, '06-registry-hive', 'NTUSER.DAT'), hive)

    # 05 — raw disk image = apt-breach files + the hive
    src = os.path.join(DATASETS, '04-apt-breach')
    files = {}
    for fn in sorted(os.listdir(src)):
        p = os.path.join(src, fn)
        if os.path.isfile(p) and fn != 'README.md':
            with open(p, 'rb') as f:
                files[fn] = f.read()
    files['NTUSER.DAT'] = hive
    write(os.path.join(DATASETS, '05-disk-image', 'apt-workstation.dd'), make_fat16_image(files))
    print('Done.')


if __name__ == '__main__':
    main()
