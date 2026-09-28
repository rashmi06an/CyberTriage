import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { spawn, type ChildProcess } from 'child_process';
import { existsSync } from 'fs';
import { createInterface } from 'readline';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, '..');
const ENGINE_SCRIPT = path.join(PROJECT_ROOT, 'python', 'main.py');

let mainWindow: BrowserWindow | null = null;

interface EngineState {
  state: 'starting' | 'ready' | 'stopped' | 'error';
  detail: string;
}

interface PendingRequest {
  resolve: (message: unknown) => void;
  reject: (error: Error) => void;
}

class PythonEngine {
  private proc: ChildProcess | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private readyPromise: Promise<void> | null = null;
  private readyResolve: (() => void) | null = null;
  private readyReject: ((error: Error) => void) | null = null;
  private stopping = false;
  private listeners = new Set<(state: EngineState) => void>();
  state: EngineState = { state: 'stopped', detail: 'Not started' };

  onState(listener: (state: EngineState) => void) {
    this.listeners.add(listener);
  }

  private setState(state: EngineState['state'], detail: string) {
    this.state = { state, detail };
    for (const listener of this.listeners) listener(this.state);
  }

  start() {
    if (this.proc) return;
    this.stopping = false;

    const dataDir = app.isPackaged ? app.getPath('userData') : PROJECT_ROOT;
    const resourcesDir = app.isPackaged ? process.resourcesPath : PROJECT_ROOT;
    const reportsDir = app.isPackaged ? path.join(dataDir, 'reports') : path.join(PROJECT_ROOT, 'python', 'reports_output');
    const enginePath = path.join(resourcesDir, 'engine', 'CyberTriageEngine');
    const venvPython = path.join(
      PROJECT_ROOT,
      'python',
      'venv',
      process.platform === 'win32' ? 'Scripts' : 'bin',
      process.platform === 'win32' ? 'python.exe' : 'python3'
    );
    const useVenv = existsSync(venvPython);
    const command = app.isPackaged ? enginePath : useVenv ? venvPython : 'python3';
    const args = app.isPackaged ? [] : [ENGINE_SCRIPT];
    const detail = app.isPackaged
      ? 'Starting bundled Python engine'
      : useVenv
        ? 'Starting Python engine (python/venv)'
        : 'Starting Python engine (system python3)';
    const setupHint = app.isPackaged
      ? 'The bundled analysis engine is missing. Reinstall CyberTriage from the release DMG.'
      : 'Install Python 3.10+, then run: python3 -m venv python/venv && python/venv/bin/pip install -r requirements.txt';
    this.setState('starting', detail);

    this.readyPromise = new Promise<void>((resolve, reject) => {
      this.readyResolve = resolve;
      this.readyReject = reject;
    });

    const proc = spawn(command, args, {
      cwd: dataDir,
      env: {
        ...process.env,
        CYBERTRIAGE_DATA_DIR: dataDir,
        CYBERTRIAGE_RESOURCES_DIR: resourcesDir,
        CYBERTRIAGE_REPORTS_DIR: reportsDir,
      },
    });
    this.proc = proc;

    createInterface({ input: proc.stdout! }).on('line', (line) => {
      if (this.proc !== proc) return;
      this.handleLine(line);
    });
    proc.stderr!.on('data', (chunk: Buffer) => {
      console.error(`[engine stderr] ${chunk.toString().trimEnd()}`);
    });
    proc.on('error', (error) => {
      if (this.proc !== proc) return;
      this.handleExit(`Failed to start the Python engine (${error.message}). ${setupHint}`);
    });
    proc.on('exit', (code, signal) => {
      if (this.proc !== proc) return;
      if (this.stopping) {
        this.proc = null;
        return;
      }
      this.handleExit(
        `Python engine exited unexpectedly (${signal ?? `code ${code}`}). Check the terminal for [engine stderr] output.`
      );
    });
  }

  private handleLine(line: string) {
    let message: Record<string, unknown>;
    try {
      message = JSON.parse(line);
    } catch {
      console.log(`[engine] ${line}`);
      return;
    }

    if (message.status === 'ready') {
      console.log(`[engine] ${line.trim()}`);
      this.setState('ready', String(message.engine ?? 'Engine ready'));
      this.readyResolve?.();
      this.readyResolve = null;
      this.readyReject = null;
      return;
    }

    const id = typeof message.id === 'number' ? message.id : null;
    if (id === null) {
      console.log(`[engine] ${line}`);
      return;
    }
    const pending = this.pending.get(id);
    if (!pending) return;
    this.pending.delete(id);
    pending.resolve(message);
  }

  private handleExit(detail: string) {
    this.proc = null;
    this.setState('error', detail);
    this.readyReject?.(new Error(detail));
    this.readyResolve = null;
    this.readyReject = null;
    for (const pending of this.pending.values()) pending.reject(new Error(detail));
    this.pending.clear();
  }

  private async waitUntilReady(timeoutMs = 30000) {
    if (this.state.state === 'ready') return;
    if (!this.proc) this.start();
    const ready = this.readyPromise ?? Promise.reject(new Error('Python engine is not running'));
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        ready,
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Python engine did not become ready within ${Math.round(timeoutMs / 1000)}s`)),
            timeoutMs
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async request(action: string, payload: Record<string, unknown> = {}): Promise<unknown> {
    await this.waitUntilReady();
    if (!this.proc) throw new Error('Python engine is not running');
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.proc!.stdin!.write(`${JSON.stringify({ id, action, payload })}\n`, (error) => {
        if (error) {
          this.pending.delete(id);
          reject(error);
        }
      });
    });
  }

  restart() {
    this.stop();
    this.start();
  }

  stop() {
    this.stopping = true;
    const proc = this.proc;
    this.proc = null;
    if (proc) {
      proc.stdin?.end();
      proc.kill();
    }
    for (const pending of this.pending.values()) pending.reject(new Error('Python engine stopped'));
    this.pending.clear();
    this.setState('stopped', 'Engine stopped');
  }
}

const engine = new PythonEngine();
engine.onState((state) => {
  mainWindow?.webContents.send('engine:state', state);
});

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b1220',
    title: 'CyberTriage',
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.cjs')
        : path.join(PROJECT_ROOT, 'dist-electron', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  if (!app.isPackaged) {
    mainWindow.loadURL('http://127.0.0.1:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function registerIpc() {
  ipcMain.handle('ping', () => 'pong');

  ipcMain.handle('engine:request', async (_event, action: string, payload: Record<string, unknown>) => {
    try {
      return await engine.request(action, payload ?? {});
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle('engine:status', () => engine.state);

  ipcMain.handle('engine:restart', () => {
    engine.restart();
    return engine.state;
  });

  ipcMain.handle('dialog:pick-evidence', async () => {
    const options = {
      title: 'Select evidence files or folders',
      buttonLabel: 'Import',
      properties: ['openFile', 'openDirectory', 'multiSelections'] as Array<'openFile' | 'openDirectory' | 'multiSelections'>,
    };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    return result.canceled ? [] : result.filePaths;
  });

  ipcMain.handle('dialog:save-report', async (_event, defaultName: string) => {
    const options = { title: 'Save report', defaultPath: defaultName };
    const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
    return result.canceled ? null : result.filePath;
  });

  ipcMain.handle('shell:reveal', (_event, targetPath: string) => {
    shell.showItemInFolder(targetPath);
  });
}

app.whenReady().then(() => {
  registerIpc();
  createWindow();
  engine.start();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('will-quit', () => {
  engine.stop();
});
