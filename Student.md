# CyberTriage: Student Project Guide

## 1. What this project is

CyberTriage is a **desktop digital-forensics triage application**.

In simple words: it lets an investigator create a case, add evidence files, run an automated first-pass analysis, and view the results in one desktop application.

The application can inspect sample files, logs, and network data. It then finds suspicious indicators, gives an anomaly score, creates a timeline, calculates an overall risk score, and can export a report.

This is a **student prototype for learning and demonstration**. It is not an official NIA product, it is not a replacement for a trained investigator, and its results are not court-admissible evidence. The included evidence files are synthetic demonstration data.

---

## 2. The main idea

A forensic investigation can contain many files and many small clues. Looking at everything manually takes time. CyberTriage helps with the first review.

The user can do this:

1. Open the CyberTriage desktop app.
2. Create a case, such as `Finance Laptop Review`.
3. Import files or load the bundled sample evidence.
4. Press **Run analysis**.
5. Review files, indicators, network activity, a timeline, and risk results.
6. Export a PDF, JSON, or CSV report.

The app does **triage**, not final investigation. Triage means quickly identifying what may need closer human attention.

---

## 3. Technology used

| Part | Technology | Simple explanation |
| --- | --- | --- |
| Desktop window | Electron | Opens the project as a real desktop application instead of a normal website. |
| User interface | React + TypeScript | Draws the pages, buttons, tables, charts, and forms. |
| Development web server | Vite | Quickly serves the React interface while developing. |
| Analysis engine | Python | Reads evidence and performs the forensic analysis. |
| Local database | SQLite | Stores cases, evidence records, findings, timelines, and audit history. |
| Machine-learning scoring | scikit-learn | Uses Isolation Forest to produce anomaly scores. |
| PDF reports | ReportLab | Creates PDF reports. |
| macOS installer | Electron Builder + PyInstaller | Packages the app and Python engine into an Apple Silicon DMG. |

---

## 4. The project in one picture

```text
User
  |
  v
React user interface
(src/)
  |
  | window.api calls
  v
Electron preload bridge
(electron/preload.ts)
  |
  | Electron IPC
  v
Electron main process
(electron/main.ts)
  |
  | JSON messages over Python stdin/stdout
  v
Python analysis engine
(python/main.py)
  |
  v
CaseAnalyzer and analysis modules
(python/analyzer/, python/parsers/, python/ioc/, python/ml/)
  |
  v
SQLite database + report files
(cybertriage.db, python/reports_output/)
```

The important point is that the React interface does **not** directly run Python code. Electron sits between them and passes messages safely.

---

## 5. What we built first, then next

This is the logical order in which the project was assembled and improved.

### Step 1: Create the desktop application shell

First, the project needed an Electron window.

- `electron/main.ts` creates the desktop window.
- `package.json` tells Electron that `electron/main.ts` is the application entry point.
- Electron loads the React interface into that window.

At this stage, the app was mainly a desktop window with a basic project structure.

### Step 2: Add the Python analysis engine

Next, we created the Python side of the application.

- `python/main.py` is the entry point for the engine.
- It stays running while the desktop app is open.
- It receives one JSON command at a time on standard input.
- It sends one JSON response at a time on standard output.

For example, Electron can send:

```json
{"id": 1, "action": "create_case", "payload": {"name": "Demo case"}}
```

Python sends a response back with the same `id`.

### Step 3: Connect Electron to Python

A desktop app needs a controlled way for the interface to request work from the Python engine.

We added three connected pieces:

1. `electron/preload.ts` exposes a very small safe API named `window.api` to React.
2. `electron/main.ts` receives requests through Electron IPC.
3. `electron/main.ts` sends the request to Python as a JSON line and waits for Python's JSON answer.

This is the connection between the interface and the analysis engine.

### Step 4: Build the React screens

After the connection worked, we built the visible user interface.

- `src/App.tsx` contains the main application layout, navigation, and engine-status pill.
- `src/pages/Cases.tsx` contains case creation and the case list.
- `src/pages/CaseDetail.tsx` is the working area for evidence, results, and exports.
- `src/pages/Dashboard.tsx` shows the dashboard charts and summary values.
- `src/components/` contains smaller reusable visual pieces.

