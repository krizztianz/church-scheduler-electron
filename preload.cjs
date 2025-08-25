// preload.cjs — expose safe APIs (generate/settings/pickers)
const { contextBridge, ipcRenderer } = require('electron');

const api = {
  generate: (formOrArgs) => {
    if (Array.isArray(formOrArgs)) return ipcRenderer.invoke('go:generate', { args: formOrArgs });
    return ipcRenderer.invoke('go:generate', { form: formOrArgs });
  },
  openOutputFolder: (outputPath) => ipcRenderer.invoke('open:output-folder', outputPath),
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: (cfg) => ipcRenderer.invoke('settings:save', cfg),
  pickFolder: () => ipcRenderer.invoke('dialog:pick-folder'),
  pickFile: (filters) => ipcRenderer.invoke('dialog:pick-file', { filters })
};

contextBridge.exposeInMainWorld('api', api);
