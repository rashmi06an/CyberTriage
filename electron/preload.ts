const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  ping: () => ipcRenderer.invoke('ping'),
  engineRequest: (action, payload) => ipcRenderer.invoke('engine:request', action, payload),
  engineStatus: () => ipcRenderer.invoke('engine:status'),
  engineRestart: () => ipcRenderer.invoke('engine:restart'),
  onEngineState: (callback) => {
    const listener = (_event, state) => callback(state);
    ipcRenderer.on('engine:state', listener);
    return () => ipcRenderer.removeListener('engine:state', listener);
  },
  pickEvidence: () => ipcRenderer.invoke('dialog:pick-evidence'),
  saveReportDialog: (defaultName) => ipcRenderer.invoke('dialog:save-report', defaultName),
  revealPath: (targetPath) => ipcRenderer.invoke('shell:reveal', targetPath),
});
