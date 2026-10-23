# 05 · RAW Disk Image — expected risk: CRITICAL

`apt-workstation.dd` is a **synthetic RAW forensic disk image** (a bare FAT16
volume, the same kind of raw image `dd`/FTK Imager produce). CyberTriage opens
it, **walks the filesystem**, and analyses every file inside — exactly what the
problem statement's "automated collection from RAW images" calls for.

Inside the image:

- the full **04-apt-breach** evidence set (double‑extension payloads, hidden
  persistence script, brute‑force log, bad IPs/domains, multi‑port C2 capture), and
- a Windows registry hive **`NTUSER.DAT`** with malicious autostart (Run) keys.

So importing this **one** image exercises *both* new capabilities at once:
disk‑image carving **and** registry parsing.

**How to import:** create a case → **Import evidence** → select
`apt-workstation.dd` → **Import** → **Run analysis**.

Expected result: **CRITICAL** (~89/100), ~10 artifacts (including 3 Registry
autostart findings), many high‑risk IOCs.

> It's a real, standard FAT image — you can even double‑click it in Finder to
> mount it as a volume named *EVIDENCE*. Everything in it is fake and safe.