### Step 5: Add case and evidence storage

The app needed to remember data after actions are completed.

- `database/schema.sql` defines the SQLite tables.
- `python/utils/db.py` opens the database and applies the schema when needed.
- The database stores cases, evidence, artifacts, IOC findings, network activity, timeline events, risk findings, and audit log entries.

### Step 6: Add evidence analysis

We then built the analysis pipeline.

- File parsing: `python/parsers/file_parser.py`
- Log parsing: `python/parsers/log_parser.py`
- Network parsing: `python/parsers/network_parser.py`
- IOC detection: `python/ioc/detector.py`
- ML anomaly scoring: `python/ml/anomaly_detector.py`
- Risk score: `python/risk/scorer.py`
- Recommendations: `python/recommendations/engine.py`
- Timeline creation: `python/timeline/builder.py`
- Report export: `python/reports/generator.py`

`python/analyzer/core.py` brings all of those modules together.

### Step 7: Add synthetic evidence and reports

The project includes safe sample evidence under `sample-data/` so the app can be demonstrated without real sensitive files.

It can export:

- PDF report
- JSON report
- CSV report files

### Step 8: Fix development and packaging problems

The final stage was making the application reliable to run locally and package as a DMG.

This included fixing the Electron preload bridge, Vite port conflicts, Python runtime paths, packaged resources, report locations, and macOS packaging.

The major fixes are explained later in this guide.

---

## 6. Folder map: where each part of the code is

```text
CYBERTRIAGE/
├── electron/
│   ├── main.ts                 Electron main process and Python process manager
│   └── preload.ts              Safe bridge from React to Electron
├── src/
│   ├── main.tsx                React starting point
│   ├── App.tsx                 Main layout, routes, engine status
│   ├── api.ts                  React functions that call window.api
│   ├── pages/
│   │   ├── Dashboard.tsx        Dashboard screen
│   │   ├── Cases.tsx            Create/list cases screen
│   │   └── CaseDetail.tsx       Evidence, analysis results, exports
│   ├── components/             Reusable interface components
│   ├── types.ts                Shared TypeScript data types
│   └── index.css               Main styling
├── python/
│   ├── main.py                 Python engine entry point and action router
│   ├── analyzer/core.py        Main CaseAnalyzer class and analysis flow
│   ├── parsers/                File, log, and network parsers
│   ├── ioc/detector.py         Indicator-of-compromise detection
│   ├── ml/anomaly_detector.py  Isolation Forest anomaly scoring
│   ├── risk/scorer.py          Overall risk score
│   ├── recommendations/        Suggested next investigation steps
│   ├── timeline/builder.py     Unified timeline builder
│   ├── reports/generator.py    PDF, JSON, and CSV report creation
│   └── utils/db.py             SQLite setup helpers
├── database/schema.sql         SQLite table definitions
├── sample-data/                Safe synthetic evidence for demonstration
├── scripts/
│   ├── build-electron.mjs      Compiles Electron files for packaged use
│   └── check-dev-port.mjs      Prevents a confusing Vite port conflict
├── package.json                npm commands and Electron Builder settings
├── requirements.txt            Python dependencies
├── README.md                   Project readme for running and architecture
└── Student.md                  This student-focused explanation
```

---

## 7. How the desktop app starts

The normal development command is:

```bash
npm run electron:dev
```

That command is defined in `package.json`.

It does these things in order:

1. Runs `scripts/check-dev-port.mjs`.
   - This checks that port `5173` is free.
   - Port 5173 is where the React development server must run.
2. Runs `npm run build:electron`.
   - This compiles the Electron main process and preload bridge into `dist-electron/`.
3. Starts Vite.
   - Vite serves the React interface at `http://localhost:5173`.
4. Waits until Vite is ready.
5. Starts Electron.
6. Electron creates the desktop window.
7. Electron starts the Python engine.
8. Python prints a ready message.
9. The React sidebar displays **Engine ready**.

Use `npm run electron:dev` for the full application.

