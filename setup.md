# CyberTriage — Setup & Commands

Everything you need to **run**, **build**, and **share** CyberTriage, plus a map of
**where each kind of data lives**. Pick the path that matches what you want to do.

| I want to… | Go to |
| --- | --- |
| Just open the app (no coding) | [A · Install the DMG](#a--install-the-dmg) |
| Run it from source for development | [B · Run from source](#b--run-from-source) |
| Build a shareable DMG myself | [C · Build the DMG](#c--build-the-dmg) |
| Get the sample datasets & load them | [Sample datasets](#sample-datasets) |
| Know where the database / reports are | [Where the data lives](#where-the-data-lives) |
| Reset or fix something | [Reset & troubleshooting](#reset--troubleshooting) |

---

## Prerequisites

Only needed for **building or running from source** (path B/C). To just install the
DMG (path A), you need none of this.

| Tool | Version | Check |
| --- | --- | --- |
| macOS | 11 Big Sur+ on **Apple Silicon** (M1–M4) | `uname -m` → `arm64` |
| Node.js | 20.19+ (built on 22) | `node --version` |
| Python | 3.10+ (built on 3.11) | `python3 --version` |

---

## A · Install the DMG

For anyone you share the app with. **Apple Silicon Macs only.**

1. Open **`CyberTriage-1.0.0-arm64-signed.dmg`**.
2. Drag **CyberTriage** onto the **Applications** folder shown in the window.
3. **First launch (one time):** because the app isn't signed with a paid Apple
   Developer certificate, macOS Gatekeeper will warn you. Bypass it once:
   - **Right-click** (or Control-click) CyberTriage in Applications → **Open** →
     **Open** in the dialog. It opens normally every time after that.
   - If macOS says *"CyberTriage is damaged and can't be opened"*, run this once
     in **Terminal**, then open the app:
     ```bash
     xattr -cr /Applications/CyberTriage.app
     ```

> The DMG bundles the analysis engine and sample data — **no Python or Node needed**
> on the recipient's machine.

Inside the app: **create a case → Load sample data → Run analysis**.

---

## B · Run from source

For development, with hot-reloading UI.

```bash
# 1. Clone / open the project, then from the project root:
npm install

# 2. One-time Python engine setup (virtual env + dependencies)
python3 -m venv python/venv
python/venv/bin/pip install --upgrade pip
python/venv/bin/pip install -r requirements.txt

# 3. Launch the full desktop app (Vite + Electron + Python engine)
npm run electron:dev
```

You should see the green **Engine ready** pill in the sidebar and this in the terminal:

```
[engine] {"status": "ready", "engine": "CyberTriage Python Analysis Engine v1.0"}
```

Stop everything with `Ctrl+C`.

**Other source commands**

```bash
npm run dev        # Frontend only in a browser (no engine; shows a bridge banner)
npm run build      # Type-check + production web bundle → dist/
npm run preview    # Serve the built bundle
npm run lint       # Fast lint (oxlint)
```

<details>
<summary>Drive the Python engine directly (no UI)</summary>

```bash
python/venv/bin/python python/main.py
```
Then type one JSON command per line, e.g.:
```json
{"action": "create_case", "payload": {"name": "CLI demo"}}
{"action": "load_sample_data", "payload": {"case_id": "CT-2026-XXXXXX"}}
{"action": "run_analysis", "payload": {"case_id": "CT-2026-XXXXXX"}}
{"action": "generate_report", "payload": {"case_id": "CT-2026-XXXXXX", "format": "pdf"}}
```
`Ctrl+D` to exit. See the README's *Engine actions reference* for all actions.
</details>

---

## C · Build the DMG

Produces the shareable installer. **Run on an Apple Silicon Mac** (the build is arm64).
Requires path B setup first (Node deps + Python venv).

```bash
# Full build: freezes the Python engine, builds the UI, packages the app,
# and produces release/CyberTriage-1.0.0-arm64.dmg
npm run package:mac-arm64

# Ad-hoc sign it and repackage into a friendly, shareable DMG
# (adds a drag-to-Applications shortcut + a "How to Open" note inside)
npm run resign
```

**The file to share:**

```
release/CyberTriage-1.0.0-arm64-signed.dmg
```

What the build does, step by step:

| Step | Command | Output |
| --- | --- | --- |
| Freeze Python engine | `build:engine` (PyInstaller) | `artifacts/engine/CyberTriageEngine` (standalone binary) |
| Build UI + Electron main | `build` | `dist/`, `dist-electron/main.cjs` |
| Package app + DMG | `electron-builder` | `release/mac-arm64/CyberTriage.app`, `release/CyberTriage-1.0.0-arm64.dmg` |
| Ad-hoc sign + friendly DMG | `resign` | `release/CyberTriage-1.0.0-arm64-signed.dmg` |

> **Notarization:** there is **no** Apple Developer account configured, so the app is
> ad-hoc signed only. Recipients must do the one-time Gatekeeper bypass in
> [path A, step 3](#a--install-the-dmg). Notarization ($99/yr Apple Developer
> Program) would remove that warning entirely.
>
> **Intel Macs are not supported** by this build. A universal build would require
> also freezing the Python engine for x86_64.

---

## Sample datasets

Small, **synthetic** evidence (fake — nothing is a real threat) that exercises every
parser and detection rule. There are two copies:

| Location | Purpose |
| --- | --- |
| `sample-data/` (in the project) | Source of truth; bundled into the DMG |
| `~/Desktop/CyberTriage-Sample-Data/` | Standalone local copy for the **Import evidence** picker; see its `INDEX.txt` |

**Three ways to load it:**

1. **In-app button** — open a case → **Load sample data** (uses the copy bundled in
   the app; nothing external needed).
2. **Import evidence** — open a case → **Import evidence** → select
   `~/Desktop/CyberTriage-Sample-Data/` (or any files/folders of your own).
3. **CLI** — `load_sample_data` action (see path B's engine block).

What's inside:

```
files/     invoice_2026.pdf.exe, benefits_update.pdf.exe  → double-extension executables
           update.ps1                                     → script with embedded IOCs
           .hidden_payload                                → hidden + executable
           notes.txt                                      → benign (stays LOW)
logs/      auth.log            → failed-login burst, curl download, C2 beacon
           vpn_auth_burst.log  → repeated VPN auth attempts
network/   connections.json    → suspicious ports, top talkers, external dests
           periodic_beacon.json→ regular-interval beaconing (possible C2)
```

---

## Where the data lives

The app reads/writes different locations depending on whether it's running **from
source** (path B) or **as the installed app** (path A).

| Data | From source (dev) | Installed app (DMG) |
| --- | --- | --- |
| **Case database** (`cybertriage.db`) | project root | `~/Library/Application Support/CyberTriage/cybertriage.db` |
| **Generated reports** (PDF/JSON/CSV) | `python/reports_output/` | `~/Library/Application Support/CyberTriage/reports/` |
| **Sample data** (read-only) | `sample-data/` | inside the app bundle (`…/Contents/Resources/sample-data`) |
| **DB schema** | `database/schema.sql` | inside the app bundle (`…/Contents/Resources/database`) |
| **Analysis engine** | `python/` via the venv | frozen binary in the app bundle (`…/Contents/Resources/engine`) |

Notes:
- Evidence files are **referenced by path, not copied** — moving/deleting an original
  breaks re-analysis of it.
- Re-running analysis **replaces** a case's derived results (artifacts, IOCs, timeline)
  and records a new risk assessment; it does not duplicate them.

---

## Reset & troubleshooting

**Start over with a clean database**

```bash
# From source:
rm -f cybertriage.db cybertriage.db-wal cybertriage.db-shm

# Installed app:
rm -rf ~/Library/Application\ Support/CyberTriage
```

**Engine won't start (red pill / no `[engine]` banner, from source)**
The venv is missing or lacks dependencies:
```bash
python3 -m venv python/venv
python/venv/bin/pip install -r requirements.txt
```
Then press **Retry** in the sidebar. Engine errors are printed with an `[engine stderr]` prefix.

**"Desktop bridge unavailable"** — you ran `npm run dev` (browser only). Use
`npm run electron:dev` for the full app.

**Port 5173 already in use** — another Vite/Electron dev process is running; stop it
with `Ctrl+C` and rerun `npm run electron:dev`.

**`load_sample_data` imports 0 files** — those paths are already imported into the
case (it's idempotent). Reset the database for a fresh run.
