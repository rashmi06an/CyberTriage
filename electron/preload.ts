import type { IpcRendererEvent } from 'electron';

const { contextBridge, ipcRenderer } = require('electron') as typeof import('electron');

type EngineState = {
  state: 'starting' | 'ready' | 'stopped' | 'error';
  detail: string;
};

contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('ping'),
  engineRequest: (action: string, payload: Record<string, unknown> = {}) =>
    ipcRenderer.invoke('engine:request', action, payload),
  engineStatus: () => ipcRenderer.invoke('engine:status'),
  engineRestart: () => ipcRenderer.invoke('engine:restart'),
  onEngineState: (callback: (state: EngineState) => void) => {
    const listener = (_event: IpcRendererEvent, state: EngineState) => callback(state);
    ipcRenderer.on('engine:state', listener);
    return () => ipcRenderer.removeListener('engine:state', listener);
  },
  pickEvidence: () => ipcRenderer.invoke('dialog:pick-evidence'),
  saveReportDialog: (defaultName: string) => ipcRenderer.invoke('dialog:save-report', defaultName),
  revealPath: (targetPath: string) => ipcRenderer.invoke('shell:reveal', targetPath),
});