`npm run dev` starts only the React/Vite website. It is useful for visual UI work, but it does not include Electron or Python. Because of that, it cannot use the analysis features.

---

## 8. How the components connect to one another

### 8.1 React to the preload bridge

React calls functions from `src/api.ts`.

For example:

```ts
runAnalysis(caseId)
```

in `src/api.ts` becomes an internal call to:

```ts
window.api.engineRequest('run_analysis', { case_id: caseId })
```

React does not receive direct Node.js or Python access. It only receives the small set of approved functions in `window.api`.

### 8.2 Preload bridge to Electron main process

`electron/preload.ts` creates `window.api` with `contextBridge.exposeInMainWorld`.

The bridge exposes only these kinds of operations:

- check or restart engine status
- send an engine request
- listen for engine status updates
- open a native file-picker dialog
- choose where to save a report
- reveal a report in Finder

When React calls `window.api.engineRequest(...)`, preload uses `ipcRenderer.invoke(...)` to send the request to Electron.

### 8.3 Electron main process to Python

`electron/main.ts` registers an IPC handler named `engine:request`.

The flow is:

```text
React
  -> src/api.ts
  -> window.api.engineRequest(...)
  -> preload ipcRenderer.invoke('engine:request', ...)
  -> main-process ipcMain handler
  -> PythonEngine.request(...)
  -> Python stdin JSON line
```

The `PythonEngine` class in `electron/main.ts` gives each request an ID. It remembers which request is waiting, reads Python's response, matches the response ID, and sends the result back to React.

### 8.4 Python to the database and analysis modules

`python/main.py` reads JSON commands and checks the `action` field.

For example:

```text
run_analysis
```

calls:

```py
CaseAnalyzer.run_full_analysis(case_id)
```

inside `python/analyzer/core.py`.

`CaseAnalyzer` then calls parser, IOC, ML, risk, recommendation, timeline, and report modules. It stores results in SQLite.

### 8.5 Results travel back to the screen

The response returns through the same path in reverse:

```text
Python JSON response
  -> Electron main process
  -> preload bridge
  -> src/api.ts Promise result
  -> React state update
  -> tables, charts, and risk cards on screen
```

---

## 9. Example: what happens when the user presses “Run analysis”

This is the most important complete flow to understand.

### User action

The user opens a case and presses **Run analysis** in `src/pages/CaseDetail.tsx`.

### React request

The page calls `runAnalysis(caseId)` from `src/api.ts`.

### Secure desktop bridge

`src/api.ts` calls `window.api.engineRequest('run_analysis', ...)`.

`electron/preload.ts` forwards that request to Electron using IPC.

### Electron forwards it to Python

`electron/main.ts` receives the `engine:request` IPC message.

The `PythonEngine` class writes a line like this to Python:

```json
{"id": 12, "action": "run_analysis", "payload": {"case_id": "CT-2026-ABC123"}}
```

### Python performs the work

`python/main.py` receives the command and calls:

```py
analyzer.run_full_analysis(case_id)
```

in `python/analyzer/core.py`.

### The analysis pipeline

`CaseAnalyzer.run_full_analysis()` does this:

1. Gets evidence for the selected case from SQLite.
2. Clears previous derived analysis results for that case.
3. Detects whether each item is a directory, text/log file, JSON file, or normal file.
4. Parses file metadata and content.
5. Parses logs for suspicious patterns and failed logins.
6. Parses network JSON/CSV when applicable.
7. Detects IOCs such as IP addresses, URLs, domains, hashes, and suspicious strings.
8. Creates features for anomaly scoring.
9. Runs Isolation Forest through `python/ml/anomaly_detector.py`.
10. Saves artifact findings, IOC findings, and network records in SQLite.
11. Calculates the overall risk score.
12. Produces recommendations.
13. Builds a unified timeline.
14. Saves the final results.
15. Returns counts, risk information, recommendations, and anomaly information.

### The user sees the result

React receives the JSON result and refreshes the Evidence, Artifacts, IOCs, Timeline, Network, and Risk tabs.

---

## 10. What each screen does

### Overview dashboard

File: `src/pages/Dashboard.tsx`

