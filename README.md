# CyberTriage

CyberTriage is a **desktop digital forensics & incident response (DFIR) triage tool**. It takes the raw material of an investigation — system logs, network captures, suspicious files — analyzes it automatically, and tells the investigator where the threat is: a risk score, the findings behind it, and what to do next.

> **Student prototype.** Built for a desktop development course. It is *not* an official product of the National Investigation Agency (NIA), and it is not suitable for court-admissible evidence handling. See [Disclaimer](#disclaimer).

---

## Table of contents

- [About CyberTriage](#about-cybertriage)
- [Components](#components)
- [Running it locally](#running-it-locally)
- [Demo walkthrough](#demo-walkthrough)
- [Architecture](#architecture)
- [Running the analysis engine directly (CLI)](#running-the-analysis-engine-directly-cli)
- [How the analysis pipeline works](#how-the-analysis-pipeline-works)
- [Project structure](#project-structure)
- [Database](#database)
- [Reports](#reports)
- [Sample data](#sample-data)
- [Security notes](#security-notes)
- [Available npm scripts](#available-npm-scripts)
- [Troubleshooting](#troubleshooting)
- [Limitations & roadmap](#limitations--roadmap)
- [Disclaimer](#disclaimer)

---

## About CyberTriage

**The problem.** When an incident is reported, an investigator is handed a pile of raw material — logs pulled off a machine, a network capture, files of unknown intent — and needs to answer one question fast: *where is the actual threat in here?* Doing that by hand means reading thousands of log lines, inspecting files one at a time, and mentally correlating events across sources. That is slow, and the real signal hides easily in the noise.

**What this app does.** CyberTriage automates that first triage pass in a desktop application:

1. **Collect into a case.** You create a case and import the evidence you have — individual files or whole folders. Logs, network captures, binaries and documents are all accepted; the app records a hash (SHA-256/MD5) of everything it imports.
2. **Analyze automatically.** One click runs the full pipeline over the imported evidence: parse each file by type, apply file heuristics, detect suspicious log and network patterns, extract indicators of compromise (IPs, URLs, domains, hashes), and score every artifact with an ML anomaly detector.
3. **Prioritize.** All signals are combined into a single **composite risk score (0–100)** with a severity rating (CRITICAL → LOW), a plain-language "why this score" explanation, and a set of prioritized **recommendations** describing the investigator's likely next steps.
4. **Review.** Results are presented for human review in the desktop UI: a dashboard with counts and charts, per-artifact tables, an interactive **timeline** of everything that happened, and a network activity view.
5. **Report.** The case can be exported as a **PDF, JSON, or CSV** investigation report.

In one picture:

```
  Evidence                    Python analysis engine                  Results
  ─────────                   ──────────────────────                  ───────
  logs  ┐                     parse → heuristics → IOC                risk score + severity
  files ├──▶ case ──────────▶ detection → ML anomaly ──────────▶      "why" reasons + next steps
  .json ┘                     scoring → recommendations               dashboard, tables, timeline
                              → timeline → reports                    PDF / JSON / CSV export
```

**Where it comes from.** The project follows the published problem statement of the NIA Anti-Cyber Terrorism Division — streamlining digital forensic investigation through automated evidence collection, analysis, and AI-assisted anomaly detection — and was implemented as a desktop development course project.

**What it is not.** A student prototype, not a product: the "known bad" indicator lists are tiny demo placeholders, the ML flags *statistical* unusualness (not confirmed malice), and some items from the original brief (RAW disk images, registry hives) are not implemented yet — see [Limitations & roadmap](#limitations--roadmap).

---

## Components

CyberTriage is built from four cooperating pieces, plus the glue that connects them:

| # | Component | Technology | Responsibility |
| --- | --- | --- | --- |
| 1 | **Desktop shell** | Electron 44 (TypeScript) | The application window; starts, supervises and restarts the analysis engine; native file dialogs; the secure bridge to the UI |
| 2 | **User interface** | React 19 + Vite + Recharts | Dashboard, case management, evidence and result tables, timeline and charts, export buttons, live engine status |
| 3 | **Analysis engine** | Python 3 (`scikit-learn`, `reportlab`) | The forensic pipeline: parsing → heuristics → IOC detection → ML anomaly scoring → risk scoring → recommendations → timeline → reports |
| 4 | **Case database** | SQLite (Python built-in) | Local, file-backed storage of cases, evidence records, findings and an audit log |
| + | **IPC bridge** | Electron preload + stdin/stdout JSON | Lets the UI invoke engine actions and receive JSON results; nothing else crosses the boundary |

### 1. Desktop shell (Electron)

`electron/main.ts` creates the application window and owns the Python engine's lifecycle: it spawns the engine on startup, watches its ready banner, exposes its state to the sidebar (with a Retry button if it dies), and shuts it down on exit. It also implements the parts a plain web page cannot do — the native "select evidence" picker, the "save report" dialog, and "reveal in Finder/Explorer". `electron/preload.ts` exposes the whole surface to the UI through a single, narrow `window.api` object.

### 2. User interface (React)

Three screens, in `src/pages/`:

- **Overview (dashboard)** — stat cards (evidence, artifacts, IOCs, timeline events, severity counts), the composite risk gauge with "why this score" reasons, and charts for artifact severity, IOC types and timeline activity.
- **Cases** — the case list and a create-case form.
- **Case detail** — the working screen. Six tabs: **Evidence** (imported items + hashes), **Artifacts** (files with severity and ML scores), **IOCs**, **Timeline**, **Network**, and **Risk** (score gauge, score breakdown bars, recommendations). Action buttons: *Import evidence*, *Load sample data*, *Run analysis*, *Export PDF/JSON/CSV*.

### 3. Analysis engine (Python)

A self-contained program (`python/`) that knows nothing about the UI — it reads JSON commands on stdin and writes JSON results on stdout. Its modules map one-to-one onto the [pipeline stages](#how-the-analysis-pipeline-works): `parsers/` (file, log, network), `ioc/detector.py`, `ml/anomaly_detector.py` (a real scikit-learn Isolation Forest), `risk/scorer.py`, `recommendations/engine.py`, `timeline/builder.py`, and `reports/generator.py`.

### 4. Case database (SQLite)

Everything an investigation produces is stored locally in `cybertriage.db` at the project root — 8 tables covering cases, evidence, artifacts, IOCs, network activity, risk findings, timeline events, and an append-only audit log (see [Database](#database)). Evidence *files* are referenced by path, not copied.

### 5. The glue: IPC bridge

The renderer never talks to Node or Python directly. It calls `window.api.engineRequest(action, payload)`, the preload forwards it over Electron IPC, the main process relays it to the Python engine as one JSON line, and the JSON answer comes back the same way. This is what lets the UI and the engine be developed and tested independently.

---

## Running it locally

### What you need

| Tool | Version | Notes |
| --- | --- | --- |
| **Node.js** | 20.19+ | Required by Vite 8; developed and verified on Node 22 |
| **Python** | 3.10+ | Developed and verified on Python 3.11 |
| **npm** | Ships with Node | |
| **OS** | macOS (primary), Linux, Windows | The DMG packaging script targets macOS |

Check your versions:

```bash
node --version
python3 --version
```

### One-time setup

From the project root:

```bash
# 1. JavaScript dependencies
npm install

# 2. Python virtual environment + engine dependencies
python3 -m venv python/venv
python/venv/bin/pip install --upgrade pip
python/venv/bin/pip install -r requirements.txt
```

<details>
<summary>Windows equivalent</summary>

```powershell
py -m venv python/venv
python/venv/Scripts/pip install --upgrade pip
python/venv/Scripts/pip install -r requirements.txt
```

</details>

The engine dependencies (`requirements.txt`):

| Package | Used for |
| --- | --- |
| `scikit-learn` | Isolation Forest anomaly detection |
| `numpy` | Feature vectors for the ML model |
| `reportlab` | PDF report generation |
| `pytest` | Test framework (future test suites) |

### Start the app

```bash
npm run electron:dev
```

What happens:

1. The Electron build step compiles the preload bridge to `dist-electron/preload.cjs`
2. Vite starts the React dev server on **http://localhost:5173**
3. `wait-on` waits for that server to be ready
4. Electron opens a desktop window pointing at it
5. Electron spawns the Python engine and logs its ready banner to the terminal:

```
[engine] {"status": "ready", "engine": "CyberTriage Python Analysis Engine v1.0"}
```

The sidebar pill mirrors the engine state (**Engine ready**); if the engine fails, the pill turns red and offers a **Retry** button. Press `Ctrl+C` in the terminal to stop Electron and Vite together.

**Do I need to activate the venv?** No. Electron looks for `python/venv/bin/python3` first and only falls back to the system `python3` if the venv is missing. (Windows: the auto-detect path is POSIX-only, so activate the venv first — `python\venv\Scripts\activate`.) If you skip [setup step 2](#one-time-setup) entirely, the engine exits with `ModuleNotFoundError: No module named 'sklearn'` — check the terminal for `[engine stderr]` output in that case.

### Frontend only (no desktop shell)

```bash
npm run dev
```

Opens the React app in your browser at http://localhost:5173. Useful for pure UI work — the page shows a banner explaining that the desktop bridge is unavailable.

### Production build

```bash
npm run build     # tsc -b && vite build  →  dist/
npm run preview   # serve the built bundle locally
```

### Packaging (experimental)

```bash
npm run package        # current platform
npm run package:dmg    # macOS .dmg
```

> ⚠️ Packaging uses electron-builder defaults and has **not** been verified end-to-end. It also does not yet bundle the Python engine, so a packaged app will only start the engine if `python3` with the dependencies is available on the target machine.

---

## Demo walkthrough

A 60-second tour for a class presentation, using the bundled synthetic evidence:

1. **Launch** — `npm run electron:dev`. Confirm the green **Engine ready** pill in the sidebar.
2. **Create a case** — *Cases → New case*. Give it a name (e.g. "Demo — Finance workstation") and an investigator name.
3. **Load evidence** — on the case page press **Load sample data**. Six evidence items are imported from `sample-data/` (suspicious executables, an auth log, a network capture).
4. **Analyze** — press **Run analysis**. The pipeline parses everything, scores it and returns a risk assessment.
5. **Review** — walk the tabs:
   - **Artifacts** — 6 files with severity chips and ML anomaly scores
   - **IOCs** — 15 indicators (IPs, URLs, domains, one SHA-256) with risk ratings
   - **Timeline** — 86 unified events sorted by time
   - **Network** — 26 connections; suspicious ports (4444, 1337, 3389, …) highlighted
   - **Risk** — score gauge (**83 / CRITICAL**), "Why this score" reasons, score breakdown bars, and 11 prioritized recommendations
6. **Export** — **Export PDF / JSON / CSV** on the case header; the report lands in `python/reports_output/` (the app offers to reveal it in Finder/Explorer).

These numbers are reproducible from a fresh database with the bundled sample data — verified end-to-end by driving the real app.

---

## Architecture

```
┌─────────────────────────────── Electron ────────────────────────────────┐
│                                                                         │
│   Renderer process                    Main process (Node.js)            │
│   ┌──────────────────────────┐       ┌──────────────────────────┐       │
│   │  React 19 + Vite (src/)  │       │  electron/main.ts        │       │
│   │  http://localhost:5173   │◀─────▶│  · creates the window    │       │
│   │                          │  IPC  │  · starts the engine     │       │
│   │  window.api (preload)    │       │  · handles ipcMain       │       │
│   └──────────────────────────┘       └────────────┬─────────────┘       │
│          contextIsolation: true                  │ spawn('python3')     │
│          nodeIntegration: false                  │ shell: no            │
└──────────────────────────────────────────────────┼─────────────────────┘
                                                   ▼
                                    ┌────────────────────────────────┐
                                    │  Python engine                 │
                                    │  python/main.py                │
                                    │                                │
                                    │  JSON command  ──▶ stdin       │
                                    │  JSON result   ◀── stdout      │
                                    └───────────────┬────────────────┘
                                                    ▼
                        ┌───────────────────────────────────────────┐
                        │  SQLite: cybertriage.db (project root)    │
                        │  Reports: python/reports_output/          │
                        └───────────────────────────────────────────┘
```

The Python engine is a long-lived process that speaks **newline-delimited JSON** over stdin/stdout:

- Send it a command: `{"id": 1, "action": "create_case", "payload": {"name": "..."}}`
- It answers with: `{"ok": true, "result": {...}, "id": 1}` or `{"ok": false, "error": "...", "id": 1}`
- On startup it prints a ready banner: `{"status": "ready", "engine": "CyberTriage Python Analysis Engine v1.0"}`

This keeps the analysis logic completely separate from the UI: the engine has no idea whether it is talking to Electron or to your terminal.

**Renderer API** — the preload script (`electron/preload.ts`, CJS) exposes a deliberately narrow surface on `window.api`:

| Method | Purpose |
| --- | --- |
| `ping()` | Bridge health check |
| `engineRequest(action, payload)` | Send any engine action (see the [actions reference](#engine-actions-reference)) |
| `engineStatus()` / `engineRestart()` / `onEngineState(cb)` | Engine lifecycle + live status for the sidebar pill |
| `pickEvidence()` | Native open dialog (files and/or folders, multi-select) |
| `saveReportDialog(defaultName)` | Native save dialog for report exports |
| `revealPath(path)` | Show a generated report in Finder/Explorer |

Electron runs `main.ts` directly in development. Before it opens the window, `npm run electron:dev` compiles the security-sensitive preload bridge to `dist-electron/preload.cjs`, which Electron loads in the renderer process.

---

## Running the analysis engine directly (CLI)

The engine is a plain stdin/stdout program, so you can drive the whole analysis workflow without the UI — handy for debugging or for demoing the pipeline in a terminal.

```bash
python/venv/bin/python python/main.py
```

The engine prints a ready banner, then processes **one JSON command per line**. Type (or paste) commands and read the JSON responses:

```
{"action": "ping"}
{"action": "create_case", "payload": {"name": "Demo Case", "description": "Class demo", "investigator": "Your Name"}}
```

`create_case` returns a case ID such as `CT-2026-F0B810` — use it in the following commands:

```
{"action": "import_evidence", "payload": {"case_id": "CT-2026-F0B810", "file_path": "/absolute/path/to/auth.log"}}
{"action": "import_evidence", "payload": {"case_id": "CT-2026-F0B810", "file_path": "/absolute/path/to/network_capture.json"}}
{"action": "run_analysis", "payload": {"case_id": "CT-2026-F0B810"}}
```

Or import the bundled sample data in one shot:

```
{"action": "load_sample_data", "payload": {"case_id": "CT-2026-F0B810"}}
```

`run_analysis` returns the summary (artifact counts, IOC counts, timeline events, risk score, recommendations). Then inspect or export:

```
{"action": "get_dashboard_stats", "payload": {"case_id": "CT-2026-F0B810"}}
{"action": "get_iocs", "payload": {"case_id": "CT-2026-F0B810"}}
{"action": "get_timeline", "payload": {"case_id": "CT-2026-F0B810"}}
{"action": "generate_report", "payload": {"case_id": "CT-2026-F0B810", "format": "pdf"}}
```

Press `Ctrl+D` to stop the engine.

> Paths must be **absolute**. Evidence may be a single file or a directory (directories are scanned recursively). Generated reports land in `python/reports_output/`.

### Engine actions reference

| Action | Payload | Returns |
| --- | --- | --- |
| `ping` | – | `"pong"` (health check) |
| `create_case` | `name`, `description?`, `investigator?` | The new case record |
| `list_cases` | – | All cases, newest first |
| `get_case` | `case_id` | One case record |
| `import_evidence` | `case_id`, `file_path` | Evidence record (SHA-256 + MD5 for files < 500 MB) |
| `get_evidence` | `case_id` | Evidence items for the case |
| `run_analysis` | `case_id` | Full analysis summary (see below) |
| `get_artifacts` | `case_id` | File artifacts with severity + anomaly scores |
| `get_iocs` | `case_id` | Indicators of compromise |
| `get_timeline` | `case_id` | Unified, time-sorted event timeline |
| `get_risk_findings` | `case_id` | Risk score, severity, reasons, recommendations |
| `get_network_activity` | `case_id` | Parsed network connections |
| `get_dashboard_stats` | `case_id` | Counts + severity/IOC distributions + activity by day |
| `generate_report` | `case_id`, `format` (`pdf`/`json`/`csv`), `output_path?` | Path(s) written |
| `load_sample_data` | `case_id` | Imports everything from `sample-data/{files,logs,network}` (already-imported paths are skipped) |

Re-running `run_analysis` on a case **replaces** its derived results (artifacts, IOCs, timeline, network) instead of duplicating them, and records a new risk assessment. The UI always shows the latest assessment.

Data persists in **`cybertriage.db`** at the project root (created automatically on first run; SQLite WAL mode). Delete the file to start fresh.

---

## How the analysis pipeline works

`run_analysis` orchestrates the full pipeline for every piece of imported evidence:

**1. Parsing** — evidence is routed by type:

| Input | Parser | Extracts |
| --- | --- | --- |
| Directory | `parsers/file_parser.py` | Recursive file scan (skips hidden dirs, `node_modules`, `.git`, `venv`) |
| `.log`, `.txt`, `.csv` | `parsers/log_parser.py` | Timestamped events, failed logins, IPs, usernames, suspicious patterns |
| `.json` | `parsers/network_parser.py` | Network records (`[{...}]` or `{"records": [...]}`) — anomalies, external destinations, top talkers |
| Any other file | `parsers/file_parser.py` | Metadata + heuristics |

**2. File heuristics** — flags suspicious extensions (`.exe`, `.bat`, `.cmd`, `.ps1`, `.vbs`, `.js`, `.jar`, `.sh`, `.scr`, `.pif`, `.com`, `.hta`, `.msi`, `.dll`, `.so`, `.dylib`), double extensions (`invoice.pdf.exe`), hidden files, executable permissions, and suspiciously small executables, with a severity per finding.

**3. Log pattern detection** — `Repeated Failed Logins` (≥ 3), `Repeated Attempts from Single IP` (≥ 5 events), `Activity During Unusual Hours` (midnight–6am).

**4. Network analysis** — flags connections to suspicious ports (4444, 1337, 31337, 8080, 9999, 6667, 6666, 23, 2323, 5900, 5901, 3389, 1433, 3306), high-frequency destinations (≥ 10 connections → possible C2/exfiltration), high-frequency sources (≥ 15 → possible scanning), and marks non-private destinations as external.

**5. IOC detection** (`ioc/detector.py`) — regex extraction of IPv4 addresses, URLs, domains, and MD5/SHA-1/SHA-256 hashes, cross-referenced against small built-in "known suspicious" demo lists. Loopback addresses are skipped; private IPs are reported but keep a lower risk rating.

**6. ML anomaly detection** (`ml/anomaly_detector.py`) — a real `sklearn` **Isolation Forest** (100 estimators) scores every artifact on 12 features, including file age, size, executable/hidden flags, double-extension flag, failed-login count, unique-IP count, event frequency, and network connection counts. Scores are normalized to 0–100 (higher = more anomalous). With fewer than 2 artifacts the detector returns a neutral score.

**7. Composite risk scoring** (`risk/scorer.py`) — weighted, capped contributions add up to a 0–100 score with human-readable reasons (duplicates removed):

| Signal | Max points |
| --- | --- |
| High/medium-risk IOCs | 30 |
| Suspicious file findings | 25 |
| Suspicious log patterns | 20 |
| Network anomalies | 15 |
| ML anomaly score | 10 |

| Score | Severity |
| --- | --- |
| 81–100 | CRITICAL |
| 61–80 | HIGH |
| 31–60 | MEDIUM |
| 0–30 | LOW |

**8. Recommendations** (`recommendations/engine.py`) — each finding type maps to an investigator-oriented next step ("correlate failed logins with successful ones", "verify the file hash against a known-good baseline", …), prioritized HIGH/MEDIUM/LOW.

**9. Timeline** (`timeline/builder.py`) — file timestamps, log events, IOC detections, and network connections are merged into one time-sorted timeline.

**10. Audit trail** — every case action (creation, imports, analysis runs, report generation) is recorded in the `audit_log` table with a timestamp.

---

## Project structure

```
CYBERTRIAGE/
├── electron/
│   ├── main.ts               # Electron main process — window, engine spawn/lifecycle, ipcMain handlers
│   └── preload.ts            # contextBridge — exposes the minimal window.api surface (CJS)
├── src/                      # React renderer
│   ├── main.tsx              # React entry (HashRouter)
│   ├── App.tsx               # Shell: sidebar, engine-status pill, routes
│   ├── api.ts                # Typed wrappers around window.api + bridge detection
│   ├── constants.ts          # Severity/risk order, colors, chart styling
│   ├── format.ts             # Date/number/error formatting helpers
│   ├── types.ts              # Shared TypeScript types
│   ├── components/ui.tsx     # Panel, badges, gauge, empty state, spinner, engine pill
│   ├── pages/
│   │   ├── Dashboard.tsx     # Overview: stat cards, risk gauge, distribution charts
│   │   ├── Cases.tsx         # Case list + create form
│   │   └── CaseDetail.tsx    # Evidence, Artifacts, IOCs, Timeline, Network, Risk tabs
│   └── index.css             # Application styling
├── python/
│   ├── main.py               # Engine entry point — JSON-over-stdin/stdout loop
│   ├── analyzer/core.py      # CaseAnalyzer — orchestrates the full pipeline
│   ├── parsers/              # file_parser, log_parser, network_parser
│   ├── ioc/detector.py       # Regex IOC extraction
│   ├── ml/anomaly_detector.py# Isolation Forest scoring
│   ├── risk/scorer.py        # Composite 0–100 risk score
│   ├── recommendations/      # Finding → investigation-step templates
│   ├── timeline/builder.py   # Unified event timeline
│   ├── reports/generator.py  # PDF / JSON / CSV reports
│   ├── utils/                # db.py (SQLite), hashing.py (SHA-256/MD5)
│   └── venv/                 # Local virtual environment (not committed)
├── database/schema.sql       # SQLite schema (auto-applied on first run)
├── sample-data/              # Synthetic demo evidence (see below)
│   ├── files/  ├── logs/  ├── network/  └── cases/
├── public/                   # Static assets (favicon)
├── index.html                # Vite entry + Content-Security-Policy meta tag
├── package.json
├── requirements.txt
└── Student.md                # Development log (per-session notes)
```

---

## Database

SQLite (`cybertriage.db`, project root), schema in [`database/schema.sql`](database/schema.sql):

| Table | Holds |
| --- | --- |
| `cases` | Case ID (`CT-YYYY-XXXXXX`), name, description, investigator, status |
| `evidence` | Imported files/directories + hashes + analysis status |
| `artifacts` | File analysis results (severity, ML score, findings) |
| `ioc_findings` | Extracted IOCs with risk + explanation |
| `network_activity` | Normalized network connections |
| `risk_findings` | Composite score, severity, reasons, recommendations (JSON) — one row per analysis run |
| `timeline_events` | Unified sorted timeline |
| `audit_log` | Append-only record of case actions |

Note the app stores evidence **paths and analysis results**, not copies of the evidence files themselves.

---

## Reports

`generate_report` writes to `python/reports_output/` (override with `output_path`):

| Format | Output |
| --- | --- |
| `pdf` | Formatted investigation report — case info, risk assessment, evidence summary, IOC table, recommendations, timeline excerpt, limitations notice |
| `json` | Complete machine-readable export (case, evidence, artifacts, IOCs, risk, timeline) |
| `csv` | Directory containing `artifacts.csv`, `iocs.csv`, `timeline.csv` |

In the UI, the three export buttons open a native save dialog and offer to reveal the written file. If `reportlab` is unavailable, the PDF path falls back to a plain-text report.

---

## Sample data

`sample-data/` contains a small **synthetic dataset** designed to exercise every parser and detection rule. It is fake data — nothing in it is a real indicator.

| File | Demonstrates |
| --- | --- |
| `logs/auth.log` | 6 failed logins from `185.220.101.1` in the 02:00–03:00 window, repeated attempts thresholds, `curl` download of a payload from `malware-c2.xyz`, `chmod +x` and execution, a suspected C2 beacon to `185.220.101.2:4444` |
| `network/connections.json` | 26 records — high-frequency source/destination, suspicious ports (4444, 1337, 3389, 8080, 9999), external destinations |
| `files/update.ps1` | Script extension, embedded URL/IP/hash IOCs, "scheduled task" string |
| `files/invoice_2026.pdf.exe` | Double extension + executable + suspiciously small |
| `files/.hidden_payload` | Hidden file with executable permissions |
| `files/notes.txt` | Benign-looking document (should stay LOW) |

`sample-data/cases/` is intentionally empty — drop your own case documents there if you want them included by **Load sample data**.

You can also import your own evidence: any file or folder works, and `.log`/`.txt`/`.csv` and `.json` files get the deeper parsers. The `load_sample_data` action is idempotent — paths already imported into the case are skipped.

---

## Security notes

The Electron shell follows the standard hardening checklist:

- `contextIsolation: true` — renderer JavaScript cannot reach Node/Electron internals
- `nodeIntegration: false` — no `require()` in the renderer
- The preload exposes a deliberately small API (see [Architecture](#architecture)); every engine call goes through `ipcMain` and a single `engine:request` channel
- The Python engine is spawned without a shell (`spawn` with an argument array), so file paths cannot be interpreted as shell commands
- A strict **Content-Security-Policy** is set in `index.html` (`script-src 'self'` with no `unsafe-eval`), which also clears Electron's dev-mode CSP warning

Prototype trade-offs: the `engine:request` channel is generic, so any engine action can be invoked from the renderer — a production build should allow-list actions. The SQLite database and reports are unencrypted local files.

---

## Available npm scripts

| Script | Command | What it does |
| --- | --- | --- |
| `npm run dev` | `vite` | Frontend dev server only (http://localhost:5173) |
| `npm run electron:dev` | `concurrently` + `wait-on` + `electron .` | Full desktop app in development |
| `npm run build` | `tsc -b && vite build` | Type-check + production bundle into `dist/` |
| `npm run preview` | `vite preview` | Serve the production bundle locally |
| `npm run lint` | `oxlint` | Fast TypeScript/React lint |
| `npm run electron:build` | `npm run build && electron-builder` | Compile + package the desktop app |
| `npm run package` | alias of `electron:build` | Package for the current platform |
| `npm run package:dmg` | `electron:build -- --mac dmg` | macOS `.dmg` installer |

---

## Troubleshooting

**The sidebar pill shows an engine error / no `[engine]` banner**
The engine needs `scikit-learn`, `numpy` and `reportlab`. If `python/venv` does not exist, Electron falls back to the system `python3` — which may not have them. Run:

```bash
python3 -m venv python/venv
python/venv/bin/pip install -r requirements.txt
```

then press **Retry** in the sidebar (or relaunch). Engine stderr is forwarded to the terminal with an `[engine stderr]` prefix.

**The app says “Desktop bridge unavailable” after `npm run electron:dev`**
Stop any existing dev processes with `Ctrl+C`, then rerun `npm run electron:dev`. The command rebuilds `dist-electron/preload.cjs` before Electron opens, so do not start Electron separately with `npx electron .` during normal development.

**First `npx electron .` run pauses on "Downloading Electron binary..."**
One-time download of the Electron runtime (~100 MB). Let it finish; subsequent runs are instant.

**Port 5173 already in use**
Another Vite or Electron development process is still using the required port. Stop it with `Ctrl+C` in its terminal, then retry `npm run electron:dev`. The command intentionally refuses to start on another port so Electron cannot load a stale browser-only server.

**Re-analysis seems to "forget" a report I generated**
Correct — derived results are replaced on each analysis run by design; re-export the report after the new run if needed.

**`load_sample_data` imports 0 files**
All files under `sample-data/{files,logs,network}` are already imported into that case, or the folders are empty. (`sample-data/cases/` is empty by design.) Delete `cybertriage.db*` for a completely fresh state.

**Reset all local data**
Delete `cybertriage.db` (and `cybertriage.db-wal` / `cybertriage.db-shm` if present). It is recreated on the next run.

---

## Limitations & roadmap

Known gaps in the current prototype — being upfront about these matters for a forensics tool:

- **No RAW/disk-image parsing (roadmap).** The brief calls for ingesting RAW forensic images; today evidence is imported as individual files or folders. `dd`/E01 images are not mounted and not carved — that is the biggest missing piece.
- **No registry parsing (roadmap).** The brief mentions registry entries; Windows registry hives are not parsed yet. Log/file/network analysis is implemented.
- **Network CSV files** are parsed as logs, not as network records — `parse_network_csv` exists but is not wired into `run_full_analysis`.
- **Packaging is unverified** and does not bundle Python. The venv has `pyinstaller` installed, suggesting the intended approach is to freeze the engine into a standalone binary for distribution.
- **ML is assistive only** — Isolation Forest flags *statistical* unusualness, not confirmed malice; it is trained per-run on the imported evidence (no pretrained model) and needs at least 2 artifacts.
- **IOC "known bad" lists are tiny demo placeholders**, not threat-intelligence feeds.
- **Evidence is referenced, not copied** — deleting or moving the original file breaks re-analysis.
- **No tests yet** — `pytest` is installed but no test suite exists.
- `tailwindcss`/`postcss` are installed but not configured; the UI uses plain CSS (`src/index.css`).

---

## Disclaimer

CyberTriage is a student prototype inspired by the published digital forensics and incident response problem statement. It is **not** an official product of the National Investigation Agency (NIA), and it must not be used for real investigations or court-admissible evidence handling. ML-assisted findings indicate statistical unusualness, not confirmed malicious activity.
