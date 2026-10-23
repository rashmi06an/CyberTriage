# 06 · Windows Registry Hive

`NTUSER.DAT` is a **synthetic Windows registry hive** (real binary `regf`
format). CyberTriage parses it and surfaces **autostart / persistence** entries —
the `...\CurrentVersion\Run` keys attackers use to survive a reboot.

Inside this hive's Run key:

| Value | Verdict |
| --- | --- |
| `SecurityHealth` → `…\SecurityHealthSystray.exe` | MEDIUM (legitimate‑looking autostart) |
| `Updater` → `powershell -enc …` | **HIGH** (encoded PowerShell) |
| `svchost` → `C:\Users\Public\…\Temp\svchost_update.exe` | **HIGH** (runs from a temp path) |

**How to import:** create a case → **Import evidence** → select `NTUSER.DAT` →
**Import** → **Run analysis**. Open the **Artifacts** tab to see the Registry
findings.

Expected result: the two **HIGH** and one **MEDIUM** autostart entries show up as
*Registry* artifacts. Overall case risk stays **LOW (~19/100)** on purpose — a lone
hive is a single signal source. See **dataset 05** for the same hive inside a full
breach, where it contributes to a **CRITICAL** score.

> Hives are also parsed automatically when found **inside a disk image** (see
> dataset 05). Everything here is synthetic and safe.