This screen gives a quick case summary. It can show:

- total evidence count
- artifact count
- IOC count
- timeline event count
- overall risk score
- severity charts
- IOC charts
- timeline activity

### Cases screen

File: `src/pages/Cases.tsx`

This screen lets the user:

- create a new case
- enter case name, description, and investigator name
- see previously created cases
- open a selected case

### Case detail screen

File: `src/pages/CaseDetail.tsx`

This is the main work screen. It contains tabs for:

- Evidence
- Artifacts
- IOCs
- Timeline
- Network
- Risk

It also contains actions for:

- importing evidence
- loading sample data
- running analysis
- exporting PDF, JSON, or CSV reports

---

## 11. How evidence is analyzed

### File analysis

File: `python/parsers/file_parser.py`

The file parser can collect file details such as name, extension, size, hashes, and suspicious characteristics.

### Log analysis

File: `python/parsers/log_parser.py`

The log parser reads log lines and looks for patterns such as failed logins and unusual activity. It can extract timestamps and IP addresses for timeline creation.

### Network analysis

File: `python/parsers/network_parser.py`

The network parser reads supported JSON or CSV network data. It stores source IP, destination IP, protocol, ports, transferred bytes, and anomaly flags.

### IOC detection

File: `python/ioc/detector.py`

An IOC is an indicator of compromise. Examples include:

- suspicious IP address
- suspicious domain
- URL
- file hash
- suspicious command or pattern

The detector finds these clues in text and supported evidence content.

### Machine-learning anomaly score

File: `python/ml/anomaly_detector.py`

The project uses scikit-learn Isolation Forest. It does not claim to “prove malware.” It identifies data that looks unusual compared with the other evidence items.

The anomaly score is one input to the final risk score.

### Risk calculation

File: `python/risk/scorer.py`

The risk scorer combines:

- IOC risk
- suspicious file findings
- suspicious log patterns
- network anomalies
- ML anomaly score

It returns a numeric risk score and a severity such as LOW, MEDIUM, HIGH, or CRITICAL.

### Recommendations

File: `python/recommendations/engine.py`

The recommendation engine suggests next steps, such as reviewing a suspicious file, isolating a system, checking an account, or validating a network connection.

### Timeline

File: `python/timeline/builder.py`

The timeline builder combines timestamps from files, logs, IOCs, and network records into one chronological list.

---

## 12. Database: what is saved

The database schema is in `database/schema.sql`.

The main SQLite file is named `cybertriage.db`.

In development, it is stored in the project folder. In the packaged application, Electron stores writable data in the operating system's application-data folder instead of inside the DMG.

Important tables include:

| Table | What it stores |
| --- | --- |
| `cases` | Case name, investigator, status, and timestamps |
| `evidence` | Imported evidence records and analysis status |
| `artifacts` | Parsed file findings and anomaly scores |
| `ioc_findings` | Detected IPs, URLs, domains, hashes, and related risk |
| `network_activity` | Parsed network records |
| `timeline_events` | Combined chronological events |
| `risk_findings` | Overall risk score, reasons, and recommendations |
| `audit_log` | Important user/system actions for the case |

SQLite was chosen because it is local, simple, and does not need a separate database server.

---

## 13. Reports

Report code is in `python/reports/generator.py`.

The available report formats are:

- **PDF**: readable summary for a person
- **JSON**: structured machine-readable data
- **CSV**: spreadsheet-friendly files

The report flow is:

```text
User presses Export
  -> React asks Electron for a save location
  -> Electron opens the native save dialog
  -> React sends generate_report to Python
  -> Python creates the selected report files
  -> Electron can reveal the exported file in Finder
```

In development, reports normally go under `python/reports_output/` when no custom location is chosen. In the packaged app, reports use a writable user-data location.

---

## 14. Security decisions in the desktop app

Electron can be dangerous if the user interface gets unrestricted system access. This project uses a safer pattern.

In `electron/main.ts`:

```ts
contextIsolation: true
nodeIntegration: false
```

This means React cannot directly use Node.js APIs such as filesystem access or process spawning.

