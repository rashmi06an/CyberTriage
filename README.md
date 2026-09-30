<div align="center">

#  CyberTriage

**A desktop DFIR triage tool that turns a pile of raw evidence into a ranked, explained threat assessment — in one click.**

Import logs, network captures and suspicious files → automated parsing, IOC extraction and ML anomaly scoring → a single composite **risk score**, the reasons behind it, and prioritized next steps.

![Platform](https://img.shields.io/badge/platform-macOS%20(Apple%20Silicon)-black)
![Electron](https://img.shields.io/badge/Electron-44-47848F)
![React](https://img.shields.io/badge/React-19-61DAFB)
![Python](https://img.shields.io/badge/Python-3.10%2B-3776AB)
![ML](https://img.shields.io/badge/ML-scikit--learn%20Isolation%20Forest-F7931E)
![Status](https://img.shields.io/badge/status-student%20prototype-blue)

</div>

> [!NOTE]
> **Student prototype** for a desktop-development course, inspired by the NIA Anti‑Cyber Terrorism Division problem statement. It is **not** an official NIA product and is **not** suitable for court‑admissible evidence handling. See [Disclaimer](#-disclaimer).

---

##  Contents

[Overview](#-overview) · [Features](#-features) · [Quick start](#-quick-start) · [Architecture](#-architecture) · [Analysis pipeline](#-analysis-pipeline) · [Project structure](#-project-structure) · [Data & reports](#-data--reports) · [Security](#-security) · [Scripts](#-npm-scripts) · [Limitations](#-limitations--roadmap) · [Disclaimer](#-disclaimer)

 **For step‑by‑step install, build and run commands, see [`setup.md`](setup.md).**

---

##  Overview

When an incident is reported, an investigator is handed raw material — logs pulled off a
machine, a network capture, files of unknown intent — and must answer one question fast:
*where is the actual threat in here?* Doing that by hand is slow, and real signal hides in
the noise. CyberTriage automates that **first triage pass**:

```
  Evidence                  Python analysis engine                Results
  ─────────                 ──────────────────────                ───────
  logs  ┐                   parse → heuristics → IOC              risk score + severity
  files ├──▶ case ────────▶ detection → ML anomaly ────────▶     "why" reasons + next steps
  .json ┘                   scoring → recommendations             dashboard · timeline
                            → timeline → reports                  network map · PDF/JSON/CSV
```

1. **Collect** evidence into a case (files or whole folders; SHA‑256/MD5 hashed on import).
2. **Analyze** automatically — one click parses every item, applies heuristics, extracts IOCs and scores each artifact with an ML anomaly detector.
3. **Prioritize** via a composite **risk score (0–100)** + severity, a plain‑language *why*, and ranked recommendations.
4. **Review** in a dashboard, per‑artifact tables, an interactive **timeline**, and a live **network topology map**.
5. **Report** — export the case as **PDF, JSON, or CSV**.

---

##  Features

| Area | What you get |
| --- | --- |
| **Evidence intake** | Import files or folders; recursive directory scan; SHA‑256 + MD5 hashing |
| **Multi‑parser analysis** | Dedicated parsers for files, logs, and network captures |
| **IOC detection** | Regex extraction of IPs, URLs, domains and hashes with risk ratings |
| **ML anomaly scoring** | Real scikit‑learn **Isolation Forest** over 12 features, normalized 0–100 |
| **Composite risk** | Weighted 0–100 score, severity (LOW→CRITICAL), "why this score" reasons |
| **Recommendation engine** | Finding → prioritized investigator next‑step |
| **Interactive timeline** | Unified, time‑sorted view of files, logs, IOCs and connections |
| **Network topology map** | Live SVG graph of hosts & conversations; flagged links glow and animate |
| **Reporting** | One‑click PDF / JSON / CSV export |
| **SOC‑style UI** | Animated network‑mesh backdrop, live command bar, risk gauges & charts |
| **Self‑contained app** | Packaged DMG bundles the frozen Python engine — no Python needed to run it |

---

##  Quick start

> Full details, prerequisites and troubleshooting live in **[`setup.md`](setup.md)**.

**Run from source** (Apple Silicon Mac, Node 20.19+, Python 3.10+):

```bash
npm install
python3 -m venv python/venv && python/venv/bin/pip install -r requirements.txt
npm run electron:dev
```

Then in the app: **create a case → Load sample data → Run analysis**.

**Build the shareable DMG:**

```bash
npm run package:mac-arm64   # freeze engine + build + package
npm run resign              # ad-hoc sign → release/CyberTriage-1.0.0-arm64-signed.dmg
```

**Install the DMG:** drag to Applications, then first‑launch with **right‑click → Open**
(one‑time Gatekeeper bypass, since the app isn't notarized). See [`setup.md`](setup.md#a--install-the-dmg).

---

##  Architecture

Four cooperating pieces, plus the IPC glue that connects them:

| # | Component | Technology | Responsibility |
| --- | --- | --- | --- |
| 1 | **Desktop shell** | Electron 44 (TS) | App window; spawns/supervises/restarts the engine; native dialogs; secure bridge |
| 2 | **User interface** | React 19 + Vite + Recharts | Dashboard, cases, result tables, timeline, network map, charts, exports |
| 3 | **Analysis engine** | Python 3 (`scikit-learn`, `reportlab`) | Parsing → heuristics → IOC → ML → risk → recommendations → timeline → reports |
| 4 | **Case database** | SQLite | Local storage: cases, evidence, findings, audit log |
| + | **IPC bridge** | Electron preload + stdin/stdout JSON | The only channel between UI and engine |

```
┌─────────────────────────────── Electron ────────────────────────────────┐
│   Renderer (React, src/)                Main process (electron/main.ts)   │
│   ┌──────────────────────────┐         ┌──────────────────────────┐      │
│   │  window.api (preload)    │◀──IPC──▶│  window · engine spawn    │      │
│   │  contextIsolation: true  │         │  ipcMain · native dialogs │      │
│   └──────────────────────────┘         └────────────┬─────────────┘      │
└──────────────────────────────────────────────────── │ spawn (no shell) ──┘
                                                       ▼
                            ┌────────────────────────────────────┐
                            │  Python engine (python/main.py)     │
                            │  JSON command ─▶ stdin              │
                            │  JSON result  ◀─ stdout             │
                            └───────────────┬────────────────────┘
                                            ▼
                    ┌────────────────────────────────────────────┐
                    │  SQLite (cybertriage.db) · reports (PDF/…)  │
                    └────────────────────────────────────────────┘
```

The engine speaks **newline‑delimited JSON** and has no idea whether it's talking to
Electron or your terminal — so the analysis logic and the UI are fully decoupled and can
be tested independently. Packaged builds freeze the engine into a standalone binary with
**PyInstaller**, so end users need no Python.

---

##  Analysis pipeline

`run_analysis` orchestrates the full pipeline over every imported item:

1. **Parse** by type — directories (recursive scan), `.log`/`.txt`/`.csv` (log parser), `.json` (network parser), everything else (file metadata).
2. **File heuristics** — suspicious extensions, double extensions (`invoice.pdf.exe`), hidden files, executable permissions, tiny executables.
3. **Log patterns** — repeated failed logins, repeated attempts from one IP, activity during unusual hours.
4. **Network analysis** — suspicious ports (4444, 1337, 3389, …), high‑frequency talkers (possible C2/exfil/scan), external destinations.
5. **IOC detection** — regex IPs / URLs / domains / hashes, cross‑referenced against built‑in demo lists.
6. **ML anomaly** — scikit‑learn Isolation Forest (100 estimators) over 12 features → 0–100.
7. **Composite risk** — weighted, capped contributions → 0–100 + severity:

   | Signal | Max | | Score | Severity |
   | --- | --- | --- | --- | --- |
   | High/medium IOCs | 30 | | 81–100 | CRITICAL |
   | Suspicious files | 25 | | 61–80 | HIGH |
   | Log patterns | 20 | | 31–60 | MEDIUM |
   | Network anomalies | 15 | | 0–30 | LOW |
   | ML anomaly score | 10 | | | |

8. **Recommendations** — each finding maps to a prioritized next step.
9. **Timeline** — file, log, IOC and network events merged, time‑sorted.
10. **Audit trail** — every case action is logged with a timestamp.

> On the bundled sample data this yields ≈ **9 artifacts, 16 IOCs, 123 timeline events,
> risk 89/100 (CRITICAL)** — reproducible from a fresh database.

Full JSON action reference and CLI usage: see the collapsible block in [`setup.md`](setup.md#b--run-from-source).

---

##  Project structure

```
CYBERTRIAGE/
├── electron/
│   ├── main.ts                 # Main process — window, engine lifecycle, ipcMain
│   └── preload.ts              # contextBridge — minimal window.api (CJS)
├── src/                        # React renderer
│   ├── App.tsx                 # Shell: sidebar, top command bar, routes
│   ├── api.ts / types.ts       # Typed bridge wrappers + shared types
│   ├── components/
│   │   ├── ui.tsx              # Panels, badges, gauge, states
│   │   ├── CyberBackground.tsx # Animated network-mesh canvas backdrop
│   │   ├── TopBar.tsx          # SOC command bar (clock, session, ticker)
│   │   └── NetworkGraph.tsx    # SVG network topology map
│   ├── pages/                  # Dashboard, Cases, CaseDetail, Help
│   └── index.css               # Application styling
├── python/                     # Analysis engine (JSON over stdin/stdout)
│   ├── main.py · analyzer/core.py
│   ├── parsers/ · ioc/ · ml/ · risk/ · recommendations/ · timeline/ · reports/
│   └── utils/                  # db.py (SQLite), hashing.py
├── database/schema.sql         # SQLite schema (auto-applied)
├── sample-data/                # Synthetic demo evidence (files/ logs/ network/)
├── scripts/
│   ├── build-electron.mjs      # esbuild → dist-electron/main.cjs, preload.cjs
│   └── resign-dmg.sh           # Ad-hoc sign + friendly DMG packaging
├── setup.md                    # ← install / build / run commands
├── package.json · requirements.txt
```

---

##  Data & reports

| Data | From source (dev) | Installed app (DMG) |
| --- | --- | --- |
| Case database (`cybertriage.db`) | project root | `~/Library/Application Support/CyberTriage/` |
| Reports (PDF/JSON/CSV) | `python/reports_output/` | `…/Application Support/CyberTriage/reports/` |
| Sample data / schema / engine | project folders | inside the app bundle (`…/Contents/Resources/`) |

**8 SQLite tables:** `cases`, `evidence`, `artifacts`, `ioc_findings`, `network_activity`,
`risk_findings`, `timeline_events`, `audit_log`. Evidence is stored **by reference**
(path + results), not copied. Re‑running analysis **replaces** a case's derived results.

**Report formats:** `pdf` (formatted investigation report), `json` (full machine‑readable
export), `csv` (a folder of `artifacts.csv`, `iocs.csv`, `timeline.csv`).

Reset locations and commands: [`setup.md`](setup.md#reset--troubleshooting).

---

##  Security

- `contextIsolation: true`, `nodeIntegration: false` — renderer can't reach Node/Electron internals.
- The preload exposes a deliberately **small** `window.api`; all engine calls go through one `ipcMain` channel.
- The Python engine is spawned **without a shell** (argument array), so paths can't be interpreted as commands.
- Strict **Content‑Security‑Policy** (`script-src 'self'`, no `unsafe-eval`) in `index.html`.

*Prototype trade‑offs:* the engine channel is generic (a production build should allow‑list
actions); the SQLite database and reports are unencrypted local files; the DMG is ad‑hoc
signed, not notarized.

---

##  npm scripts

| Script | What it does |
| --- | --- |
| `npm run electron:dev` | Full desktop app in development (Vite + Electron + engine) |
| `npm run dev` | Frontend only in a browser (no engine) |
| `npm run build` | Type‑check + production web bundle → `dist/` |
| `npm run preview` | Serve the production bundle |
| `npm run lint` | Fast lint (oxlint) |
| `npm run build:engine` | Freeze the Python engine to a standalone binary (PyInstaller) |
| `npm run package:mac-arm64` | Freeze engine + build + package → `release/…arm64.dmg` |
| `npm run resign` | Ad‑hoc sign + build the friendly shareable DMG |

---

##  Limitations & roadmap

- **No RAW/disk‑image parsing** *(roadmap)* — evidence is imported as files/folders; `dd`/E01 images aren't mounted or carved. Biggest missing piece from the brief.
- **No registry parsing** *(roadmap)* — Windows hives aren't parsed yet.
- **Apple Silicon only** — the DMG is arm64; a universal build needs the engine frozen for x86_64 too.
- **Not notarized** — no paid Apple Developer account, so recipients do a one‑time Gatekeeper bypass.
- **ML is assistive** — flags *statistical* unusualness, not confirmed malice; trained per‑run (needs ≥ 2 artifacts).
- **IOC "known‑bad" lists are tiny demo placeholders**, not threat‑intel feeds.
- **Evidence is referenced, not copied** — moving/deleting an original breaks re‑analysis.
- **No test suite yet** (`pytest` is installed); `tailwindcss`/`postcss` are present but unused (UI is plain CSS).

---

##  Disclaimer

CyberTriage is a **student prototype** inspired by the published DFIR problem statement. It
is **not** an official product of the National Investigation Agency (NIA) and must not be
used for real investigations or court‑admissible evidence handling. ML‑assisted findings
indicate statistical unusualness, **not** confirmed malicious activity.