Instead, `electron/preload.ts` exposes only the limited functions needed by the app. This is why the project uses `window.api` rather than letting React import Electron directly.

This design reduces the chance that a normal webpage bug gives full system access.

---

## 15. Major errors we encountered and how we solved them

### Error 1: “Desktop bridge unavailable” appeared in the Electron window

**What happened**

The React interface showed this message:

```text
Desktop bridge unavailable — run the app with "npm run electron:dev".
```

The message means `window.api` was missing. Without `window.api`, React cannot contact Electron or Python.

**Why it happened**

In development, Electron was being given `electron/preload.ts` directly as the preload file. The preload process must receive executable JavaScript, not a raw TypeScript file in this setup.

**How we solved it**

1. Added `scripts/build-electron.mjs`.
2. Used esbuild to compile `electron/preload.ts` into `dist-electron/preload.cjs`.
3. Changed `electron/main.ts` to load `dist-electron/preload.cjs` in development.
4. Changed `npm run electron:dev` so it always runs `npm run build:electron` first.

**Result**

The Electron renderer was verified with:

```text
hasApi: true
engine: ready
```

This proves that React receives `window.api` and can reach the running Python engine.

---

### Error 2: Vite silently changed from port 5173 to port 5174

**What happened**

An older Vite process was already using port 5173. When a new Vite process started, Vite automatically moved itself to port 5174.

Electron was still configured to load:

```text
http://localhost:5173
```

So Electron could load an old browser-only development server instead of the intended new one. This made the application confusing and could show the bridge warning.

**How we solved it**

1. Added `scripts/check-dev-port.mjs`.
2. It checks both IPv4 and IPv6 localhost addresses for port 5173.
3. The `electron:dev` command uses Vite's `--strictPort` option.
4. If port 5173 is already taken, the command stops with a clear message instead of using port 5174.

**What to do as a user**

Stop the old Vite/Electron terminal with `Ctrl+C`, then run:

```bash
npm run electron:dev
```

---

### Error 3: TypeScript reported implicit `any` errors in preload code

**What happened**

After Electron files were included in TypeScript checking, the preload callbacks had untyped parameters.

**How we solved it**

`electron/preload.ts` now gives types to its action, payload, callback, and `IpcRendererEvent` parameters.

**Result**

`npm run build` completes TypeScript checking successfully.

---

### Error 4: Python compile checking entered the virtual environment

**What happened**

A broad Python compile command scanned `python/venv/`, which includes third-party packages. A system Python version encountered syntax in a dependency that it did not understand.

**Why this was misleading**

The project source code itself was not the problem. The check was scanning installed packages instead of just our project files.

**How we solved it**

The verification method was corrected to compile only the project Python source and to exclude `python/venv/`.

---

### Error 5: A packaged Electron app did not include the Python engine

**What happened**

A normal Electron package can include the React files but not automatically include a separate Python runtime, its dependencies, the SQLite schema, or sample evidence.

Without those resources, the packaged app would open but could not perform analysis on another computer.

**How we solved it**

1. Added PyInstaller to `requirements.txt`.
2. Added `npm run build:engine` to freeze Python into a standalone `CyberTriageEngine` binary.
3. Added `scripts/build-electron.mjs` to compile Electron files for packaging.
4. Added Electron Builder configuration in `package.json`.
5. Added the Python engine, database schema, and sample data under Electron Builder `extraResources`.

**Result**

The packaged application includes:

```text
Contents/Resources/engine/CyberTriageEngine
Contents/Resources/database/schema.sql
Contents/Resources/sample-data/
```

---

### Error 6: A packaged app cannot write into the DMG/application bundle

**What happened**

The application bundle and mounted DMG are not safe locations for a working SQLite database or generated reports.

**How we solved it**

`electron/main.ts` now separates read-only resources from writable user data.

- Packaged engine/schema/sample data are read from `process.resourcesPath`.
- Database and reports use Electron's `app.getPath('userData')`.
- Electron passes these locations to Python through environment variables:
  - `CYBERTRIAGE_DATA_DIR`
  - `CYBERTRIAGE_RESOURCES_DIR`
  - `CYBERTRIAGE_REPORTS_DIR`

`python/main.py` reads those variables and uses the correct paths.

---

### Error 7: Re-running analysis could keep old risk results

**What happened**

A case can be analyzed more than once. If derived findings are not cleared first, the database can contain stale or duplicated results.

**How we solved it**

Before a new analysis, `CaseAnalyzer.run_full_analysis()` clears old derived data for that case, including:

- artifacts
- IOC findings
- timeline events
- network activity
- risk findings

The current run then saves fresh results.

---

### Error 8: PyInstaller warned about missing Torch while collecting scikit-learn

**What happened**

PyInstaller produced a warning while examining an optional scikit-learn compatibility path related to Torch.

**Why it was not a project failure**

CyberTriage does not use Torch. The required frozen engine still started successfully and passed its IPC smoke test.

**What we did**

We recorded the warning but did not add an unnecessary Torch dependency.

---

### Error 9: Code signing and Gatekeeper distribution are separate from creating a DMG

**What happened**

The project successfully creates a working Apple Silicon DMG, but macOS public distribution normally also requires a valid Apple Developer **Developer ID Application** certificate and Apple notarization.

No valid Developer ID signing identity was available on this machine.

**Current honest status**

- The working DMG is at `release/CyberTriage-1.0.0-arm64.dmg`.
- It is for Apple Silicon (`arm64`) Macs.
- The functional packaged app and analysis flow were tested.
- It is not Developer ID signed or notarized for universal Gatekeeper-trusted sharing.

For a class demonstration on a compatible Mac, the DMG is useful. For broad public distribution, the owner must add Apple Developer signing and notarization credentials.

---

## 16. Commands to run the project locally

Run these commands from the project root.

### One-time setup

```bash
npm install
python3 -m venv python/venv
python/venv/bin/pip install -r requirements.txt
```

### Start the complete desktop application

```bash
npm run electron:dev
```

### Build the project

```bash
npm run build
```

### Check code quality

```bash
npm run lint
```

### Create the Apple Silicon DMG

```bash
npm run package:mac-arm64
```

The output is:

```text
release/CyberTriage-1.0.0-arm64.dmg
```

---

## 17. How to give a simple project demonstration

A clear classroom demonstration can follow this order:

1. Explain that CyberTriage is a desktop tool for first-pass digital-forensics triage.
2. Run `npm run electron:dev`.
3. Point out the **Engine ready** status in the sidebar.
4. Create a new case.
5. Open the case.
6. Click **Load sample data**.
7. Explain that the included data is synthetic and safe for demonstration.
8. Click **Run analysis**.
9. Show the Artifacts tab and explain that it lists parsed evidence findings.
10. Show the IOCs tab and explain that it identifies clues such as IPs, URLs, domains, and hashes.
11. Show the Timeline tab and explain that it combines events into time order.
12. Show the Network tab and explain that it displays parsed network connections.
13. Show the Risk tab and explain that the score combines several signals instead of depending on only one rule.
14. Export a PDF or JSON report.
15. Explain that Electron connects the React user interface to the Python analysis engine through a small secure bridge.

---

## 18. Important limitations to explain honestly

This project is useful for learning, but it has clear limits:

- It analyzes supported files and sample formats; it is not a full commercial forensic suite.
- IOC matches and anomaly scores are clues, not proof of malicious activity.
- The ML score is based on feature patterns and must be interpreted by a human.
- The app does not replace proper evidence acquisition, chain of custody, or legal forensic procedure.
- The sample evidence is synthetic.
- The generated DMG is currently Apple Silicon only.
- Public macOS sharing without Gatekeeper warnings requires Developer ID signing and notarization.

---

## 19. Short summary to remember

CyberTriage has three main layers:

```text
React shows the screens.
Electron safely connects the screens to system features and Python.
Python analyzes evidence and stores results in SQLite.
```

The most important call path is:

```text
React page
  -> src/api.ts
  -> electron/preload.ts
  -> electron/main.ts
  -> python/main.py
  -> python/analyzer/core.py
  -> database and analysis modules
  -> back to React as JSON results
```

If you remember that flow, you understand the core architecture of the project.
